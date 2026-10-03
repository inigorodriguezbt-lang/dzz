// Map rendering shared by the full map (MapUI) and the minimap (HUD): relief tiles rendered by the world workers
// at three detail levels, then runways, building footprints, streets and roads as vectors, then place labels
// placed by priority so they never overlap. A paper map (docs/UI_DAYZ.md): dark inks on the cream tiles of
// maptile.js, names in condensed caps with a paper-coloured halo. Palette and sizes: docs/UI_SPEC.md 8.2.
const LEVELS = [ 64, 16, 4 ]; // metres per tile pixel
const TPX = 256;
const CELL = 2048; // vectors are bucketed in cells this many metres wide; only the cells on screen are drawn
const MARGIN = 300; // m a bucketed shape may reach outside its cell (long street segments, big buildings)
const FADE = 200; // ms for a finer tile to fade in over the coarser one under it

const INK = {
	void: '#89AABD', // off the world: the deepest sea stop of maptile.js, so the edge of the data never shows
	// main roads: a muted red line cased in dark ink; highways pale with the same casing; streets pale lines on the
	// darker built-up ground; dirt tracks dashed dark brown, as on a printed topographic map
	freewayCase: 'rgba(52,40,30,0.85)', freeway: '#B9604A',
	highwayCase: 'rgba(52,40,30,0.75)', highway: '#F4E8C6',
	street: 'rgba(251,247,236,0.95)', dirt: 'rgba(92,70,48,0.72)',
	building: 'rgba(84,76,68,0.72)', runway: 'rgba(120,112,100,0.8)',
	halo: 'rgba(240,234,214,0.85)', // around names: the paper colour
};
const FONT = "'Roboto Condensed', Roboto, system-ui, sans-serif";
const ALL = { roads: true, buildings: true };

// label classes: priority (lower wins a collision), zoom range it shows in (u per m), font weight/size (u), colour,
// caps: tracking in em for names set in capitals
const LABEL = {
	metro: { pri: 0, min: 0.016, font: '700 15', color: '#1C1814', caps: 0.06 },
	island: { pri: 1, min: 0, max: 0.12, font: '700 13', color: '#3A332B', caps: 0.24 },
	town: { pri: 2, min: 0.05, font: '700 12', color: '#1C1814', caps: 0.06 },
	water: { pri: 3, min: 0.016, font: 'italic 500 12', color: '#3C6378' },
	peak: { pri: 4, min: 0.03, font: '500 12', color: '#5A4430' },
	other: { pri: 5, min: 0.09, font: '500 12', color: '#2A241E' },
	area: { pri: 6, min: 0.05, font: 'italic 500 12', color: '#5C5448' },
};

const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * ( 3 - 2 * t ); };

// Path2D per CELL-sized square, keyed by cell index
class Buckets {
	constructor() { this.cells = new Map(); }
	key( i, j ) { return ( i + 512 ) * 1024 + j + 512; }
	at( x, z ) {
		const k = this.key( Math.floor( x / CELL ), Math.floor( z / CELL ) );
		let p = this.cells.get( k );
		if ( ! p ) { p = new Path2D(); this.cells.set( k, p ); }
		return p;
	}
	// a polyline: each segment goes to the cell of its midpoint, with a moveTo whenever the cell changes
	line( xs, zs, n ) {
		let cur = null;
		for ( let k = 1; k < n; k ++ ) {
			const p = this.at( ( xs( k - 1 ) + xs( k ) ) / 2, ( zs( k - 1 ) + zs( k ) ) / 2 );
			if ( p !== cur ) { p.moveTo( xs( k - 1 ), zs( k - 1 ) ); cur = p; }
			p.lineTo( xs( k ), zs( k ) );
		}
	}
	// calls fn( path ) for every cell touching the world rect
	each( x0, z0, x1, z1, fn ) {
		const i0 = Math.floor( ( x0 - MARGIN ) / CELL ), i1 = Math.floor( ( x1 + MARGIN ) / CELL );
		const j0 = Math.floor( ( z0 - MARGIN ) / CELL ), j1 = Math.floor( ( z1 + MARGIN ) / CELL );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const p = this.cells.get( this.key( i, j ) );
			if ( p ) fn( p );
		}
	}
}

export class MapView {
	constructor( app ) {
		this.app = app;
		this.world = app.world;
		this.meta = app.world.meta;
		this.hf = app.world.hf;
		this.tiles = new Map();
		this.pending = 0;
		this.frame = 0;
		this.version = 0; // bumps whenever a tile lands, so a static view knows to redraw
		this._widths = new Map();
		this._buildPaths();
		this._buildLabels();
		// the whole archipelago at the coarsest level first: finer tiles then only ever fade in over relief,
		// never over empty sea-coloured rectangles
		const size = LEVELS[ 0 ] * TPX;
		for ( let j = 0; j < Math.ceil( this.hf.halfZ * 2 / size ); j ++ ) for ( let i = 0; i < Math.ceil( this.hf.halfX * 2 / size ); i ++ ) this._tile( 0, i, j, 0 );
	}

	_buildPaths() {
		const m = this.meta;
		this.roads = { 4: new Buckets(), 2: new Buckets(), 1: new Buckets() };
		for ( const r of m.roads ) {
			const b = this.roads[ r.lanes ] || this.roads[ 2 ], P = r.pts;
			b.line( k => P[ k * 3 ], k => P[ k * 3 + 1 ], P.length / 3 );
		}
		// streets by width, so they can be drawn at their real width close up
		this.streets = new Map();
		for ( const s of m.streets ) {
			const w = s[ 7 ] || 10;
			if ( ! this.streets.has( w ) ) this.streets.set( w, new Buckets() );
			const b = this.streets.get( w );
			b.line( k => k ? s[ 4 ] : s[ 1 ], k => k ? s[ 5 ] : s[ 2 ], 2 );
		}
		this.buildings = new Buckets();
		const B = m.buildings.data, F = m.buildings.fields?.length || 11;
		for ( let i = 0; i < B.length; i += F ) {
			const x = B[ i ], z = B[ i + 1 ], w = B[ i + 2 ] / 2, d = B[ i + 3 ] / 2, a = B[ i + 4 ];
			const c = Math.cos( a ), s = Math.sin( a );
			// local x -> ( c, s ), local z -> ( -s, c ), as the buildings are baked
			const p = this.buildings.at( x, z );
			p.moveTo( x - w * c + d * s, z - w * s - d * c );
			p.lineTo( x + w * c + d * s, z + w * s - d * c );
			p.lineTo( x + w * c - d * s, z + w * s + d * c );
			p.lineTo( x - w * c - d * s, z - w * s + d * c );
			p.closePath();
		}
		this.runwayPath = new Path2D();
		for ( const r of m.runways ) {
			const c = Math.cos( r.angle ), s = Math.sin( r.angle ), L = r.len / 2, W = r.w / 2;
			const pt = ( u, v ) => [ r.x + u * c - v * s, r.z + u * s + v * c ];
			const p = [ pt( - L, - W ), pt( L, - W ), pt( L, W ), pt( - L, W ) ];
			this.runwayPath.moveTo( ...p[ 0 ] ); for ( let k = 1; k < 4; k ++ ) this.runwayPath.lineTo( ...p[ k ] ); this.runwayPath.closePath();
		}
	}

	_buildLabels() {
		const m = this.meta, out = [];
		for ( const i of m.islands ) out.push( { cls: LABEL.island, text: i.name.toUpperCase(), x: i.x, z: i.z, tie: 0 } );
		for ( const c of m.cities ) {
			// resorts like Waikīkī read as towns; bigger places win ties
			const cls = c.kind === 'metro' ? LABEL.metro : c.kind === 'town' || c.kind === 'resort' ? LABEL.town : LABEL.other;
			out.push( { cls, text: cls.caps ? c.name.toUpperCase() : c.name, x: c.x, z: c.z, tie: - ( c.radius || 0 ) / 1e4 } );
		}
		for ( const l of m.labels ) {
			const cls = l.kind === 'water' ? LABEL.water : l.kind === 'peak' ? LABEL.peak : LABEL.area;
			out.push( { cls, text: l.name, x: l.x, z: l.z, tie: 0, peak: l.kind === 'peak' } );
		}
		out.sort( ( a, b ) => a.cls.pri - b.cls.pri || a.tie - b.tie );
		this.labels = out;
	}

	// priority: lower runs sooner; the terrain streams at ~0..3, so a tile someone is looking at
	// shouldn't wait for the whole landscape to finish loading
	_tile( L, i, j, priority = 50 + L * 10 ) {
		const key = L + ':' + i + ':' + j;
		let t = this.tiles.get( key );
		if ( t ) {
			t.used = this.frame;
			if ( t.job && t.job.priority > priority ) t.job.priority = priority;
			return t;
		}
		const mpp = LEVELS[ L ], size = mpp * TPX;
		t = { img: null, used: this.frame, L, born: 0 };
		this.tiles.set( key, t );
		if ( ! this.world.pool ) return t;
		this.pending ++;
		const job = t.job = this.world.pool.submit( { type: 'maptile', x0: this.hf.x0 + i * size, z0: this.hf.z0 + j * size, size, px: TPX }, priority );
		job.promise.then( r => {
			this.pending --;
			if ( ! r ) { this.tiles.delete( key ); return; }
			const c = document.createElement( 'canvas' ); c.width = c.height = TPX;
			c.getContext( '2d' ).putImageData( new ImageData( r.rgba, TPX, TPX ), 0, 0 );
			t.img = c;
			t.job = null;
			t.born = performance.now();
			this.version ++;
		} ).catch( () => { this.pending --; this.tiles.delete( key ); } );
		return t;
	}

	_evict() {
		if ( this.tiles.size < 420 ) return;
		const arr = [ ...this.tiles.entries() ].filter( ( [ , t ] ) => t.L > 0 ).sort( ( a, b ) => a[ 1 ].used - b[ 1 ].used );
		for ( let k = 0; k < arr.length - 360; k ++ ) this.tiles.delete( arr[ k ][ 0 ] );
	}

	// view: { cx, cz, ppm, rot, w, h } in canvas px. opts: { labels = true, priority, u = canvas px per UI unit,
	// pxRatio = device px per canvas px (picks finer tiles), layers = { roads, buildings },
	// avoid = [ [ x0, y0, x1, y1 ] ] screen rects labels keep clear of (markers), under( ctx, toScreen ) }.
	// Returns { toScreen, toWorld, fading } (fading: a tile is still fading in, so a static view should redraw).
	draw( ctx, view, opts = {} ) {
		this.frame ++;
		const now = performance.now();
		const { cx, cz, ppm, w, h } = view, rot = view.rot || 0, u = opts.u || 1;
		const layers = opts.layers || ALL;
		let fading = false;
		ctx.save();
		ctx.fillStyle = INK.void;
		ctx.fillRect( 0, 0, w, h );
		ctx.translate( w / 2, h / 2 );
		ctx.rotate( - rot );
		ctx.scale( ppm, ppm );
		ctx.translate( - cx, - cz );
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		// visible world rect (a rotated view needs the circle around it)
		const hx = ( rot ? Math.hypot( w, h ) : w ) / 2 / ppm, hz = ( rot ? Math.hypot( w, h ) : h ) / 2 / ppm;
		const vx0 = cx - hx, vx1 = cx + hx, vz0 = cz - hz, vz1 = cz + hz;
		const screenMpp = 1 / ( ppm * ( opts.pxRatio || 1 ) );
		let want = 0;
		for ( let L = 0; L < LEVELS.length; L ++ ) if ( LEVELS[ L ] >= screenMpp * 0.7 ) want = L;
		// coarse first, finer on top where ready (fading in as they land)
		for ( let L = 0; L <= want; L ++ ) {
			const size = LEVELS[ L ] * TPX;
			const i0 = Math.max( 0, Math.floor( ( vx0 - this.hf.x0 ) / size ) ), i1 = Math.floor( ( vx1 - this.hf.x0 ) / size );
			const j0 = Math.max( 0, Math.floor( ( vz0 - this.hf.z0 ) / size ) ), j1 = Math.floor( ( vz1 - this.hf.z0 ) / size );
			const maxI = Math.ceil( this.hf.halfX * 2 / size ) - 1, maxJ = Math.ceil( this.hf.halfZ * 2 / size ) - 1;
			if ( ( i1 - i0 + 1 ) * ( j1 - j0 + 1 ) > 120 ) continue;
			for ( let j = j0; j <= Math.min( j1, maxJ ); j ++ ) for ( let i = i0; i <= Math.min( i1, maxI ); i ++ ) {
				// open ocean stays on the coarse level
				if ( L > 0 && this.hf.rangeOver ) {
					const [ , hi ] = this.hf.rangeOver( this.hf.x0 + i * size, this.hf.z0 + j * size, size );
					if ( hi < - 60 ) continue;
				}
				const t = this._tile( L, i, j, opts.priority !== undefined ? opts.priority + L * 0.1 : undefined );
				if ( ! t.img ) continue;
				const a = L ? Math.min( 1, ( now - t.born ) / FADE ) : 1;
				if ( a < 1 ) fading = true;
				ctx.globalAlpha = a;
				ctx.drawImage( t.img, this.hf.x0 + i * size, this.hf.z0 + j * size, size + 0.5 / ppm, size + 0.5 / ppm );
			}
		}
		ctx.globalAlpha = 1;
		this._vectors( ctx, ppm, u, layers, vx0, vz0, vx1, vz1 );
		ctx.restore();
		this._evict();
		const c = Math.cos( - rot ), s = Math.sin( - rot ), ci = Math.cos( rot ), si = Math.sin( rot );
		const toScreen = ( x, z ) => {
			const dx = ( x - cx ) * ppm, dz = ( z - cz ) * ppm;
			return [ w / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c ];
		};
		const toWorld = ( sx, sy ) => {
			const dx = sx - w / 2, dy = sy - h / 2;
			return [ cx + ( dx * ci - dy * si ) / ppm, cz + ( dx * si + dy * ci ) / ppm ];
		};
		opts.under?.( ctx, toScreen ); // caller overlays that belong under the labels (the map grid)
		if ( opts.labels !== false ) this._labels( ctx, view, toScreen, u, opts.avoid );
		return { toScreen, toWorld, fading };
	}

	// runways, footprints, streets, dirt tracks, highways, freeways (in world units inside draw's transform).
	// Lines keep a minimum width in UI units and grow to their real width close up. z is the zoom in UI units
	// per metre, so the minimap (device px) and the full map (CSS px) switch layers at the same scale.
	_vectors( ctx, ppm, u, layers, x0, z0, x1, z1 ) {
		const px = v => v / ppm; // canvas px -> world units
		const z = ppm / u;
		const far = Math.max( 0.6, Math.min( 1, z / 0.05 ) ); // thinner minimums when the whole chain is on screen
		const width = ( minU, metres ) => px( Math.max( minU * u * far, metres * ppm ) );
		const each = ( b, fn ) => b.each( x0, z0, x1, z1, fn );
		ctx.lineCap = 'round'; ctx.lineJoin = 'round';
		if ( layers.roads && z > 0.03 ) { ctx.fillStyle = INK.runway; ctx.fill( this.runwayPath ); }
		// footprints fade in between 0.3 and 0.5 u/m, streets between 0.14 and 0.4 (a 100 m block is then 14-40u,
		// below that the street grid reads as graph paper over the town), so zooming never pops
		const bA = layers.buildings ? smooth( ( z - 0.3 ) / 0.2 ) : 0;
		if ( bA > 0 ) {
			ctx.globalAlpha = bA;
			ctx.fillStyle = INK.building;
			each( this.buildings, p => ctx.fill( p ) );
			ctx.globalAlpha = 1;
		}
		if ( ! layers.roads ) return;
		const sA = smooth( ( z - 0.14 ) / 0.26 );
		if ( sA > 0 ) {
			ctx.globalAlpha = sA;
			ctx.strokeStyle = INK.street;
			for ( const [ wm, b ] of this.streets ) { ctx.lineWidth = width( 1, wm ); each( b, p => ctx.stroke( p ) ); }
			ctx.globalAlpha = 1;
		}
		const dirt = width( 1.5, 5.5 ) * ppm; // canvas px, for the dash lengths
		ctx.strokeStyle = INK.dirt;
		ctx.lineWidth = px( dirt );
		ctx.setLineDash( [ px( dirt * 8 / 3 ), px( dirt * 2 ) ] );
		ctx.lineCap = 'butt';
		each( this.roads[ 1 ], p => ctx.stroke( p ) );
		ctx.setLineDash( [] );
		ctx.lineCap = 'round';
		// both casings under both lines, so junctions merge cleanly
		const hw = width( 2, 8.5 ), fw = width( 3, 17 ), edge = px( 2 * u * far );
		ctx.strokeStyle = INK.highwayCase; ctx.lineWidth = hw + edge; each( this.roads[ 2 ], p => ctx.stroke( p ) );
		ctx.strokeStyle = INK.freewayCase; ctx.lineWidth = fw + edge; each( this.roads[ 4 ], p => ctx.stroke( p ) );
		ctx.strokeStyle = INK.highway; ctx.lineWidth = hw; each( this.roads[ 2 ], p => ctx.stroke( p ) );
		ctx.strokeStyle = INK.freeway; ctx.lineWidth = fw; each( this.roads[ 4 ], p => ctx.stroke( p ) );
	}

	_width( font, text, spacing ) {
		const k = font + '|' + spacing + '|' + text;
		let w = this._widths.get( k );
		if ( w === undefined ) { w = this._ctxW( font, text, spacing ); this._widths.set( k, w ); }
		return w;
	}

	// place names in priority order, skipping any that would overlap one already placed (or an avoid rect)
	_labels( ctx, view, toScreen, u, avoid ) {
		const { w, h } = view, ppm = view.ppm / u; // zoom in u per metre (see _vectors)
		const placed = avoid ? avoid.slice() : [];
		const pad = 3 * u;
		ctx.save();
		ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round';
		ctx.lineWidth = 3 * u;
		ctx.strokeStyle = INK.halo;
		this._ctxW = ( font, text, spacing ) => { ctx.font = font; ctx.letterSpacing = spacing + 'px'; return ctx.measureText( text ).width; };
		for ( const l of this.labels ) {
			const c = l.cls;
			// fade in over the first quarter of the zoom range; islands fade out as towns take over
			let a = c.min ? smooth( ( ppm - c.min ) / ( c.min * 0.25 ) ) : 1;
			if ( c.max ) a *= smooth( ( c.max - ppm ) / ( c.max * 0.25 ) );
			if ( a < 0.02 ) continue;
			const [ sx, sy ] = toScreen( l.x, l.z );
			if ( sx < - 200 || sy < - 40 || sx > w + 200 || sy > h + 40 ) continue;
			const [ weight, size ] = c.font.split( / (?=\d+$)/ );
			const font = `${weight} ${Math.round( + size * u * 10 ) / 10}px ${FONT}`;
			const spacing = c.caps ? Math.round( + size * u * c.caps * 10 ) / 10 : 0;
			const tw = this._width( font, l.text, spacing ) - spacing; // the trailing letter gap isn't ink
			const th = + size * u;
			const tri = l.peak ? 7 * u : 0; // summit mark to the left of the name
			const x0 = sx - ( tri ? tri / 2 : tw / 2 ), x1 = x0 + ( tri ? tri + 3 * u : 0 ) + tw;
			const r = [ x0 - pad, sy - th / 2 - pad, x1 + pad, sy + th / 2 + pad ];
			if ( r[ 0 ] < 0 || r[ 1 ] < 0 || r[ 2 ] > w || r[ 3 ] > h ) continue; // a name cut by the edge reads as a fragment
			let hit = false;
			for ( const p of placed ) if ( r[ 0 ] < p[ 2 ] && r[ 2 ] > p[ 0 ] && r[ 1 ] < p[ 3 ] && r[ 3 ] > p[ 1 ] ) { hit = true; break; }
			if ( hit ) continue;
			placed.push( r );
			ctx.globalAlpha = a;
			ctx.font = font;
			ctx.letterSpacing = spacing + 'px';
			ctx.textAlign = 'left';
			// whole pixels keep the glyphs crisp
			const tx = Math.round( tri ? x0 + tri + 3 * u : x0 ), ty = Math.round( sy );
			if ( tri ) {
				ctx.beginPath(); ctx.moveTo( x0 + tri / 2, sy - tri * 0.45 ); ctx.lineTo( x0 + tri, sy + tri * 0.45 ); ctx.lineTo( x0, sy + tri * 0.45 ); ctx.closePath();
				ctx.lineWidth = 2 * u; ctx.stroke(); ctx.fillStyle = c.color; ctx.fill();
				ctx.lineWidth = 3 * u;
			}
			ctx.strokeText( l.text, tx, ty );
			ctx.fillStyle = c.color;
			ctx.fillText( l.text, tx, ty );
		}
		ctx.letterSpacing = '0px';
		ctx.restore();
	}
}
