// Map rendering shared by the full-screen map and the minimap: relief tiles rendered by the world
// workers at three detail levels, with roads, streets, runways, buildings and labels as vectors.
const LEVELS = [ 64, 16, 4 ]; // metres per pixel
const TPX = 256;

export class MapView {
	constructor( app ) {
		this.app = app;
		this.world = app.world;
		this.meta = app.world.meta;
		this.hf = app.world.hf;
		this.tiles = new Map();
		this.pending = 0;
		this.frame = 0;
		this._buildPaths();
	}

	_buildPaths() {
		const m = this.meta;
		this.roadPaths = { 4: new Path2D(), 2: new Path2D(), 1: new Path2D() };
		for ( const r of m.roads ) {
			const p = this.roadPaths[ r.lanes ] || this.roadPaths[ 2 ];
			for ( let i = 0; i < r.pts.length; i += 3 ) { if ( i === 0 ) p.moveTo( r.pts[ i ], r.pts[ i + 1 ] ); else p.lineTo( r.pts[ i ], r.pts[ i + 1 ] ); }
		}
		this.streetPath = new Path2D();
		for ( const s of m.streets ) { this.streetPath.moveTo( s[ 1 ], s[ 2 ] ); this.streetPath.lineTo( s[ 4 ], s[ 5 ] ); }
		this.buildingPath = new Path2D();
		const B = m.buildings.data, F = 11;
		this.buildingCount = B.length / F;
		for ( let i = 0; i < B.length; i += F ) {
			const x = B[ i ], z = B[ i + 1 ], w = B[ i + 2 ] / 2, d = B[ i + 3 ] / 2, a = B[ i + 4 ];
			const c = Math.cos( a ), s = Math.sin( a );
			// bake angle: local x -> (c, s), local z -> (-s, c)
			const pt = ( u, v ) => [ x + u * c - v * s, z + u * s + v * c ];
			const p0 = pt( - w, - d ), p1 = pt( w, - d ), p2 = pt( w, d ), p3 = pt( - w, d );
			this.buildingPath.moveTo( p0[ 0 ], p0[ 1 ] ); this.buildingPath.lineTo( p1[ 0 ], p1[ 1 ] ); this.buildingPath.lineTo( p2[ 0 ], p2[ 1 ] ); this.buildingPath.lineTo( p3[ 0 ], p3[ 1 ] ); this.buildingPath.closePath();
		}
		this.runwayPath = new Path2D();
		for ( const r of m.runways ) {
			const c = Math.cos( r.angle ), s = Math.sin( r.angle ), L = r.len / 2, W = r.w / 2;
			const pt = ( u, v ) => [ r.x + u * c - v * s, r.z + u * s + v * c ];
			const p = [ pt( - L, - W ), pt( L, - W ), pt( L, W ), pt( - L, W ) ];
			this.runwayPath.moveTo( ...p[ 0 ] ); for ( let k = 1; k < 4; k ++ ) this.runwayPath.lineTo( ...p[ k ] ); this.runwayPath.closePath();
		}
	}

	_tile( L, i, j ) {
		const key = L + ':' + i + ':' + j;
		let t = this.tiles.get( key );
		if ( t ) { t.used = this.frame; return t; }
		const mpp = LEVELS[ L ], size = mpp * TPX;
		t = { img: null, used: this.frame, L };
		this.tiles.set( key, t );
		this.pending ++;
		const job = this.world.pool.submit( { type: 'maptile', x0: this.hf.x0 + i * size, z0: this.hf.z0 + j * size, size, px: TPX }, 50 + L * 10 );
		job.promise.then( r => {
			this.pending --;
			if ( ! r ) { this.tiles.delete( key ); return; }
			const c = document.createElement( 'canvas' ); c.width = c.height = TPX;
			c.getContext( '2d' ).putImageData( new ImageData( r.rgba, TPX, TPX ), 0, 0 );
			t.img = c;
		} ).catch( () => { this.pending --; this.tiles.delete( key ); } );
		return t;
	}

	_evict() {
		if ( this.tiles.size < 420 ) return;
		const arr = [ ...this.tiles.entries() ].filter( ( [ , t ] ) => t.L > 0 ).sort( ( a, b ) => a[ 1 ].used - b[ 1 ].used );
		for ( let k = 0; k < arr.length - 360; k ++ ) this.tiles.delete( arr[ k ][ 0 ] );
	}

	// view: { cx, cz, ppm, rot, w, h }. Draws relief + vectors in world space; returns the transform helpers
	draw( ctx, view, opts = {} ) {
		this.frame ++;
		const { cx, cz, ppm, w, h } = view, rot = view.rot || 0;
		ctx.save();
		ctx.fillStyle = '#0c244a';
		ctx.fillRect( 0, 0, w, h );
		ctx.translate( w / 2, h / 2 );
		ctx.rotate( - rot );
		ctx.scale( ppm, ppm );
		ctx.translate( - cx, - cz );
		ctx.imageSmoothingEnabled = true;
		// visible world rect (with rotation slack)
		const rad = Math.hypot( w, h ) / 2 / ppm;
		const vx0 = cx - rad, vx1 = cx + rad, vz0 = cz - rad, vz1 = cz + rad;
		const screenMpp = 1 / ppm;
		let want = 0;
		for ( let L = 0; L < LEVELS.length; L ++ ) if ( LEVELS[ L ] >= screenMpp * 0.7 ) want = L;
		// draw coarse first, finer on top where ready
		for ( let L = 0; L <= want; L ++ ) {
			const size = LEVELS[ L ] * TPX;
			const i0 = Math.max( 0, Math.floor( ( vx0 - this.hf.x0 ) / size ) ), i1 = Math.floor( ( vx1 - this.hf.x0 ) / size );
			const j0 = Math.max( 0, Math.floor( ( vz0 - this.hf.z0 ) / size ) ), j1 = Math.floor( ( vz1 - this.hf.z0 ) / size );
			const maxI = Math.ceil( this.hf.halfX * 2 / size ), maxJ = Math.ceil( this.hf.halfZ * 2 / size );
			if ( ( i1 - i0 + 1 ) * ( j1 - j0 + 1 ) > 120 ) continue;
			for ( let j = j0; j <= Math.min( j1, maxJ ); j ++ ) for ( let i = i0; i <= Math.min( i1, maxI ); i ++ ) {
				// skip open-ocean tiles at the finer levels
				if ( L > 0 ) {
					const [ , hi ] = this.hf.rangeOver( this.hf.x0 + i * size, this.hf.z0 + j * size, size );
					if ( hi < - 60 ) continue;
				}
				const t = this._tile( L, i, j );
				if ( t.img ) ctx.drawImage( t.img, this.hf.x0 + i * size, this.hf.z0 + j * size, size + 0.5 / ppm, size + 0.5 / ppm );
			}
		}
		// vectors
		const lw = px => px / ppm;
		ctx.lineCap = 'round'; ctx.lineJoin = 'round';
		if ( ppm > 0.35 ) {
			ctx.fillStyle = 'rgba(70, 70, 76, 0.85)';
			ctx.fill( this.runwayPath );
		}
		if ( ppm > 0.18 ) {
			ctx.strokeStyle = 'rgba(248, 246, 238, 0.9)';
			ctx.lineWidth = lw( Math.max( 1, Math.min( 5, ppm * 10 ) ) );
			ctx.stroke( this.streetPath );
		}
		if ( ppm > 0.5 ) {
			ctx.fillStyle = 'rgba(92, 84, 78, 0.9)';
			ctx.fill( this.buildingPath );
		}
		const roadW = ( base ) => lw( Math.max( base, Math.min( base * 4, ppm * base * 6 ) ) );
		ctx.strokeStyle = 'rgba(150, 110, 70, 0.9)';
		ctx.setLineDash( [ lw( 4 ), lw( 3 ) ] );
		ctx.lineWidth = roadW( 1.2 ); ctx.stroke( this.roadPaths[ 1 ] );
		ctx.setLineDash( [] );
		ctx.strokeStyle = 'rgba(60, 50, 40, 0.55)'; ctx.lineWidth = roadW( 2.6 ); ctx.stroke( this.roadPaths[ 2 ] );
		ctx.strokeStyle = '#fbf6e8'; ctx.lineWidth = roadW( 1.6 ); ctx.stroke( this.roadPaths[ 2 ] );
		ctx.strokeStyle = 'rgba(90, 50, 20, 0.6)'; ctx.lineWidth = roadW( 3.6 ); ctx.stroke( this.roadPaths[ 4 ] );
		ctx.strokeStyle = '#ffc861'; ctx.lineWidth = roadW( 2.4 ); ctx.stroke( this.roadPaths[ 4 ] );
		ctx.restore();
		this._evict();
		const toScreen = ( x, z ) => {
			const dx = ( x - cx ) * ppm, dz = ( z - cz ) * ppm;
			const c = Math.cos( - rot ), s = Math.sin( - rot );
			return [ w / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c ];
		};
		const toWorld = ( sx, sy ) => {
			const dx = sx - w / 2, dy = sy - h / 2;
			const c = Math.cos( rot ), s = Math.sin( rot );
			return [ cx + ( dx * c - dy * s ) / ppm, cz + ( dx * s + dy * c ) / ppm ];
		};
		if ( opts.labels !== false ) this._labels( ctx, view, toScreen );
		return { toScreen, toWorld };
	}

	_labels( ctx, view, toScreen ) {
		const { ppm, w, h } = view;
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const draw = ( text, x, z, font, color, halo = 'rgba(0,0,0,0.55)', spacing = 0 ) => {
			const [ sx, sy ] = toScreen( x, z );
			if ( sx < - 100 || sy < - 30 || sx > w + 100 || sy > h + 30 ) return;
			ctx.font = font;
			if ( spacing ) ctx.letterSpacing = spacing + 'px';
			ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText( text, sx, sy );
			ctx.fillStyle = color; ctx.fillText( text, sx, sy );
			ctx.letterSpacing = '0px';
		};
		const m = this.meta;
		if ( ppm < 0.12 ) for ( const i of m.islands ) draw( i.name.toUpperCase(), i.x, i.z, `600 ${Math.round( 11 + ppm * 40 )}px Inter, sans-serif`, '#fff3e0', 'rgba(0,0,0,0.5)', 3 );
		for ( const l of m.labels ) {
			if ( l.kind === 'water' ) { if ( ppm > 0.02 ) draw( l.name, l.x, l.z, 'italic 500 12px Inter, sans-serif', '#bfe8ff', 'rgba(0,20,40,0.6)' ); continue; }
			if ( l.kind === 'peak' && ppm > 0.03 ) draw( '▲ ' + l.name, l.x, l.z, '500 11px Inter, sans-serif', '#f4ecdc' );
			else if ( ( l.kind === 'area' || l.kind === 'range' ) && ppm > 0.05 ) draw( l.name, l.x, l.z, 'italic 500 11px Inter, sans-serif', '#efe6d2' );
		}
		for ( const c of m.cities ) {
			const big = c.kind === 'metro';
			if ( ppm < ( big ? 0.02 : c.kind === 'town' ? 0.05 : 0.09 ) ) continue;
			draw( c.name, c.x, c.z, `${big ? 700 : 600} ${big ? 15 : c.kind === 'town' ? 13 : 11}px Inter, sans-serif`, c.kind === 'military' ? '#ffd0a0' : '#ffffff' );
		}
		ctx.restore();
	}
}
