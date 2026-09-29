// Procedural textures of the roads module, all drawn once at start-up on the main thread:
//   noise   tileable value noise at three scales (road wear, puddles, stains)
//   cracks  a tileable network of asphalt cracks (tar snakes)
//   atlas   the static sign atlas (street name blades, mile markers, regulatory / warning signs, outbreak
//           notices) + the runway digits; cell layout in kinds.js
//   decals  blood, skids, oil, scorch, glass, papers, stains, graffiti and the lamp light pool
//   guideSign(...)  one highway guide / welcome sign (canvas per sign, only for the few in range)
import * as THREE from 'three';
import { canvasTexture } from '../../render/Materials.js';
import { STREET_NAMES, BASE_NAMES } from './network.js';
import { ATLAS_SIZE, atlasStreet, atlasMile, atlasMisc, atlasWide, atlasDigit, MISC, WIDE } from './kinds.js';

export const ATLAS_H = 1408; // the atlas only uses the top 1376 rows of its 2048 x 2048 layout

// ---- tileable value noise (RGBA = 4, 16, 64 cells per tile, cellular) -------------------------------

function hash( i, j, s ) {
	let n = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( s, 1442695041 );
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
}

function tileNoise( x, y, cells, seed ) {
	const fx = x * cells, fy = y * cells;
	const i = Math.floor( fx ), j = Math.floor( fy ), tx = fx - i, ty = fy - j;
	const u = tx * tx * ( 3 - 2 * tx ), v = ty * ty * ( 3 - 2 * ty );
	const w = ( a ) => ( ( a % cells ) + cells ) % cells;
	const a = hash( w( i ), w( j ), seed ), b = hash( w( i + 1 ), w( j ), seed );
	const c = hash( w( i ), w( j + 1 ), seed ), d = hash( w( i + 1 ), w( j + 1 ), seed );
	return ( a * ( 1 - u ) + b * u ) * ( 1 - v ) + ( c * ( 1 - u ) + d * u ) * v;
}

let _noise = null;
export function noiseTexture() {
	if ( _noise ) return _noise;
	const N = 256;
	const data = new Uint8Array( N * N * 4 );
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		const px = x / N, py = y / N;
		const o = ( y * N + x ) * 4;
		const f = ( c, s ) => tileNoise( px, py, c, s ) * 0.6 + tileNoise( px, py, c * 2, s + 1 ) * 0.28 + tileNoise( px, py, c * 4, s + 2 ) * 0.12;
		data[ o ] = f( 4, 1 ) * 255;
		data[ o + 1 ] = f( 16, 7 ) * 255;
		data[ o + 2 ] = f( 64, 13 ) * 255;
		// cellular: distance to the nearest of 16x16 jittered points (pebbles, flakes)
		const C = 16, cx = Math.floor( px * C ), cy = Math.floor( py * C );
		let best = 9;
		for ( let b = - 1; b <= 1; b ++ ) for ( let a = - 1; a <= 1; a ++ ) {
			const ii = ( ( cx + a ) % C + C ) % C, jj = ( ( cy + b ) % C + C ) % C;
			const qx = ( cx + a + hash( ii, jj, 21 ) ) / C, qy = ( cy + b + hash( ii, jj, 22 ) ) / C;
			best = Math.min( best, Math.hypot( qx - px, qy - py ) * C );
		}
		data[ o + 3 ] = Math.min( 1, best ) * 255;
	}
	const t = new THREE.DataTexture( data, N, N, THREE.RGBAFormat );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = THREE.LinearFilter;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	_noise = t;
	return t;
}

// ---- crack network (R = crack, G = sealed tar snake) ------------------------------------------------------

let _cracks = null;
export function crackTexture() {
	if ( _cracks ) return _cracks;
	let s = 12345;
	const rnd = () => { s = ( s * 1664525 + 1013904223 ) >>> 0; return s / 4294967296; };
	_cracks = canvasTexture( 512, 512, ( ctx, W, H ) => {
		ctx.fillStyle = '#000';
		ctx.fillRect( 0, 0, W, H );
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		// every stroke is drawn nine times (wrapped) so the tile repeats seamlessly
		const stroke = ( pts, width, color ) => {
			for ( let oy = - 1; oy <= 1; oy ++ ) for ( let ox = - 1; ox <= 1; ox ++ ) {
				ctx.beginPath();
				pts.forEach( ( [ x, y ], i ) => i ? ctx.lineTo( x + ox * W, y + oy * H ) : ctx.moveTo( x + ox * W, y + oy * H ) );
				ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
			}
		};
		const crack = ( x, y, ang, len, width, depth, color ) => {
			const pts = [ [ x, y ] ];
			for ( let k = 0; k < len; k ++ ) {
				ang += ( rnd() - 0.5 ) * 0.9;
				x += Math.cos( ang ) * 6; y += Math.sin( ang ) * 6;
				pts.push( [ x, y ] );
				if ( depth < 2 && rnd() < 0.06 ) crack( x, y, ang + ( rnd() < 0.5 ? 1 : - 1 ) * ( 0.6 + rnd() ), len * 0.4, width * 0.7, depth + 1, color );
			}
			stroke( pts, width, color );
		};
		// long transverse / longitudinal cracks, alligator patches, sealed snakes
		for ( let k = 0; k < 7; k ++ ) crack( rnd() * W, rnd() * H, rnd() < 0.5 ? rnd() * 0.4 : Math.PI / 2 + ( rnd() - 0.5 ) * 0.4, 40 + rnd() * 50, 0.9 + rnd() * 0.7, 0, '#f00' );
		for ( let k = 0; k < 3; k ++ ) {
			const cx = rnd() * W, cy = rnd() * H;
			for ( let m = 0; m < 14; m ++ ) crack( cx + ( rnd() - 0.5 ) * 60, cy + ( rnd() - 0.5 ) * 60, rnd() * 6.28, 5 + rnd() * 6, 0.8, 2, '#f00' );
		}
		ctx.globalCompositeOperation = 'lighter';
		for ( let k = 0; k < 4; k ++ ) crack( rnd() * W, rnd() * H, rnd() * 6.28, 30 + rnd() * 40, 2.5 + rnd() * 2, 1, '#0f0' );
		ctx.globalCompositeOperation = 'source-over';
	}, { srgb: false } );
	return _cracks;
}

// ---- sign atlas -------------------------------------------------------------------------------------------------

const FONT = '"Roboto Condensed", "Arial Narrow", "DejaVu Sans Condensed", "Liberation Sans Narrow", Arial, sans-serif';

function roundRect( ctx, x, y, w, h, r ) {
	ctx.beginPath();
	ctx.moveTo( x + r, y ); ctx.lineTo( x + w - r, y ); ctx.quadraticCurveTo( x + w, y, x + w, y + r );
	ctx.lineTo( x + w, y + h - r ); ctx.quadraticCurveTo( x + w, y + h, x + w - r, y + h );
	ctx.lineTo( x + r, y + h ); ctx.quadraticCurveTo( x, y + h, x, y + h - r );
	ctx.lineTo( x, y + r ); ctx.quadraticCurveTo( x, y, x + r, y );
	ctx.closePath();
}

// text squeezed to fit a width
function fitText( ctx, text, x, y, maxW, size, weight = 'bold' ) {
	ctx.font = `${weight} ${size}px ${FONT}`;
	const w = ctx.measureText( text ).width;
	ctx.save();
	ctx.translate( x, y );
	if ( w > maxW ) ctx.scale( maxW / w, 1 );
	ctx.fillText( text, 0, 0 );
	ctx.restore();
}

// weathering: grime, sun fade and a few scratches over a drawn cell
function weather( ctx, x, y, w, h, seed, amt = 1 ) {
	let s = seed * 9301 + 49297;
	const rnd = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
	ctx.save();
	ctx.beginPath(); ctx.rect( x, y, w, h ); ctx.clip();
	for ( let k = 0; k < 10 * amt; k ++ ) {
		const gx = x + rnd() * w, gy = y + rnd() * h, r = ( 0.1 + rnd() * 0.4 ) * Math.max( w, h );
		const g = ctx.createRadialGradient( gx, gy, 0, gx, gy, r );
		g.addColorStop( 0, `rgba(60,50,35,${0.12 * amt})` ); g.addColorStop( 1, 'rgba(60,50,35,0)' );
		ctx.fillStyle = g; ctx.fillRect( x, y, w, h );
	}
	ctx.strokeStyle = `rgba(255,255,255,${0.18 * amt})`;
	ctx.lineWidth = 1;
	for ( let k = 0; k < 4 * amt; k ++ ) {
		const sx = x + rnd() * w, sy = y + rnd() * h;
		ctx.beginPath(); ctx.moveTo( sx, sy ); ctx.lineTo( sx + ( rnd() - 0.5 ) * w * 0.3, sy + ( rnd() - 0.5 ) * h * 0.3 ); ctx.stroke();
	}
	// bottom run-off streaks
	const gr = ctx.createLinearGradient( 0, y + h * 0.6, 0, y + h );
	gr.addColorStop( 0, 'rgba(40,30,20,0)' ); gr.addColorStop( 1, `rgba(40,30,20,${0.22 * amt})` );
	ctx.fillStyle = gr; ctx.fillRect( x, y, w, h );
	ctx.restore();
}

let _atlas = null;
export function signAtlas() {
	if ( _atlas ) return _atlas;
	_atlas = canvasTexture( ATLAS_SIZE, ATLAS_H, ( ctx ) => {
		// transparent where a cell doesn't paint: shaped signs (octagon, triangle, diamonds, shields) are cut out
		ctx.clearRect( 0, 0, ATLAS_SIZE, ATLAS_H );
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		// street name blades: green with a white border, the name in white caps-and-lower
		const names = [ ...STREET_NAMES ];
		while ( names.length < 80 ) names.push( 'Main St' );
		const all = [ ...names.slice( 0, 80 ), ...BASE_NAMES ];
		all.forEach( ( n, i ) => {
			const [ x, y, w, h ] = atlasStreet( i );
			ctx.fillStyle = i >= 80 ? '#5a4631' : '#12603a';
			ctx.fillRect( x, y, w, h );
			ctx.strokeStyle = '#e9efe9'; ctx.lineWidth = 2;
			ctx.strokeRect( x + 2, y + 2, w - 4, h - 4 );
			ctx.fillStyle = '#f2f5f2';
			fitText( ctx, n, x + w / 2, y + h / 2 + 1, w - 16, 22 );
			weather( ctx, x, y, w, h, i + 1, 0.6 );
		} );
		// mile markers
		for ( let n = 0; n < 100; n ++ ) {
			const [ x, y, w, h ] = atlasMile( n );
			ctx.fillStyle = '#12603a';
			roundRect( ctx, x + 2, y + 2, w - 4, h - 4, 5 ); ctx.fill();
			ctx.strokeStyle = '#eef'; ctx.lineWidth = 2; roundRect( ctx, x + 5, y + 5, w - 10, h - 10, 4 ); ctx.stroke();
			ctx.fillStyle = '#f4f4f4';
			fitText( ctx, String( n ), x + w / 2, y + h / 2 + 2, w - 16, 34 );
			weather( ctx, x, y, w, h, 200 + n, 0.7 );
		}
		for ( let k = 0; k < 18; k ++ ) { const [ x, y, w, h ] = atlasMisc( k ); drawMisc( ctx, k, x, y, w, h ); weather( ctx, x, y, w, h, 400 + k, 0.8 ); }
		for ( let k = 0; k < 16; k ++ ) { const [ x, y, w, h ] = atlasWide( k ); drawWide( ctx, k, x, y, w, h ); weather( ctx, x, y, w, h, 500 + k, 0.8 ); }
		// runway digits: white on black (the runway shader uses the luminance as paint coverage)
		for ( let d = 0; d < 10; d ++ ) {
			const [ x, y, w, h ] = atlasDigit( d );
			ctx.fillStyle = '#000'; ctx.fillRect( x, y, w, h );
			ctx.fillStyle = '#fff';
			ctx.font = `bold 92px ${FONT}`;
			ctx.save(); ctx.translate( x + w / 2, y + h / 2 + 4 ); ctx.scale( 0.62, 1 ); ctx.fillText( String( d ), 0, 0 ); ctx.restore();
		}
	}, { repeat: false } );
	_atlas.generateMipmaps = true;
	_atlas.minFilter = THREE.LinearMipmapLinearFilter;
	return _atlas;
}

function diamond( ctx, x, y, w, h, fill ) {
	ctx.fillStyle = '#222';
	ctx.beginPath(); ctx.moveTo( x + w / 2, y + 2 ); ctx.lineTo( x + w - 2, y + h / 2 ); ctx.lineTo( x + w / 2, y + h - 2 ); ctx.lineTo( x + 2, y + h / 2 ); ctx.closePath(); ctx.fill();
	ctx.fillStyle = fill;
	ctx.beginPath(); ctx.moveTo( x + w / 2, y + 7 ); ctx.lineTo( x + w - 7, y + h / 2 ); ctx.lineTo( x + w / 2, y + h - 7 ); ctx.lineTo( x + 7, y + h / 2 ); ctx.closePath(); ctx.fill();
}

function drawMisc( ctx, k, x, y, w, h ) {
	const cx = x + w / 2, cy = y + h / 2;
	switch ( k ) {
		case MISC.STOP: {
			const oct = ( r ) => { ctx.beginPath(); for ( let i = 0; i < 8; i ++ ) { const a = ( i + 0.5 ) / 8 * Math.PI * 2; ctx.lineTo( cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ); } ctx.closePath(); };
			ctx.fillStyle = '#f2f2f2'; oct( 64 ); ctx.fill();
			ctx.fillStyle = '#b3121b'; oct( 59 ); ctx.fill();
			ctx.fillStyle = '#f5f5f5'; fitText( ctx, 'STOP', cx, cy + 2, 100, 44 );
			break;
		}
		case MISC.SPEED25: case MISC.SPEED35: case MISC.SPEED45: case MISC.SPEED55: {
			ctx.fillStyle = '#f1f1ec'; ctx.fillRect( x + 14, y + 2, w - 28, h - 4 );
			ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect( x + 18, y + 6, w - 36, h - 12 );
			ctx.fillStyle = '#111';
			fitText( ctx, 'SPEED', cx, y + 24, 80, 18 ); fitText( ctx, 'LIMIT', cx, y + 44, 80, 18 );
			fitText( ctx, [ '25', '35', '45', '55' ][ k - MISC.SPEED25 ], cx, y + 88, 80, 56 );
			break;
		}
		case MISC.BUS: {
			ctx.fillStyle = '#f2c500'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = '#111'; fitText( ctx, 'TheBus', cx, y + 26, 100, 24 );
			ctx.fillRect( cx - 30, cy - 6, 60, 36 );
			ctx.fillStyle = '#f2c500'; ctx.fillRect( cx - 25, cy - 1, 22, 12 ); ctx.fillRect( cx + 3, cy - 1, 22, 12 );
			ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc( cx - 18, cy + 32, 6, 0, 7 ); ctx.arc( cx + 18, cy + 32, 6, 0, 7 ); ctx.fill();
			fitText( ctx, 'STOP', cx, y + h - 14, 100, 16 );
			break;
		}
		case MISC.TSUNAMI: {
			ctx.fillStyle = '#1b4e9b'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = '#fff'; fitText( ctx, 'TSUNAMI', cx, y + 22, 106, 20 ); fitText( ctx, 'HAZARD ZONE', cx, y + 42, 106, 15 );
			ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
			ctx.beginPath(); ctx.moveTo( x + 18, y + 100 ); ctx.quadraticCurveTo( cx - 10, y + 50, cx + 20, y + 78 ); ctx.quadraticCurveTo( cx, y + 64, cx + 6, y + 92 ); ctx.stroke();
			ctx.beginPath(); ctx.moveTo( x + 16, y + 112 ); ctx.lineTo( x + w - 16, y + 112 ); ctx.stroke();
			break;
		}
		case MISC.DNE: {
			ctx.fillStyle = '#f2f2f2'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = '#b3121b'; ctx.beginPath(); ctx.arc( cx, cy, 52, 0, 7 ); ctx.fill();
			ctx.fillStyle = '#fff'; ctx.fillRect( cx - 40, cy - 9, 80, 18 );
			break;
		}
		case MISC.YIELD: {
			ctx.fillStyle = '#b3121b';
			ctx.beginPath(); ctx.moveTo( x + 4, y + 10 ); ctx.lineTo( x + w - 4, y + 10 ); ctx.lineTo( cx, y + h - 6 ); ctx.closePath(); ctx.fill();
			ctx.fillStyle = '#fff';
			ctx.beginPath(); ctx.moveTo( x + 30, y + 26 ); ctx.lineTo( x + w - 30, y + 26 ); ctx.lineTo( cx, y + h - 34 ); ctx.closePath(); ctx.fill();
			ctx.fillStyle = '#b3121b'; fitText( ctx, 'YIELD', cx, y + 44, 52, 15 );
			break;
		}
		case MISC.PED: case MISC.CURVE: case MISC.BIOHAZARD: {
			diamond( ctx, x, y, w, h, k === MISC.PED ? '#d9e021' : '#f2b600' );
			ctx.fillStyle = '#111'; ctx.strokeStyle = '#111';
			if ( k === MISC.PED ) {
				ctx.beginPath(); ctx.arc( cx, cy - 28, 8, 0, 7 ); ctx.fill();
				ctx.lineWidth = 7; ctx.lineCap = 'round';
				ctx.beginPath(); ctx.moveTo( cx, cy - 16 ); ctx.lineTo( cx - 2, cy + 8 ); ctx.lineTo( cx - 14, cy + 30 ); ctx.moveTo( cx - 2, cy + 8 ); ctx.lineTo( cx + 12, cy + 30 );
				ctx.moveTo( cx - 16, cy - 2 ); ctx.lineTo( cx, cy - 12 ); ctx.lineTo( cx + 16, cy + 2 ); ctx.stroke();
			} else if ( k === MISC.CURVE ) {
				ctx.lineWidth = 9;
				ctx.beginPath(); ctx.moveTo( cx - 10, cy + 34 ); ctx.lineTo( cx - 10, cy ); ctx.quadraticCurveTo( cx - 10, cy - 18, cx + 10, cy - 22 ); ctx.stroke();
				ctx.beginPath(); ctx.moveTo( cx + 26, cy - 22 ); ctx.lineTo( cx + 6, cy - 38 ); ctx.lineTo( cx + 6, cy - 6 ); ctx.closePath(); ctx.fill();
			} else {
				ctx.lineWidth = 7;
				for ( let i = 0; i < 3; i ++ ) {
					const a = i / 3 * Math.PI * 2 - Math.PI / 2;
					ctx.beginPath(); ctx.arc( cx + Math.cos( a ) * 14, cy + Math.sin( a ) * 14, 15, 0, 7 ); ctx.stroke();
				}
				ctx.beginPath(); ctx.arc( cx, cy, 6, 0, 7 ); ctx.fill();
				fitText( ctx, 'BIOHAZARD', cx, cy + 40, 60, 11 );
			}
			break;
		}
		case MISC.NO_PARKING: {
			ctx.fillStyle = '#f2f2f2'; ctx.fillRect( x + 14, y + 4, w - 28, h - 8 );
			ctx.fillStyle = '#b3121b'; fitText( ctx, 'NO', cx, y + 30, 80, 28 ); fitText( ctx, 'PARKING', cx, y + 60, 84, 20 );
			ctx.fillStyle = '#111'; fitText( ctx, 'ANY TIME', cx, y + 90, 84, 15 );
			break;
		}
		case MISC.ONE_WAY: {
			ctx.fillStyle = '#111'; ctx.fillRect( x + 2, y + 34, w - 4, 60 );
			ctx.fillStyle = '#fff';
			ctx.beginPath(); ctx.moveTo( x + 10, y + 54 ); ctx.lineTo( x + 90, y + 54 ); ctx.lineTo( x + 90, y + 42 ); ctx.lineTo( x + 120, y + 64 ); ctx.lineTo( x + 90, y + 86 ); ctx.lineTo( x + 90, y + 74 ); ctx.lineTo( x + 10, y + 74 ); ctx.closePath(); ctx.fill();
			ctx.fillStyle = '#111'; fitText( ctx, 'ONE WAY', x + 52, y + 64, 70, 14 );
			break;
		}
		case MISC.H1: {
			ctx.fillStyle = '#fff';
			ctx.beginPath(); ctx.moveTo( x + 10, y + 12 ); ctx.lineTo( x + w - 10, y + 12 ); ctx.quadraticCurveTo( x + w - 4, y + 70, cx, y + h - 6 ); ctx.quadraticCurveTo( x + 4, y + 70, x + 10, y + 12 ); ctx.fill();
			ctx.fillStyle = '#1b3f94';
			ctx.beginPath(); ctx.moveTo( x + 16, y + 40 ); ctx.lineTo( x + w - 16, y + 40 ); ctx.quadraticCurveTo( x + w - 12, y + 76, cx, y + h - 14 ); ctx.quadraticCurveTo( x + 12, y + 76, x + 16, y + 40 ); ctx.fill();
			ctx.fillStyle = '#c4161c'; ctx.fillRect( x + 16, y + 18, w - 32, 20 );
			ctx.fillStyle = '#fff'; fitText( ctx, 'INTERSTATE', cx, y + 28, 80, 11 ); fitText( ctx, 'H-1', cx, y + 76, 84, 40 );
			break;
		}
		case MISC.AIRPORT: {
			ctx.fillStyle = '#1b4e9b'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = '#fff';
			ctx.save(); ctx.translate( cx, cy - 6 ); ctx.rotate( - 0.6 );
			ctx.fillRect( - 6, - 40, 12, 80 ); ctx.beginPath(); ctx.moveTo( - 44, 8 ); ctx.lineTo( 44, 8 ); ctx.lineTo( 6, - 10 ); ctx.lineTo( - 6, - 10 ); ctx.closePath(); ctx.fill();
			ctx.beginPath(); ctx.moveTo( - 18, 40 ); ctx.lineTo( 18, 40 ); ctx.lineTo( 4, 30 ); ctx.lineTo( - 4, 30 ); ctx.closePath(); ctx.fill();
			ctx.restore();
			fitText( ctx, 'AIRPORT', cx, y + h - 16, 100, 16 );
			break;
		}
		case MISC.MILITARY: {
			ctx.fillStyle = '#f2f2f2'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = '#b3121b'; ctx.fillRect( x + 4, y + 4, w - 8, 28 );
			ctx.fillStyle = '#fff'; fitText( ctx, 'WARNING', cx, y + 19, 100, 18 );
			ctx.fillStyle = '#111';
			fitText( ctx, 'RESTRICTED', cx, y + 48, 106, 16 ); fitText( ctx, 'MILITARY', cx, y + 68, 106, 16 ); fitText( ctx, 'INSTALLATION', cx, y + 88, 106, 14 );
			fitText( ctx, 'DEADLY FORCE AUTHORIZED', cx, y + 110, 108, 9 );
			break;
		}
		case MISC.CURFEW: default: {
			// plywood with spray paint
			ctx.fillStyle = '#b89464'; ctx.fillRect( x + 4, y + 4, w - 8, h - 8 );
			ctx.fillStyle = 'rgba(90,60,30,0.3)'; for ( let i = 0; i < 6; i ++ ) ctx.fillRect( x + 4, y + 10 + i * 20, w - 8, 2 );
			ctx.fillStyle = '#a3161a'; ctx.save(); ctx.translate( cx, cy ); ctx.rotate( - 0.08 );
			fitText( ctx, 'DONT', 0, - 30, 100, 26, 'bold' ); fitText( ctx, 'OPEN', 0, 0, 100, 26, 'bold' ); fitText( ctx, 'DEAD INSIDE', 0, 32, 110, 18, 'bold' );
			ctx.restore();
		}
	}
}

function drawWide( ctx, k, x, y, w, h ) {
	const cx = x + w / 2, cy = y + h / 2;
	const plain = ( bg, fg, lines, border = fg ) => {
		ctx.fillStyle = bg; ctx.fillRect( x + 2, y + 2, w - 4, h - 4 );
		ctx.strokeStyle = border; ctx.lineWidth = 5; ctx.strokeRect( x + 8, y + 8, w - 16, h - 16 );
		ctx.fillStyle = fg;
		if ( lines.length === 1 ) fitText( ctx, lines[ 0 ], cx, cy + 3, w - 40, 64 );
		else { fitText( ctx, lines[ 0 ], cx, cy - 22, w - 40, 44 ); fitText( ctx, lines[ 1 ], cx, cy + 28, w - 40, 38 ); }
	};
	const stripes = ( c1, c2 ) => {
		ctx.save(); ctx.beginPath(); ctx.rect( x, y, w, h ); ctx.clip();
		for ( let i = - 6; i < 20; i ++ ) {
			ctx.fillStyle = i % 2 ? c1 : c2;
			ctx.beginPath(); ctx.moveTo( x + i * 40, y ); ctx.lineTo( x + i * 40 + 40, y ); ctx.lineTo( x + i * 40 + 40 + h, y + h ); ctx.lineTo( x + i * 40 + h, y + h ); ctx.closePath(); ctx.fill();
		}
		ctx.restore();
	};
	const spray = ( bg, text, sub ) => {
		ctx.fillStyle = bg; ctx.fillRect( x + 2, y + 2, w - 4, h - 4 );
		ctx.fillStyle = 'rgba(80,55,30,0.25)'; for ( let i = 0; i < 5; i ++ ) ctx.fillRect( x + 2, y + 14 + i * 24, w - 4, 2 );
		ctx.fillStyle = '#9b1216';
		ctx.save(); ctx.translate( cx, cy ); ctx.rotate( - 0.04 ); fitText( ctx, text, 0, sub ? - 16 : 2, w - 60, 62 ); if ( sub ) fitText( ctx, sub, 0, 38, w - 80, 30 ); ctx.restore();
	};
	switch ( k ) {
		case WIDE.ROAD_CLOSED: plain( '#f4f4f0', '#111', [ 'ROAD CLOSED' ] ); break;
		case WIDE.CHECKPOINT_AHEAD: plain( '#f28c00', '#111', [ 'CHECKPOINT AHEAD', 'PREPARE TO STOP' ] ); break;
		case WIDE.QUARANTINE: stripes( '#f2c500', '#111' ); ctx.fillStyle = '#f2c500'; ctx.fillRect( x + 26, y + 18, w - 52, h - 36 ); ctx.fillStyle = '#111'; fitText( ctx, 'QUARANTINE ZONE', cx, cy - 16, w - 80, 40 ); fitText( ctx, 'NO ENTRY', cx, cy + 24, w - 80, 34 ); break;
		case WIDE.TURN_BACK: plain( '#b3121b', '#fff', [ 'TURN BACK', 'AREA CLOSED BY ORDER OF HI-EMA' ], '#fff' ); break;
		case WIDE.RESTRICTED: plain( '#f4f4f0', '#b3121b', [ 'RESTRICTED AREA', 'AUTHORIZED PERSONNEL ONLY' ] ); break;
		case WIDE.EVAC: plain( '#1b4e9b', '#fff', [ 'EVACUATION ROUTE', '→ ALOHA STADIUM' ], '#fff' ); break;
		case WIDE.POLICE_LINE: stripes( '#f2c500', '#f2c500' ); ctx.fillStyle = '#111'; fitText( ctx, 'POLICE LINE — DO NOT CROSS', cx, cy + 3, w - 30, 46 ); break;
		case WIDE.ARMY_HALT: plain( '#3d4a2c', '#f2f2e6', [ 'HALT', 'MILITARY CHECKPOINT — DISMOUNT' ], '#f2f2e6' ); break;
		case WIDE.HELP: spray( '#b89464', 'HELP US', 'WE HAVE KIDS' ); break;
		case WIDE.ALL_STOP: plain( '#b3121b', '#fff', [ 'ALL VEHICLES STOP' ], '#fff' ); break;
		case WIDE.INFECTED: stripes( '#b3121b', '#f4f4f0' ); ctx.fillStyle = '#f4f4f0'; ctx.fillRect( x + 26, y + 18, w - 52, h - 36 ); ctx.fillStyle = '#b3121b'; fitText( ctx, 'INFECTED AREA', cx, cy - 14, w - 80, 42 ); fitText( ctx, 'KEEP OUT', cx, cy + 26, w - 80, 32 ); break;
		case WIDE.STAY_INSIDE: spray( '#c9c4b8', 'STAY INSIDE', 'DO NOT TRUST THE RADIO' ); break;
		case WIDE.DETOUR: plain( '#f28c00', '#111', [ 'DETOUR →' ] ); break;
		case WIDE.NO_TRESPASS: plain( '#f4f4f0', '#111', [ 'NO TRESPASSING', 'U.S. GOVERNMENT PROPERTY' ] ); break;
		case WIDE.CURFEW: plain( '#111', '#f2c500', [ 'CURFEW IN EFFECT', '6 PM – 6 AM · VIOLATORS WILL BE SHOT' ], '#f2c500' ); break;
		case WIDE.SHELTER: default: plain( '#1f6e3a', '#fff', [ 'EMERGENCY SHELTER', 'FOOD · WATER · MEDICAL →' ], '#fff' );
	}
}

// ---- highway guide / welcome signs (one canvas each) ----------------------------------------------------------------

// sign: { kind: 'guide' | 'welcome', text, route, id }; dist: km to the destination (guide signs)
export function guideSign( sign, dist ) {
	const welcome = sign.kind === 'welcome';
	const W = 512, H = 256;
	return canvasTexture( W, H, ( ctx ) => {
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		if ( welcome ) {
			// brown county-style entrance sign
			ctx.fillStyle = '#5b3a1e'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 8; roundRect( ctx, 12, 12, W - 24, H - 24, 18 ); ctx.stroke();
			ctx.fillStyle = '#efe6d2';
			fitText( ctx, 'E komo mai', W / 2, 62, W - 80, 36, 'italic bold' );
			fitText( ctx, sign.text, W / 2, 130, W - 70, 70 );
			fitText( ctx, 'DRIVE WITH ALOHA', W / 2, 200, W - 120, 26 );
		} else {
			ctx.fillStyle = '#0f6a3b'; roundRect( ctx, 0, 0, W, H, 22 ); ctx.fill();
			ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 7; roundRect( ctx, 10, 10, W - 20, H - 20, 16 ); ctx.stroke();
			// route shield
			if ( sign.route ) {
				const inter = sign.route.startsWith( 'H' );
				const sx = 72, sy = 86;
				if ( inter ) {
					ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo( sx - 40, sy - 44 ); ctx.lineTo( sx + 40, sy - 44 ); ctx.quadraticCurveTo( sx + 46, sy + 10, sx, sy + 46 ); ctx.quadraticCurveTo( sx - 46, sy + 10, sx - 40, sy - 44 ); ctx.fill();
					ctx.fillStyle = '#1b3f94'; ctx.beginPath(); ctx.moveTo( sx - 34, sy - 18 ); ctx.lineTo( sx + 34, sy - 18 ); ctx.quadraticCurveTo( sx + 38, sy + 12, sx, sy + 38 ); ctx.quadraticCurveTo( sx - 38, sy + 12, sx - 34, sy - 18 ); ctx.fill();
					ctx.fillStyle = '#c4161c'; ctx.fillRect( sx - 34, sy - 38, 68, 18 );
					ctx.fillStyle = '#fff'; fitText( ctx, sign.route, sx, sy + 8, 60, 30 );
				} else {
					// Hawaiʻi state route: a white warrior-helmet style shield approximated by a rounded shield
					ctx.fillStyle = '#fff'; roundRect( ctx, sx - 40, sy - 42, 80, 84, 26 ); ctx.fill();
					ctx.fillStyle = '#111'; fitText( ctx, sign.route, sx, sy + 4, 64, 38 );
				}
			}
			ctx.fillStyle = '#f7f7f7';
			const tx = sign.route ? 300 : W / 2, tw = sign.route ? 360 : W - 60;
			fitText( ctx, sign.text, tx, 86, tw, 60 );
			// arrow + distance
			ctx.strokeStyle = '#f7f7f7'; ctx.fillStyle = '#f7f7f7'; ctx.lineWidth = 10;
			ctx.beginPath(); ctx.moveTo( 72, 214 ); ctx.lineTo( 72, 170 ); ctx.stroke();
			ctx.beginPath(); ctx.moveTo( 52, 176 ); ctx.lineTo( 72, 148 ); ctx.lineTo( 92, 176 ); ctx.closePath(); ctx.fill();
			if ( dist > 0 ) fitText( ctx, ( dist < 10 ? dist.toFixed( 1 ) : Math.round( dist ) ) + ' mi', 380, 188, 200, 44 );
		}
		weather( ctx, 0, 0, W, H, ( sign.id || 1 ) * 7 + 3, 1.1 );
	}, { repeat: false } );
}

// ---- decal atlas (4 x 4 cells of 256 px; RGB colour, A coverage) ------------------------------------------------------

export const DECAL_CELLS = 4;
export const GLOW_CELL = 12;

let _decals = null;
export function decalAtlas() {
	if ( _decals ) return _decals;
	let s = 777;
	const rnd = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
	_decals = canvasTexture( 1024, 1024, ( ctx ) => {
		ctx.clearRect( 0, 0, 1024, 1024 );
		const cell = ( k, fn ) => { ctx.save(); ctx.translate( ( k % 4 ) * 256, Math.floor( k / 4 ) * 256 ); ctx.beginPath(); ctx.rect( 2, 2, 252, 252 ); ctx.clip(); fn(); ctx.restore(); };
		const blob = ( x, y, r, col ) => { const g = ctx.createRadialGradient( x, y, 0, x, y, r ); g.addColorStop( 0, col ); g.addColorStop( 0.75, col ); g.addColorStop( 1, col.replace( /[\d.]+\)$/, '0)' ) ); ctx.fillStyle = g; ctx.beginPath(); ctx.arc( x, y, r, 0, 7 ); ctx.fill(); };
		const blood = 'rgba(70,4,6,0.92)', bloodDry = 'rgba(52,10,8,0.85)';
		// 0 pool: a lobed puddle with a darker rim
		cell( 0, () => {
			for ( let k = 0; k < 14; k ++ ) { const a = rnd() * 6.28, d = rnd() * 60; blob( 128 + Math.cos( a ) * d, 128 + Math.sin( a ) * d, 30 + rnd() * 40, blood ); }
			for ( let k = 0; k < 20; k ++ ) { const a = rnd() * 6.28, d = 80 + rnd() * 40; blob( 128 + Math.cos( a ) * d, 128 + Math.sin( a ) * d, 2 + rnd() * 6, blood ); }
		} );
		// 1 splat: droplets flung in one direction
		cell( 1, () => {
			blob( 110, 128, 36, blood );
			for ( let k = 0; k < 60; k ++ ) { const a = ( rnd() - 0.5 ) * 1.6, d = 20 + rnd() * 110; blob( 110 + Math.cos( a ) * d, 128 + Math.sin( a ) * d, 1.5 + rnd() * 7 * ( 1 - d / 140 ), blood ); }
		} );
		// 2 drag: a smeared trail along the cell's v axis
		cell( 2, () => {
			for ( let y = 250; y > 10; y -= 3 ) {
				const w = 26 + Math.sin( y * 0.05 ) * 6 + rnd() * 6;
				ctx.fillStyle = `rgba(62,6,6,${0.25 + 0.6 * ( y / 256 ) * rnd()})`;
				ctx.fillRect( 128 - w + ( rnd() - 0.5 ) * 6, y, w * 2, 4 );
			}
			blob( 128, 230, 34, blood );
			for ( let k = 0; k < 6; k ++ ) { ctx.strokeStyle = 'rgba(40,4,4,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( 108 + k * 8, 240 ); ctx.lineTo( 108 + k * 8 + ( rnd() - 0.5 ) * 8, 40 ); ctx.stroke(); }
		} );
		// 3 skid: two dark tyre streaks along v
		cell( 3, () => {
			for ( const x0 of [ 60, 196 ] ) for ( let y = 0; y < 256; y += 2 ) {
				ctx.fillStyle = `rgba(8,8,8,${0.35 + 0.35 * Math.sin( y * 0.07 + x0 ) * Math.sin( y * 0.013 )})`;
				ctx.fillRect( x0 - 22 + Math.sin( y * 0.02 ) * 4, y, 44, 2 );
			}
		} );
		// 4 oil: dark glossy stain with an iridescent edge
		cell( 4, () => { for ( let k = 0; k < 9; k ++ ) blob( 128 + ( rnd() - 0.5 ) * 90, 128 + ( rnd() - 0.5 ) * 90, 30 + rnd() * 40, 'rgba(10,9,8,0.8)' ); } );
		// 5 scorch: burnt asphalt under a torched car
		cell( 5, () => {
			const g = ctx.createRadialGradient( 128, 128, 10, 128, 128, 126 );
			g.addColorStop( 0, 'rgba(5,4,3,0.95)' ); g.addColorStop( 0.55, 'rgba(12,10,8,0.8)' ); g.addColorStop( 1, 'rgba(20,18,15,0)' );
			ctx.fillStyle = g; ctx.fillRect( 0, 0, 256, 256 );
			for ( let k = 0; k < 40; k ++ ) blob( rnd() * 256, rnd() * 256, 4 + rnd() * 14, 'rgba(90,80,70,0.25)' );
		} );
		// 6 glass: glittering fragments
		cell( 6, () => {
			for ( let k = 0; k < 420; k ++ ) {
				const a = rnd() * 6.28, d = Math.pow( rnd(), 0.7 ) * 120;
				const x = 128 + Math.cos( a ) * d, y = 128 + Math.sin( a ) * d, r = 1 + rnd() * 3.5;
				ctx.fillStyle = `rgba(${200 + rnd() * 55},${220 + rnd() * 35},${225 + rnd() * 30},${0.55 + rnd() * 0.4})`;
				ctx.beginPath(); ctx.moveTo( x, y - r ); ctx.lineTo( x + r, y + r * 0.6 ); ctx.lineTo( x - r * 0.8, y + r ); ctx.closePath(); ctx.fill();
			}
		} );
		// 7 papers: scattered sheets and flyers
		cell( 7, () => {
			for ( let k = 0; k < 22; k ++ ) {
				ctx.save(); ctx.translate( 20 + rnd() * 216, 20 + rnd() * 216 ); ctx.rotate( rnd() * 6.28 );
				const c = 200 + rnd() * 55;
				ctx.fillStyle = rnd() < 0.2 ? `rgba(230,210,120,0.95)` : `rgba(${c},${c},${c - 10},0.95)`;
				ctx.fillRect( - 14, - 18, 28, 36 );
				ctx.fillStyle = 'rgba(40,40,40,0.35)'; for ( let l = 0; l < 6; l ++ ) ctx.fillRect( - 10, - 13 + l * 5, 20 * ( 0.5 + rnd() * 0.5 ), 1.5 );
				ctx.restore();
			}
		} );
		// 8 stain: grime / dried liquid
		cell( 8, () => { for ( let k = 0; k < 12; k ++ ) blob( 128 + ( rnd() - 0.5 ) * 110, 128 + ( rnd() - 0.5 ) * 110, 20 + rnd() * 40, 'rgba(40,32,22,0.35)' ); } );
		// 9 bloody footprints walking along v
		cell( 9, () => {
			for ( let k = 0; k < 7; k ++ ) {
				const y = 236 - k * 34, x = 128 + ( k % 2 ? 20 : - 20 ), a = 1 - k / 9;
				ctx.fillStyle = `rgba(66,6,6,${0.85 * a})`;
				ctx.beginPath(); ctx.ellipse( x, y, 9, 15, 0, 0, 7 ); ctx.fill();
				ctx.beginPath(); ctx.ellipse( x, y + 20, 7, 8, 0, 0, 7 ); ctx.fill();
			}
		} );
		// 10 tyre marks: a curving burnout
		cell( 10, () => {
			ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(10,10,10,0.55)';
			for ( const o of [ - 30, 30 ] ) { ctx.beginPath(); ctx.moveTo( 128 + o, 256 ); ctx.bezierCurveTo( 128 + o, 150, 60 + o, 110, 80 + o, 0 ); ctx.stroke(); }
		} );
		// 11 graffiti: a sprayed warning
		cell( 11, () => {
			ctx.fillStyle = 'rgba(200,20,20,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.font = `bold 58px ${FONT}`; ctx.fillText( 'NO', 128, 80 ); ctx.fillText( 'ENTRY', 128, 150 );
			ctx.fillStyle = 'rgba(200,20,20,0.5)'; for ( let k = 0; k < 30; k ++ ) blob( 30 + rnd() * 196, 40 + rnd() * 160, 1 + rnd() * 3, 'rgba(200,20,20,0.6)' );
		} );
		// 12 glow: the light pool under a lamp (additive)
		cell( GLOW_CELL, () => {
			const g = ctx.createRadialGradient( 128, 128, 0, 128, 128, 126 );
			g.addColorStop( 0, 'rgba(255,255,255,1)' ); g.addColorStop( 0.35, 'rgba(255,255,255,0.45)' ); g.addColorStop( 1, 'rgba(255,255,255,0)' );
			ctx.fillStyle = g; ctx.fillRect( 0, 0, 256, 256 );
		} );
	}, { repeat: false } );
	_decals.generateMipmaps = true;
	_decals.minFilter = THREE.LinearMipmapLinearFilter;
	return _decals;
}
