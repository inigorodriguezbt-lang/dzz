// The foliage atlas: every leaf, frond, needle and blade texture of the vegetation drawn once on a
// 2048² canvas (colour + coverage), uploaded as one mipmapped texture that all plant materials share.
// Transparent texels get the tile's mean leaf colour so mipmaps don't bleed black into the edges
// (a canvas stores premultiplied colour: fully transparent pixels would read back as black).
//
// Tile-local uv: u runs along the canvas x of the tile, v along the canvas y (downwards); the geometry
// builders map ( u, v ) into atlas space with `atlasUV`.
import * as THREE from 'three';

export const ATLAS = 2048;

// x, y, w, h in atlas pixels
export const TILE = {
	FROND: [ 0, 0, 256, 2048 ], // palm frond wing: u across (0 rachis .. 1 leaflet tips), v along (0 base .. 1 tip)
	FERN: [ 256, 0, 256, 1024 ], // fern frond wing, same layout
	BANANA: [ 256, 1024, 256, 1024 ], // banana half blade: u 0 midrib .. 1 edge, v along
	BROAD: [ 512, 0, 512, 512 ], // kukui: big pale lobed leaves (card)
	SMALL: [ 1024, 0, 512, 512 ], // ʻōhiʻa: small round leaves and red lehua blossoms (card)
	FINE: [ 1536, 0, 512, 512 ], // monkeypod / kiawe: fine bipinnate leaflets (card)
	SHRUB: [ 512, 512, 512, 512 ], // shrubs: glossy oval leaves, hibiscus flowers (card)
	NAUPAKA: [ 1024, 512, 512, 512 ], // beach naupaka rosettes (card)
	NEEDLE: [ 1536, 512, 512, 512 ], // ironwood: drooping needle wisps (card, top edge = twig)
	PINEBR: [ 512, 1024, 512, 512 ], // Cook pine branch with foxtail branchlets (u along the branch, v across)
	GRASS: [ 1024, 1024, 512, 512 ], // tall grass tuft (v 0 top .. 1 base)
	CANE: [ 1536, 1024, 512, 512 ], // sugar cane stalks and leaves (v 0 top .. 1 base)
	TI: [ 512, 1536, 128, 512 ], // ti leaf: u across (midrib at 0.5), v base .. tip
	PLUME: [ 640, 1536, 128, 512 ], // grass seed heads (v 0 top .. 1 base)
	WHITE: [ 776, 1544, 16, 16 ], // opaque white for untextured parts (vertex colour only)
	PANDAN: [ 800, 1536, 128, 512 ], // long narrow leaf with a spiny edge (pineapple, spare)
};

export function atlasUV( tile, u, v, out ) {
	const t = TILE[ tile ];
	out[ 0 ] = ( t[ 0 ] + Math.min( 0.998, Math.max( 0.002, u ) ) * t[ 2 ] ) / ATLAS;
	out[ 1 ] = ( t[ 1 ] + Math.min( 0.998, Math.max( 0.002, v ) ) * t[ 3 ] ) / ATLAS;
	return out;
}

// ---- small helpers ------------------------------------------------------------------------------------

function rng( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

const hex = ( c ) => [ ( c >> 16 ) & 255, ( c >> 8 ) & 255, c & 255 ];
const mixc = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
const css = ( c, k = 1 ) => `rgb(${Math.max( 0, Math.min( 255, c[ 0 ] * k ) ) | 0},${Math.max( 0, Math.min( 255, c[ 1 ] * k ) ) | 0},${Math.max( 0, Math.min( 255, c[ 2 ] * k ) ) | 0})`;

// a simple leaf blade along +x from the origin: length L, half width W, `tipK` sharpness, `baseK` taper
function leafShape( ctx, L, W, { tip = 0.5, base = 0.35, skew = 0 } = {} ) {
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.bezierCurveTo( L * base, - W * 1.25 + skew * W, L * ( 1 - tip * 0.6 ), - W * 1.05 + skew * W, L, 0 );
	ctx.bezierCurveTo( L * ( 1 - tip * 0.6 ), W * 1.05 + skew * W, L * base, W * 1.25 + skew * W, 0, 0 );
	ctx.closePath();
}

// a shaded leaf: gradient from base to tip, a midrib, per-leaf brightness
function drawLeaf( ctx, x, y, ang, L, W, col, opts = {} ) {
	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( ang );
	leafShape( ctx, L, W, opts );
	const g = ctx.createLinearGradient( 0, - W, L * 0.3, W );
	g.addColorStop( 0, css( col, opts.light ?? 1.18 ) );
	g.addColorStop( 1, css( col, opts.dark ?? 0.82 ) );
	ctx.fillStyle = g;
	ctx.fill();
	if ( opts.rib !== false && L > 10 ) {
		ctx.strokeStyle = css( col, 1.35 );
		ctx.globalAlpha = 0.45;
		ctx.lineWidth = Math.max( 0.6, W * 0.12 );
		ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( L * 0.9, 0 ); ctx.stroke();
		ctx.globalAlpha = 1;
	}
	ctx.restore();
}

function clipTile( ctx, t ) {
	ctx.save();
	ctx.beginPath();
	ctx.rect( t[ 0 ], t[ 1 ], t[ 2 ], t[ 3 ] );
	ctx.clip();
	ctx.translate( t[ 0 ], t[ 1 ] );
}

// ---- tiles ------------------------------------------------------------------------------------------------

// coconut frond wing: ~64 leaflets leaving the rachis at the left edge, their length varying, a few
// broken short; young leaflets lighter at the base, darker and yellowing towards the tips
function drawFrond( ctx, w, h, rnd ) {
	const N = 64;
	const base = hex( 0x6a8f2a ), tipc = hex( 0x46631c ), young = hex( 0x9db448 ), dry = hex( 0x9a8446 );
	for ( let k = 0; k < N; k ++ ) {
		const s = ( k + 0.5 ) / N;
		const y = s * h;
		const broken = rnd() < 0.05;
		const len = w * ( 0.72 + 0.28 * rnd() ) * ( broken ? 0.45 : 1 );
		const hw = h / N * ( 0.3 + 0.08 * rnd() );
		const col = mixc( mixc( base, tipc, 0.3 + 0.4 * rnd() ), young, rnd() * 0.25 );
		// leaflets angle slightly towards the frond tip and droop at their ends
		ctx.save();
		ctx.translate( 0, y );
		ctx.beginPath();
		ctx.moveTo( 0, - hw * 0.6 );
		ctx.quadraticCurveTo( len * 0.5, - hw * 1.1 + len * 0.04, len, len * 0.1 );
		ctx.quadraticCurveTo( len * 0.5, hw * 1.1 + len * 0.05, 0, hw * 0.6 );
		ctx.closePath();
		const g = ctx.createLinearGradient( 0, 0, len, 0 );
		g.addColorStop( 0, css( mixc( col, young, 0.35 ) ) );
		g.addColorStop( 0.5, css( col ) );
		g.addColorStop( 0.85, css( col, 0.86 ) );
		g.addColorStop( 1, css( rnd() < 0.3 ? mixc( col, dry, 0.7 ) : col, 0.8 ) );
		ctx.fillStyle = g;
		ctx.fill();
		// midrib highlight
		ctx.strokeStyle = css( mixc( col, young, 0.6 ), 1.1 );
		ctx.globalAlpha = 0.5;
		ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo( 2, 0 ); ctx.quadraticCurveTo( len * 0.5, len * 0.02, len * 0.95, len * 0.09 ); ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.restore();
	}
	// the rachis along the left edge
	const g = ctx.createLinearGradient( 0, 0, 14, 0 );
	g.addColorStop( 0, '#b8a860' ); g.addColorStop( 1, '#8f8440' );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, 9, h );
}

// fern wing: pinnae with lobed pinnules
function drawFern( ctx, w, h, rnd ) {
	const N = 30;
	const c0 = hex( 0x3f6a22 ), c1 = hex( 0x5f8a30 );
	for ( let k = 0; k < N; k ++ ) {
		const s = ( k + 0.5 ) / N;
		const y = s * h;
		const len = w * ( 0.8 + 0.2 * rnd() );
		const col = mixc( c0, c1, rnd() * 0.7 + s * 0.3 );
		ctx.save();
		ctx.translate( 0, y );
		ctx.rotate( 0.12 );
		// pinnules: small lobes along the pinna
		const M = 9;
		for ( let q = 0; q < M; q ++ ) {
			const t = ( q + 0.5 ) / M;
			const r = ( h / N ) * 0.42 * ( 1 - t * 0.55 );
			for ( const side of [ - 1, 1 ] ) {
				ctx.beginPath();
				ctx.ellipse( len * t, side * r * 0.55, r * 0.9, r * 0.55, side * 0.5, 0, Math.PI * 2 );
				ctx.fillStyle = css( col, 0.9 + rnd() * 0.25 );
				ctx.fill();
			}
		}
		ctx.strokeStyle = css( col, 0.7 );
		ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( len * 0.97, 0 ); ctx.stroke();
		ctx.restore();
	}
	ctx.fillStyle = '#4d5a24';
	ctx.fillRect( 0, 0, 5, h );
}

// banana half blade with lateral veins and tears along them; a dry ragged margin
function drawBanana( ctx, w, h, rnd ) {
	const c0 = hex( 0x4f8a2a ), c1 = hex( 0x6aa23a );
	const g = ctx.createLinearGradient( 0, 0, w, 0 );
	g.addColorStop( 0, css( hex( 0xb8c878 ) ) );
	g.addColorStop( 0.06, css( c1 ) );
	g.addColorStop( 0.7, css( c0 ) );
	g.addColorStop( 1, css( c0, 0.85 ) );
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	for ( let y = 0; y <= h; y += 8 ) {
		const e = w * ( 0.94 + 0.05 * Math.sin( y * 0.05 ) ) - rnd() * 6;
		ctx.lineTo( e, y );
	}
	ctx.lineTo( 0, h );
	ctx.closePath();
	ctx.fill();
	// lateral veins
	ctx.strokeStyle = css( c1, 1.15 );
	ctx.globalAlpha = 0.25;
	ctx.lineWidth = 1;
	for ( let y = - w; y < h; y += 5 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( w, y + w * 0.35 ); ctx.stroke(); }
	ctx.globalAlpha = 1;
	// tears: gaps cut along the veins from the margin inwards
	ctx.globalCompositeOperation = 'destination-out';
	for ( let y = 30; y < h - 20; y += 22 + rnd() * 60 ) {
		const depth = w * ( 0.3 + 0.65 * rnd() );
		ctx.lineWidth = 1.5 + rnd() * 2.5;
		ctx.beginPath(); ctx.moveTo( w + 2, y + w * 0.35 ); ctx.lineTo( w - depth, y + ( w - depth ) * 0.35 - w * 0.0 ); ctx.stroke();
	}
	ctx.globalCompositeOperation = 'source-over';
	// brown dry edge
	ctx.strokeStyle = '#7a6a3a';
	ctx.globalAlpha = 0.6;
	ctx.lineWidth = 3;
	ctx.beginPath(); ctx.moveTo( w - 2, 0 ); ctx.lineTo( w - 2, h ); ctx.stroke();
	ctx.globalAlpha = 1;
}

// leaf-cluster card: whorls of leaves at twig ends on a jittered grid, some cells empty (sky gaps)
function drawCluster( ctx, w, h, rnd, { grid, leaves, L, W, cols, opts = {}, flowers = null, twig = '#4a3e2c', holes = 0.18 } ) {
	const cell = w / grid;
	const pts = [];
	for ( let j = 0; j < grid; j ++ ) for ( let i = 0; i < grid; i ++ ) {
		if ( rnd() < holes ) continue;
		pts.push( [ ( i + 0.2 + 0.6 * rnd() ) * cell, ( j + 0.2 + 0.6 * rnd() ) * cell, 0.7 + 0.5 * rnd() ] );
	}
	// second, offset layer fills the cards more irregularly
	for ( let j = 0; j < grid; j ++ ) for ( let i = 0; i < grid; i ++ ) {
		if ( rnd() < 0.45 ) continue;
		pts.push( [ ( i + 0.7 + 0.6 * rnd() ) * cell % w, ( j + 0.7 + 0.6 * rnd() ) * cell % h, 0.55 + 0.4 * rnd() ] );
	}
	// keep leaves inside the card: pull the whorl centres in from the border
	for ( const [ x0, y0, sc ] of pts ) {
		const x = w * 0.12 + x0 * 0.76, y = h * 0.12 + y0 * 0.76;
		// twig
		ctx.strokeStyle = twig;
		ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + ( rnd() - 0.5 ) * cell * 0.8, y + cell * 0.5 ); ctx.stroke();
		const n = leaves + Math.floor( rnd() * 3 );
		const a0 = rnd() * Math.PI * 2;
		for ( let k = 0; k < n; k ++ ) {
			const a = a0 + k / n * Math.PI * 2 + ( rnd() - 0.5 ) * 0.6;
			const l = L * sc * ( 0.6 + 0.5 * rnd() );
			const col = cols[ Math.floor( rnd() * cols.length ) ];
			drawLeaf( ctx, x + Math.cos( a ) * l * 0.12, y + Math.sin( a ) * l * 0.12, a, l, W * sc * ( 0.8 + 0.4 * rnd() ), mixc( col, [ 255, 255, 255 ], ( rnd() - 0.5 ) * 0.1 ), opts );
		}
		if ( flowers && rnd() < flowers.p ) flowers.draw( ctx, x + ( rnd() - 0.5 ) * cell * 0.3, y + ( rnd() - 0.5 ) * cell * 0.3, sc, rnd );
	}
}

// ʻōhiʻa lehua blossom: a pompom of red stamens
function lehua( ctx, x, y, sc, rnd ) {
	const R = 11 * sc;
	for ( let k = 0; k < 26; k ++ ) {
		const a = rnd() * Math.PI * 2, r = R * ( 0.6 + 0.4 * rnd() );
		ctx.strokeStyle = rnd() < 0.5 ? '#e0201c' : '#b8141a';
		ctx.lineWidth = 1.4;
		ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + Math.cos( a ) * r, y + Math.sin( a ) * r ); ctx.stroke();
		ctx.fillStyle = '#ff3a2a';
		ctx.fillRect( x + Math.cos( a ) * r - 1, y + Math.sin( a ) * r - 1, 2, 2 );
	}
}

// hibiscus flower: five red petals and a yellow stamen
function hibiscus( ctx, x, y, sc, rnd ) {
	const R = 13 * sc;
	const a0 = rnd() * 6;
	for ( let k = 0; k < 5; k ++ ) {
		const a = a0 + k / 5 * Math.PI * 2;
		ctx.beginPath();
		ctx.ellipse( x + Math.cos( a ) * R * 0.55, y + Math.sin( a ) * R * 0.55, R * 0.6, R * 0.42, a, 0, Math.PI * 2 );
		ctx.fillStyle = k % 2 ? '#e0262a' : '#d01c24';
		ctx.fill();
	}
	ctx.fillStyle = '#f0d040';
	ctx.fillRect( x - 1.5, y - 1.5, 3, 3 );
}

// naupaka half flower: white, five petals on one side
function naupakaFlower( ctx, x, y, sc, rnd ) {
	const R = 7 * sc;
	const a0 = rnd() * 6;
	for ( let k = 0; k < 5; k ++ ) {
		const a = a0 + k / 5 * Math.PI;
		ctx.beginPath();
		ctx.ellipse( x + Math.cos( a ) * R * 0.6, y + Math.sin( a ) * R * 0.6, R * 0.55, R * 0.25, a, 0, Math.PI * 2 );
		ctx.fillStyle = '#f4f2ea';
		ctx.fill();
	}
}

// monkeypod / kiawe: bipinnate leaves, pairs of small leaflets along thin stalks
function drawFine( ctx, w, h, rnd ) {
	const cols = [ hex( 0x3a5a22 ), hex( 0x456a28 ), hex( 0x4e7430 ), hex( 0x355220 ) ];
	const grid = 5, cell = w / grid;
	for ( let j = 0; j < grid; j ++ ) for ( let i = 0; i < grid; i ++ ) {
		if ( rnd() < 0.14 ) continue;
		const cx = w * 0.12 + ( i + 0.5 ) * cell * 0.76 + ( rnd() - 0.5 ) * cell * 0.4, cy = h * 0.12 + ( j + 0.5 ) * cell * 0.76 + ( rnd() - 0.5 ) * cell * 0.4;
		const nL = 5 + Math.floor( rnd() * 4 );
		for ( let k = 0; k < nL; k ++ ) {
			const a = rnd() * Math.PI * 2;
			const L = cell * ( 0.35 + 0.35 * rnd() );
			const col = cols[ Math.floor( rnd() * cols.length ) ];
			ctx.save();
			ctx.translate( cx, cy );
			ctx.rotate( a );
			ctx.strokeStyle = '#4b5a2a';
			ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( L, 0 ); ctx.stroke();
			const n = 7;
			for ( let q = 1; q <= n; q ++ ) {
				const t = q / ( n + 0.5 ) * L;
				for ( const sd of [ - 1, 1 ] ) {
					ctx.beginPath();
					ctx.ellipse( t, sd * 4.2, 4.6, 2.3, sd * 0.9, 0, Math.PI * 2 );
					ctx.fillStyle = css( col, 0.85 + rnd() * 0.35 );
					ctx.fill();
				}
			}
			ctx.restore();
		}
	}
}

// ironwood: bundles of long jointed needles hanging from twigs along the top of the card
function drawNeedles( ctx, w, h, rnd ) {
	const cols = [ '#56664a', '#4c5c40', '#627256', '#475a3c' ];
	for ( let k = 0; k < 42; k ++ ) {
		const x0 = w * ( 0.08 + 0.84 * rnd() ), y0 = h * ( 0.05 + 0.4 * rnd() );
		const n = 10 + Math.floor( rnd() * 12 );
		for ( let q = 0; q < n; q ++ ) {
			const len = h * ( 0.25 + 0.4 * rnd() );
			const dx = ( rnd() - 0.5 ) * 60;
			ctx.strokeStyle = cols[ Math.floor( rnd() * cols.length ) ];
			ctx.lineWidth = 1.6 + rnd() * 1.2;
			ctx.beginPath();
			ctx.moveTo( x0, y0 );
			ctx.bezierCurveTo( x0 + dx * 0.6, y0 + len * 0.3, x0 + dx, y0 + len * 0.6, x0 + dx * 0.9 + ( rnd() - 0.5 ) * 10, Math.min( h - 4, y0 + len ) );
			ctx.stroke();
		}
		ctx.strokeStyle = '#5a4a36';
		ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( x0 - 20, y0 - 6 ); ctx.lineTo( x0 + 20, y0 + 4 ); ctx.stroke();
	}
}

// Cook pine branch: brown branch along the middle (u along), foxtail branchlets curving down / up
function drawPineBranch( ctx, w, h, rnd ) {
	const cols = [ '#2f4a26', '#365428', '#2a4222', '#3c5a2c' ];
	const cy = h * 0.42;
	for ( let k = 0; k < 34; k ++ ) {
		const x0 = w * ( 0.04 + 0.92 * ( k / 34 ) ) + rnd() * 8;
		for ( const sd of [ - 1, 1 ] ) {
			if ( rnd() < 0.15 ) continue;
			const len = h * ( 0.18 + 0.3 * rnd() ) * ( 1 - 0.45 * ( k / 34 ) );
			ctx.strokeStyle = cols[ Math.floor( rnd() * cols.length ) ];
			ctx.lineWidth = 9 + rnd() * 5;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo( x0, cy );
			// the foxtails droop: the lower ones hang, the upper ones arc over
			ctx.quadraticCurveTo( x0 + 26 + rnd() * 20, cy + sd * len * 0.5, x0 + 34 + rnd() * 20, cy + sd * len * ( sd > 0 ? 1 : 0.6 ) + ( sd < 0 ? len * 0.3 : 0 ) );
			ctx.stroke();
			// scale texture: short dark strokes
			ctx.strokeStyle = 'rgba(20,34,16,0.5)';
			ctx.lineWidth = 1;
			ctx.lineCap = 'butt';
		}
	}
	ctx.strokeStyle = '#5b4632';
	ctx.lineWidth = 7;
	ctx.beginPath(); ctx.moveTo( 0, cy ); ctx.lineTo( w * 0.97, cy + 6 ); ctx.stroke();
	ctx.lineCap = 'butt';
}

// tall grass tuft: blades fanning out from the base at the bottom centre
function drawGrass( ctx, w, h, rnd ) {
	const cols = [ hex( 0x6d8a36 ), hex( 0x7e9a40 ), hex( 0x5f7c2e ), hex( 0x8fa24a ), hex( 0x9a9a52 ) ];
	for ( let k = 0; k < 90; k ++ ) {
		const bx = w * ( 0.35 + 0.3 * rnd() );
		const ang = ( rnd() - 0.5 ) * 1.5;
		const len = h * ( 0.55 + 0.42 * rnd() );
		const bend = ( rnd() - 0.5 ) * 0.9 + Math.sign( ang ) * 0.35;
		const wid = 3 + rnd() * 3.5;
		const col = cols[ Math.floor( rnd() * cols.length ) ];
		const ex = bx + Math.sin( ang ) * len + bend * len * 0.35, ey = h - Math.cos( ang ) * len * 0.95;
		const mx = bx + Math.sin( ang ) * len * 0.5, my = h - len * 0.55;
		ctx.beginPath();
		ctx.moveTo( bx - wid, h );
		ctx.quadraticCurveTo( mx - wid * 0.7, my, ex, ey );
		ctx.quadraticCurveTo( mx + wid * 0.7, my, bx + wid, h );
		ctx.closePath();
		const g = ctx.createLinearGradient( 0, h, 0, ey );
		g.addColorStop( 0, css( col, 0.7 ) );
		g.addColorStop( 0.6, css( col ) );
		g.addColorStop( 1, css( mixc( col, hex( 0xc8b870 ), 0.5 ) ) );
		ctx.fillStyle = g;
		ctx.fill();
	}
}

// seed heads: feathery plumes on thin stalks
function drawPlume( ctx, w, h, rnd ) {
	for ( let k = 0; k < 7; k ++ ) {
		const x = w * ( 0.2 + 0.6 * rnd() );
		const top = h * ( 0.02 + 0.2 * rnd() );
		ctx.strokeStyle = '#8a8250';
		ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.moveTo( w / 2, h ); ctx.quadraticCurveTo( x, h * 0.5, x, top + h * 0.25 ); ctx.stroke();
		for ( let q = 0; q < 60; q ++ ) {
			const t = rnd();
			const y = top + t * h * 0.3;
			const sp = 16 * ( 1 - t * 0.5 );
			ctx.strokeStyle = rnd() < 0.5 ? '#d8c89a' : '#c0a878';
			ctx.lineWidth = 1.2;
			ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + ( rnd() - 0.5 ) * sp, y + 6 + rnd() * 8 ); ctx.stroke();
		}
	}
}

// sugar cane: segmented stalks with long arching leaves from the upper part
function drawCane( ctx, w, h, rnd ) {
	for ( let k = 0; k < 9; k ++ ) {
		const x = w * ( 0.08 + 0.84 * ( k + rnd() ) / 9 );
		const top = h * ( 0.15 + 0.2 * rnd() );
		const wid = 7 + rnd() * 3;
		const g = ctx.createLinearGradient( x - wid, 0, x + wid, 0 );
		g.addColorStop( 0, '#8a8a3a' ); g.addColorStop( 0.5, '#b8b060' ); g.addColorStop( 1, '#7a7c32' );
		ctx.fillStyle = g;
		ctx.fillRect( x - wid / 2, top, wid, h - top );
		ctx.fillStyle = 'rgba(70,60,30,0.7)';
		for ( let y = top + 20; y < h; y += 26 + rnd() * 10 ) ctx.fillRect( x - wid / 2, y, wid, 3 );
	}
	const cols = [ hex( 0x5e8a2c ), hex( 0x6e9a36 ), hex( 0x527a26 ), hex( 0x86a040 ) ];
	for ( let k = 0; k < 70; k ++ ) {
		const x = w * ( 0.08 + 0.84 * rnd() );
		const y = h * ( 0.12 + 0.55 * rnd() );
		const dir = rnd() < 0.5 ? - 1 : 1;
		const len = w * ( 0.25 + 0.35 * rnd() );
		const col = cols[ Math.floor( rnd() * cols.length ) ];
		ctx.beginPath();
		ctx.moveTo( x, y );
		ctx.quadraticCurveTo( x + dir * len * 0.5, y - len * 0.45, x + dir * len, y + len * ( 0.1 + rnd() * 0.3 ) );
		ctx.quadraticCurveTo( x + dir * len * 0.5, y - len * 0.45 + 9, x, y + 8 );
		ctx.closePath();
		ctx.fillStyle = css( col, 0.85 + rnd() * 0.3 );
		ctx.fill();
	}
}

// ti leaf: glossy lanceolate blade (u across, midrib at 0.5), a pale midrib
function drawTi( ctx, w, h ) {
	const g = ctx.createLinearGradient( 0, 0, w, 0 );
	g.addColorStop( 0, '#3f6e28' ); g.addColorStop( 0.45, '#5c8e36' ); g.addColorStop( 0.5, '#9ab45a' ); g.addColorStop( 0.55, '#5c8e36' ); g.addColorStop( 1, '#3a6624' );
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo( w / 2, 0 );
	ctx.bezierCurveTo( w * 0.62, h * 0.05, w * 0.98, h * 0.3, w * 0.98, h * 0.55 );
	ctx.bezierCurveTo( w * 0.96, h * 0.8, w * 0.6, h * 0.95, w / 2, h );
	ctx.bezierCurveTo( w * 0.4, h * 0.95, w * 0.04, h * 0.8, w * 0.02, h * 0.55 );
	ctx.bezierCurveTo( w * 0.02, h * 0.3, w * 0.38, h * 0.05, w / 2, 0 );
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,220,0.15)';
	for ( let y = 20; y < h; y += 9 ) { ctx.beginPath(); ctx.moveTo( w / 2, y ); ctx.lineTo( w * 0.05, y + 30 ); ctx.moveTo( w / 2, y ); ctx.lineTo( w * 0.95, y + 30 ); ctx.stroke(); }
}

// long narrow spiny leaf (pineapple), u across, v base .. tip
function drawPandan( ctx, w, h ) {
	const g = ctx.createLinearGradient( 0, 0, w, 0 );
	g.addColorStop( 0, '#5a7250' ); g.addColorStop( 0.5, '#8aa082' ); g.addColorStop( 1, '#566e4c' );
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo( w * 0.05, 0 );
	ctx.lineTo( w * 0.95, 0 );
	ctx.lineTo( w * 0.5, h );
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#a07a50';
	for ( let y = 10; y < h; y += 14 ) { const e = 0.5 * ( 1 - y / h ) * w; ctx.fillRect( w / 2 - e - 2, y, 3, 2 ); ctx.fillRect( w / 2 + e - 1, y, 3, 2 ); }
}

// ---- the atlas -------------------------------------------------------------------------------------------

export function buildLeafAtlas() {
	const c = document.createElement( 'canvas' );
	c.width = c.height = ATLAS;
	const ctx = c.getContext( '2d', { willReadFrequently: true } );
	ctx.clearRect( 0, 0, ATLAS, ATLAS );
	const rnd = rng( 1337 );
	const tile = ( name, fn ) => {
		const t = TILE[ name ];
		clipTile( ctx, t );
		fn( ctx, t[ 2 ], t[ 3 ], rnd );
		ctx.restore();
	};
	tile( 'FROND', drawFrond );
	tile( 'FERN', drawFern );
	tile( 'BANANA', drawBanana );
	tile( 'BROAD', ( x, w, h, r ) => drawCluster( x, w, h, r, {
		grid: 3, leaves: 5, L: 62, W: 26, holes: 0.12, opts: { tip: 0.35, base: 0.3, light: 1.25, dark: 0.85 },
		cols: [ hex( 0x7f9a62 ), hex( 0x8aa46c ), hex( 0x71905a ), hex( 0x98ae7a ) ], twig: '#6a6048',
	} ) );
	tile( 'SMALL', ( x, w, h, r ) => drawCluster( x, w, h, r, {
		grid: 5, leaves: 7, L: 24, W: 11, holes: 0.2, opts: { tip: 0.2, base: 0.4 },
		cols: [ hex( 0x3e5a28 ), hex( 0x4a6a2e ), hex( 0x56703a ), hex( 0x6a7a44 ) ],
		flowers: { p: 0.22, draw: lehua },
	} ) );
	tile( 'FINE', drawFine );
	tile( 'SHRUB', ( x, w, h, r ) => drawCluster( x, w, h, r, {
		grid: 4, leaves: 7, L: 36, W: 15, holes: 0.12, opts: { tip: 0.45, base: 0.35, light: 1.3 },
		cols: [ hex( 0x3c6a26 ), hex( 0x467a2c ), hex( 0x2f5a20 ), hex( 0x558434 ) ],
		flowers: { p: 0.16, draw: hibiscus },
	} ) );
	tile( 'NAUPAKA', ( x, w, h, r ) => drawCluster( x, w, h, r, {
		grid: 4, leaves: 9, L: 40, W: 16, holes: 0.08, opts: { tip: 0.25, base: 0.5, light: 1.35, dark: 0.9 },
		cols: [ hex( 0x6ea03a ), hex( 0x7cae44 ), hex( 0x62923a ), hex( 0x88b64e ) ],
		flowers: { p: 0.35, draw: naupakaFlower }, twig: '#6a7a40',
	} ) );
	tile( 'NEEDLE', drawNeedles );
	tile( 'PINEBR', drawPineBranch );
	tile( 'GRASS', drawGrass );
	tile( 'CANE', drawCane );
	tile( 'TI', drawTi );
	tile( 'PLUME', drawPlume );
	tile( 'PANDAN', drawPandan );
	tile( 'WHITE', ( x, w, h ) => { x.fillStyle = '#ffffff'; x.fillRect( 0, 0, w, h ); } );

	// colour + coverage; transparent texels take the tile's mean colour
	const img = ctx.getImageData( 0, 0, ATLAS, ATLAS );
	const d = img.data;
	for ( const name in TILE ) {
		const [ tx, ty, tw, th ] = TILE[ name ];
		let r = 0, g = 0, b = 0, n = 0;
		for ( let y = ty; y < ty + th; y += 2 ) for ( let x = tx; x < tx + tw; x += 2 ) {
			const o = ( y * ATLAS + x ) * 4;
			if ( d[ o + 3 ] > 200 ) { r += d[ o ]; g += d[ o + 1 ]; b += d[ o + 2 ]; n ++; }
		}
		if ( n ) { r /= n; g /= n; b /= n; } else { r = 80; g = 110; b = 50; }
		for ( let y = ty; y < ty + th; y ++ ) for ( let x = tx; x < tx + tw; x ++ ) {
			const o = ( y * ATLAS + x ) * 4;
			const a = d[ o + 3 ];
			if ( a < 255 ) {
				const k = a / 255;
				d[ o ] = d[ o ] * k + r * ( 1 - k ); d[ o + 1 ] = d[ o + 1 ] * k + g * ( 1 - k ); d[ o + 2 ] = d[ o + 2 ] * k + b * ( 1 - k );
			}
		}
	}
	const t = new THREE.DataTexture( new Uint8Array( d.buffer ), ATLAS, ATLAS, THREE.RGBAFormat, THREE.UnsignedByteType );
	t.colorSpace = THREE.SRGBColorSpace;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.anisotropy = 4;
	t.needsUpdate = true;
	t.name = 'vegLeafAtlas';
	return { texture: t, canvas: c };
}
