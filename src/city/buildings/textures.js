// Textures of the buildings module, assembled once on the main thread:
//   albedo array  512² layers in the order of data.js L: the CC0 photo textures (already preloaded by the world)
//                 plus procedural ones (wood, ceiling tiles, shelf products, books, lattice, lino, terrazzo,
//                 concrete block, parking stalls, wall tiles)
//   normal array  256² layers, same order (flat where a layer has no relief)
//   gains         per layer: painted surfaces are normalised so the vertex tint sets their colour; natural
//                 ones (brick, roof tiles, asphalt...) keep their own
//   sign atlas    names.js
//   decal atlas   blood, smears, papers, dirt and glass for the interiors' outbreak dressing
import * as THREE from 'three';
import { tex } from '../../render/Materials.js';
import { L, TEX_LAYERS } from './data.js';
import { paintSignAtlas } from './names.js';

export const LAYERS = 34; // 0..31 and 33 surfaces, 32 = sign atlas (sampled from its own texture)
const N = 512, NN = 256;

// layers whose colour comes from the vertex tint (texture = detail only)
const PAINTED = new Set( [ L.stucco, L.plaster, L.beige, L.panels, L.planks, L.oldplanks, L.tinroof, L.concrete, L.metal, L.fabric, L.carpet,
	L.cmu, L.tilewall, L.ceiltile, L.wood, L.tiles, L.lino, L.spandrel ] );

// contrast kept for the painted layers (1 = the photo's own)
const SOFT = { [ L.plaster ]: 0.35, [ L.stucco ]: 0.55, [ L.beige ]: 0.5, [ L.concrete ]: 0.7, [ L.cmu ]: 0.9, [ L.carpet ]: 0.7, [ L.fabric ]: 0.8 };

function rngOf( seed ) {
	let a = seed >>> 0;
	return () => { a = ( a + 0x6D2B79F5 ) | 0; let t = Math.imul( a ^ ( a >>> 15 ), 1 | a ); t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t; return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296; };
}

function canvas( n ) { const c = document.createElement( 'canvas' ); c.width = c.height = n; return c; }

// ---- procedural layers (albedo canvas + optional height canvas for the normals) ---------------------------------

function procedural( layer ) {
	const c = canvas( N ), x = c.getContext( '2d' );
	let hgt = null;
	const H = () => { hgt = canvas( N ); const h = hgt.getContext( '2d' ); h.fillStyle = '#808080'; h.fillRect( 0, 0, N, N ); return h; };
	const R = rngOf( layer * 7919 );
	const noiseFill = ( base, amp, cell = 2 ) => {
		const img = x.createImageData( N, N ), d = img.data;
		for ( let i = 0; i < N * N; i ++ ) {
			const px = i % N, py = ( i / N ) | 0;
			const n = ( ( Math.sin( px * 12.9898 / cell + py * 78.233 / cell ) * 43758.5453 ) % 1 + 1 ) % 1;
			const v = ( R() * 0.6 + n * 0.4 - 0.5 ) * amp;
			d[ i * 4 ] = base[ 0 ] + v; d[ i * 4 + 1 ] = base[ 1 ] + v; d[ i * 4 + 2 ] = base[ 2 ] + v; d[ i * 4 + 3 ] = 255;
		}
		x.putImageData( img, 0, 0 );
	};
	switch ( layer ) {
		case L.wood: {
			// planed wood: long grain streaks (furniture, doors, counters, pews); 1 repeat = 1 m
			x.fillStyle = '#b08458'; x.fillRect( 0, 0, N, N );
			for ( let i = 0; i < 900; i ++ ) {
				const y = R() * N, w = 1 + R() * 3, a = 0.05 + R() * 0.12;
				x.fillStyle = R() < 0.5 ? `rgba(70,40,20,${a})` : `rgba(230,190,140,${a * 0.7})`;
				x.fillRect( 0, y, N, w );
			}
			for ( let i = 0; i < 12; i ++ ) { x.fillStyle = 'rgba(60,34,16,0.25)'; x.beginPath(); x.ellipse( R() * N, R() * N, 8 + R() * 10, 3 + R() * 3, 0, 0, Math.PI * 2 ); x.fill(); }
			break;
		}
		case L.ceiltile: {
			// 0.6 m acoustic tiles in a T-bar grid; the texture repeats every 1.2 m
			noiseFill( [ 226, 226, 220 ], 22, 1 );
			for ( let i = 0; i < 4000; i ++ ) { x.fillStyle = `rgba(90,90,85,${0.1 + R() * 0.15})`; x.fillRect( R() * N, R() * N, 1.5, 1.5 ); }
			const h = H();
			x.fillStyle = '#f2f2ee'; h.fillStyle = '#ffffff';
			for ( let k = 0; k <= 2; k ++ ) { const p = k * N / 2 - 5; x.fillRect( p, 0, 10, N ); x.fillRect( 0, p, N, 10 ); h.fillRect( p, 0, 10, N ); h.fillRect( 0, p, N, 10 ); }
			// water stains
			for ( let i = 0; i < 3; i ++ ) { const g = x.createRadialGradient( R() * N, R() * N, 2, R() * N, R() * N, 60 + R() * 60 ); g.addColorStop( 0, 'rgba(150,120,60,0.25)' ); g.addColorStop( 1, 'rgba(150,120,60,0)' ); x.fillStyle = g; x.fillRect( 0, 0, N, N ); }
			break;
		}
		case L.products: {
			// a shelf face packed with boxes, cans and bottles: 1 repeat = 1.2 m wide, 0.4 m tall (one shelf bay)
			x.fillStyle = '#2a2a2a'; x.fillRect( 0, 0, N, N );
			const cols = [ '#c8302a', '#e8c040', '#2e6fb4', '#f2f2ea', '#3a9a4a', '#e07a2a', '#7a3a8a', '#d0d0c8', '#8a5a30', '#20a0b0', '#f4a0b0', '#303030' ];
			for ( let row = 0; row < 4; row ++ ) {
				let px = 0;
				const y0 = row * N / 4, rh = N / 4;
				while ( px < N ) {
					const w = 10 + R() * 34, hh = rh * ( 0.45 + R() * 0.45 );
					const col = cols[ ( R() * cols.length ) | 0 ];
					const n = 1 + ( ( R() * 4 ) | 0 );
					for ( let k = 0; k < n && px < N; k ++ ) {
						x.fillStyle = col; x.fillRect( px + 1, y0 + rh - hh - 4, w - 2, hh );
						x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect( px + 3, y0 + rh - hh * 0.7 - 4, w - 6, hh * 0.25 );
						x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect( px + w - 4, y0 + rh - hh - 4, 3, hh );
						px += w;
					}
					if ( R() < 0.12 ) px += 20 + R() * 40; // gaps: the shelves were raided
				}
				x.fillStyle = '#9a9a96'; x.fillRect( 0, y0 + rh - 5, N, 5 );
			}
			break;
		}
		case L.books: {
			x.fillStyle = '#3a2a1c'; x.fillRect( 0, 0, N, N );
			for ( let row = 0; row < 4; row ++ ) {
				let px = 0; const y0 = row * N / 4, rh = N / 4;
				while ( px < N ) {
					const w = 5 + R() * 12, hh = rh * ( 0.6 + R() * 0.3 );
					const hue = ( R() * 360 ) | 0;
					x.fillStyle = `hsl(${hue},${30 + R() * 40}%,${20 + R() * 35}%)`; x.fillRect( px, y0 + rh - hh - 4, w - 1, hh );
					x.fillStyle = 'rgba(230,210,150,0.5)'; x.fillRect( px + 1, y0 + rh - hh * 0.8, w - 3, 2 );
					px += w;
					if ( R() < 0.05 ) px += 30;
				}
				x.fillStyle = '#5a4030'; x.fillRect( 0, y0 + rh - 5, N, 5 );
			}
			break;
		}
		case L.lattice: {
			// the diagonal lattice skirt under raised plantation houses: 1 repeat = 1.2 m
			x.fillStyle = '#1c1a17'; x.fillRect( 0, 0, N, N );
			const h = H(); h.fillStyle = '#202020'; h.fillRect( 0, 0, N, N );
			x.strokeStyle = '#ecebe4'; h.strokeStyle = '#ffffff';
			x.lineWidth = h.lineWidth = 16;
			for ( let k = - 4; k <= 8; k ++ ) {
				const o = k * N / 4;
				x.beginPath(); x.moveTo( o, 0 ); x.lineTo( o + N, N ); x.stroke();
				h.beginPath(); h.moveTo( o, 0 ); h.lineTo( o + N, N ); h.stroke();
				x.beginPath(); x.moveTo( o + N, 0 ); x.lineTo( o, N ); x.stroke();
				h.beginPath(); h.moveTo( o + N, 0 ); h.lineTo( o, N ); h.stroke();
			}
			break;
		}
		case L.lino: {
			// vinyl floor tiles 0.3 m (checker in two tones); 1 repeat = 1.2 m
			const n = 4;
			for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
				const v = ( i + j ) % 2 ? 236 : 196 + R() * 10;
				x.fillStyle = `rgb(${v},${v},${v - 6})`; x.fillRect( i * N / n, j * N / n, N / n, N / n );
			}
			for ( let i = 0; i < 3000; i ++ ) { x.fillStyle = `rgba(80,80,70,${R() * 0.12})`; x.fillRect( R() * N, R() * N, 2, 2 ); }
			x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2;
			for ( let k = 0; k <= n; k ++ ) { x.beginPath(); x.moveTo( k * N / n, 0 ); x.lineTo( k * N / n, N ); x.moveTo( 0, k * N / n ); x.lineTo( N, k * N / n ); x.stroke(); }
			break;
		}
		case L.terrazzo: {
			x.fillStyle = '#d8d4cc'; x.fillRect( 0, 0, N, N );
			for ( let i = 0; i < 5000; i ++ ) {
				const s = 1 + R() * 5;
				const c = [ '#9a9288', '#6a6a66', '#c8b8a0', '#f4f2ee', '#8a7a68', '#b0a8a0' ][ ( R() * 6 ) | 0 ];
				x.fillStyle = c; x.beginPath(); x.ellipse( R() * N, R() * N, s, s * ( 0.5 + R() * 0.5 ), R() * 3, 0, Math.PI * 2 ); x.fill();
			}
			break;
		}
		case L.cmu: {
			// concrete masonry units 0.4 x 0.2 m, running bond; 1 repeat = 2.4 m (painted, so neutral)
			noiseFill( [ 214, 212, 206 ], 26, 1 );
			for ( let i = 0; i < 9000; i ++ ) { x.fillStyle = `rgba(${R() < 0.5 ? '60,60,58' : '255,255,255'},${R() * 0.12})`; x.fillRect( R() * N, R() * N, 1 + R() * 2, 1 + R() * 2 ); }
			const h = H();
			const bw = N / 6, bh = N / 12;
			x.fillStyle = 'rgba(90,88,84,0.45)'; h.fillStyle = '#404040';
			for ( let r = 0; r < 12; r ++ ) {
				x.fillRect( 0, r * bh - 2, N, 4 ); h.fillRect( 0, r * bh - 2, N, 4 );
				for ( let k = 0; k <= 6; k ++ ) { const px = k * bw + ( r % 2 ? bw / 2 : 0 ); x.fillRect( px - 2, r * bh, 4, bh ); h.fillRect( px - 2, r * bh, 4, bh ); }
			}
			break;
		}
		case L.parking: {
			// asphalt with painted stall lines: 1 repeat = 5.2 m, lines every 2.6 m, a stall 5.2 m deep
			const a = tex( 'asphalt_d' ).image;
			if ( a ) x.drawImage( a, 0, 0, N, N ); else { x.fillStyle = '#555'; x.fillRect( 0, 0, N, N ); }
			x.fillStyle = 'rgba(40,40,40,0.25)'; x.fillRect( 0, 0, N, N );
			x.fillStyle = 'rgba(236,234,226,0.8)';
			for ( const px of [ 0, N / 2 ] ) x.fillRect( px - 5, N * 0.08, 10, N * 0.84 );
			for ( let i = 0; i < 30; i ++ ) { x.fillStyle = `rgba(20,20,20,${R() * 0.25})`; x.beginPath(); x.ellipse( R() * N, R() * N, 10 + R() * 30, 6 + R() * 20, R() * 3, 0, Math.PI * 2 ); x.fill(); }
			break;
		}
		case L.tilewall: {
			// glazed wall tiles 0.15 m; 1 repeat = 0.6 m
			noiseFill( [ 238, 238, 234 ], 10, 1 );
			const h = H();
			const n = 4;
			x.fillStyle = 'rgba(120,120,115,0.6)'; h.fillStyle = '#303030';
			for ( let k = 0; k <= n; k ++ ) { const p = k * N / n; x.fillRect( p - 3, 0, 6, N ); x.fillRect( 0, p - 3, N, 6 ); h.fillRect( p - 3, 0, 6, N ); h.fillRect( 0, p - 3, N, 6 ); }
			break;
		}
		case L.spandrel: {
			// opaque spandrel glass / enamelled panels of a curtain wall: smooth, a faint pane joint every 1.5 m
			noiseFill( [ 200, 200, 200 ], 6, 4 );
			const h = H();
			x.fillStyle = 'rgba(40,40,40,0.35)'; h.fillStyle = '#404040';
			x.fillRect( 0, 0, N, 3 ); h.fillRect( 0, 0, N, 3 );
			break;
		}
		default:
			x.fillStyle = '#ffffff'; x.fillRect( 0, 0, N, N );
	}
	return { albedo: c, height: hgt };
}

// normal map (tangent space, 0..255) from a height canvas, downsampled to NN
function heightToNormal( hc, strength = 3 ) {
	const c = canvas( NN ); const x = c.getContext( '2d' );
	x.drawImage( hc, 0, 0, NN, NN );
	const src = x.getImageData( 0, 0, NN, NN ).data;
	const out = new Uint8Array( NN * NN * 4 );
	const h = ( i, j ) => src[ ( ( ( j + NN ) % NN ) * NN + ( ( i + NN ) % NN ) ) * 4 ] / 255;
	for ( let j = 0; j < NN; j ++ ) for ( let i = 0; i < NN; i ++ ) {
		const dx = ( h( i + 1, j ) - h( i - 1, j ) ) * strength, dy = ( h( i, j + 1 ) - h( i, j - 1 ) ) * strength;
		const l = Math.hypot( dx, dy, 1 );
		const o = ( j * NN + i ) * 4;
		out[ o ] = ( - dx / l * 0.5 + 0.5 ) * 255; out[ o + 1 ] = ( dy / l * 0.5 + 0.5 ) * 255; out[ o + 2 ] = ( 1 / l * 0.5 + 0.5 ) * 255; out[ o + 3 ] = 255;
	}
	return out;
}

function releaseData( t ) { t.onUpdate = null; t.image.data = null; }

const srgbToLin = ( v ) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 ); };

let _set = null;
export function buildingTextures() {
	if ( _set ) return _set;
	const alb = new Uint8Array( N * N * 4 * LAYERS );
	const nrm = new Uint8Array( NN * NN * 4 * LAYERS );
	const gains = new Float32Array( LAYERS ).fill( 1 );
	const flat = new Uint8Array( NN * NN * 4 );
	for ( let i = 0; i < NN * NN; i ++ ) { flat[ i * 4 ] = 128; flat[ i * 4 + 1 ] = 128; flat[ i * 4 + 2 ] = 255; flat[ i * 4 + 3 ] = 255; }
	const c = canvas( N ), x = c.getContext( '2d', { willReadFrequently: true } );
	const cn = canvas( NN ), xn = cn.getContext( '2d', { willReadFrequently: true } );
	for ( let l = 0; l < LAYERS; l ++ ) {
		let normal = flat;
		const name = TEX_LAYERS[ l ];
		if ( l === 0 || l === L.sign0 ) {
			x.fillStyle = '#ffffff'; x.fillRect( 0, 0, N, N );
		} else if ( name ) {
			const img = tex( name + '_d' ).image;
			if ( img && img.width ) x.drawImage( img, 0, 0, N, N ); else { x.fillStyle = '#b0b0b0'; x.fillRect( 0, 0, N, N ); }
			const ni = tex( name + '_n', { srgb: false } ).image;
			if ( ni && ni.width ) { xn.drawImage( ni, 0, 0, NN, NN ); normal = xn.getImageData( 0, 0, NN, NN ).data; }
		} else {
			const p = procedural( l );
			x.drawImage( p.albedo, 0, 0 );
			if ( p.height ) normal = heightToNormal( p.height, l === L.lattice ? 6 : 3 );
		}
		const d = x.getImageData( 0, 0, N, N ).data;
		// painted layers lose most of their own colour (the tint paints them) and are scaled to a mean of ~1
		let sum = 0;
		for ( let i = 0; i < N * N; i += 7 ) sum += 0.2126 * srgbToLin( d[ i * 4 ] ) + 0.7152 * srgbToLin( d[ i * 4 + 1 ] ) + 0.0722 * srgbToLin( d[ i * 4 + 2 ] );
		const mean = sum / Math.ceil( N * N / 7 );
		if ( l === L.woodfloor ) {
			// keep the wood's own colour, just bring the photo to a mid brown
			gains[ l ] = Math.min( 3, 0.42 / Math.max( 0.05, mean ) );
		} else if ( PAINTED.has( l ) ) {
			// mostly grey (the tint paints it) and flatter for plastered walls, whose photos are blotchy
			const k = SOFT[ l ] ?? 0.8;
			const chroma = l === L.plaster || l === L.stucco || l === L.beige || l === L.cmu ? 0.05 : 0.3;
			let gm = 0;
			for ( let i = 0; i < N * N; i += 7 ) gm += 0.299 * d[ i * 4 ] + 0.587 * d[ i * 4 + 1 ] + 0.114 * d[ i * 4 + 2 ];
			gm /= Math.ceil( N * N / 7 );
			for ( let i = 0; i < N * N; i ++ ) {
				const o = i * 4;
				const g = 0.299 * d[ o ] + 0.587 * d[ o + 1 ] + 0.114 * d[ o + 2 ];
				const gg = gm + ( g - gm ) * k;
				d[ o ] = gg + ( d[ o ] - g ) * chroma; d[ o + 1 ] = gg + ( d[ o + 1 ] - g ) * chroma; d[ o + 2 ] = gg + ( d[ o + 2 ] - g ) * chroma;
			}
			gains[ l ] = Math.min( 4, 0.92 / Math.max( 0.05, srgbToLin( gm ) ) );
		}
		alb.set( d, l * N * N * 4 );
		nrm.set( normal, l * NN * NN * 4 );
	}
	const A = new THREE.DataArrayTexture( alb, N, N, LAYERS );
	A.format = THREE.RGBAFormat; A.type = THREE.UnsignedByteType; A.colorSpace = THREE.SRGBColorSpace;
	A.wrapS = A.wrapT = THREE.RepeatWrapping; A.generateMipmaps = true;
	A.minFilter = THREE.LinearMipmapLinearFilter; A.magFilter = THREE.LinearFilter; A.anisotropy = 4;
	A.needsUpdate = true;
	const B = new THREE.DataArrayTexture( nrm, NN, NN, LAYERS );
	B.format = THREE.RGBAFormat; B.type = THREE.UnsignedByteType; B.colorSpace = THREE.NoColorSpace;
	B.wrapS = B.wrapT = THREE.RepeatWrapping; B.generateMipmaps = true;
	B.minFilter = THREE.LinearMipmapLinearFilter; B.magFilter = THREE.LinearFilter;
	B.needsUpdate = true;
	// ~45 MB of CPU copies are dead weight once the arrays are on the GPU (nothing re-uploads them)
	A.onUpdate = B.onUpdate = releaseData;
	// the sign atlas
	const sc = paintSignAtlas( document.createElement( 'canvas' ) );
	const S = new THREE.CanvasTexture( sc );
	S.colorSpace = THREE.SRGBColorSpace; S.anisotropy = 8; S.generateMipmaps = true; S.minFilter = THREE.LinearMipmapLinearFilter;
	_set = { albedo: A, normal: B, gains, signs: S, decals: decalAtlas() };
	return _set;
}

// ---- decals: cell layout in data.js (DECAL) ------------------------------------------------------------------------

function decalAtlas() {
	const S = 256, c = canvas( S * 4 ), x = c.getContext( '2d' );
	x.clearRect( 0, 0, S * 4, S * 4 );
	const R = rngOf( 991 );
	const cell = ( k, fn ) => { x.save(); x.translate( ( k % 4 ) * S, ( ( k / 4 ) | 0 ) * S ); x.beginPath(); x.rect( 0, 0, S, S ); x.clip(); fn(); x.restore(); };
	const blood = ( a ) => `rgba(${70 + R() * 30},${6 + R() * 8},${6 + R() * 6},${a})`;
	for ( let k = 0; k < 4; k ++ ) cell( k, () => {
		// a pool with satellite drops (dried dark at the rim)
		const cx = S / 2, cy = S / 2;
		for ( let i = 0; i < 14; i ++ ) {
			x.fillStyle = blood( 0.55 + R() * 0.3 );
			x.beginPath(); x.ellipse( cx + ( R() - 0.5 ) * 60 * ( k + 1 ) * 0.5, cy + ( R() - 0.5 ) * 60, 20 + R() * 40, 14 + R() * 30, R() * 3, 0, Math.PI * 2 ); x.fill();
		}
		for ( let i = 0; i < 40; i ++ ) {
			const a = R() * Math.PI * 2, r = 60 + R() * 60, s = 1 + R() * 6;
			x.fillStyle = blood( 0.8 ); x.beginPath(); x.arc( cx + Math.cos( a ) * r, cy + Math.sin( a ) * r, s, 0, Math.PI * 2 ); x.fill();
		}
	} );
	for ( let k = 4; k < 7; k ++ ) cell( k, () => {
		// smear / drag trail across the cell
		for ( let i = 0; i < 26; i ++ ) {
			const t = i / 26, y = S / 2 + Math.sin( t * 5 + k ) * 20;
			x.fillStyle = blood( 0.25 + R() * 0.4 );
			x.fillRect( t * S, y - 30 + R() * 10, S / 20 + 6, 40 + R() * 24 );
		}
		x.globalCompositeOperation = 'destination-out';
		for ( let i = 0; i < 60; i ++ ) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect( R() * S, S / 2 - 40 + R() * 80, 20 + R() * 40, 2 ); }
		x.globalCompositeOperation = 'source-over';
	} );
	cell( 7, () => {
		for ( let i = 0; i < 4; i ++ ) {
			const hx = 40 + i * 50, hy = 60 + R() * 120;
			x.fillStyle = blood( 0.7 );
			x.beginPath(); x.ellipse( hx, hy, 18, 22, 0, 0, Math.PI * 2 ); x.fill();
			for ( let f = 0; f < 4; f ++ ) { x.fillRect( hx - 16 + f * 9, hy - 50, 6, 30 ); }
			x.fillRect( hx + 14, hy - 10, 16, 6 );
			x.fillStyle = blood( 0.4 ); x.fillRect( hx - 10, hy + 20, 6, 40 + R() * 60 );
		}
	} );
	for ( let k = 8; k < 12; k ++ ) cell( k, () => {
		// scattered papers
		for ( let i = 0; i < 5; i ++ ) {
			x.save(); x.translate( 40 + R() * 176, 40 + R() * 176 ); x.rotate( R() * 6 );
			x.fillStyle = R() < 0.8 ? '#f2f0ea' : '#f4e9b0'; x.fillRect( - 30, - 40, 60, 80 );
			x.fillStyle = 'rgba(40,40,60,0.55)';
			for ( let l = 0; l < 9; l ++ ) x.fillRect( - 24, - 32 + l * 8, 30 + R() * 18, 2 );
			x.restore();
		}
	} );
	cell( 12, () => {
		for ( let i = 0; i < 300; i ++ ) { x.fillStyle = `rgba(${60 + R() * 40},${50 + R() * 30},${30},${0.2 + R() * 0.3})`; x.beginPath(); x.arc( R() * S, R() * S, 1 + R() * 6, 0, Math.PI * 2 ); x.fill(); }
		for ( let i = 0; i < 12; i ++ ) { x.fillStyle = `rgba(${90 + R() * 60},${80 + R() * 40},30,0.8)`; x.beginPath(); x.ellipse( R() * S, R() * S, 10, 4, R() * 3, 0, Math.PI * 2 ); x.fill(); }
	} );
	cell( 13, () => {
		for ( let i = 0; i < 70; i ++ ) {
			x.fillStyle = `rgba(200,225,230,${0.3 + R() * 0.4})`;
			const px = R() * S, py = R() * S, s = 3 + R() * 14;
			x.beginPath(); x.moveTo( px, py ); x.lineTo( px + s, py + R() * s ); x.lineTo( px + R() * s, py + s ); x.fill();
		}
	} );
	cell( 14, () => {
		for ( let i = 0; i < 8; i ++ ) {
			x.fillStyle = 'rgba(60,20,15,0.5)';
			const px = 30 + i * 28, py = i % 2 ? 90 : 150;
			x.beginPath(); x.ellipse( px, py, 9, 20, 0.2, 0, Math.PI * 2 ); x.fill();
		}
	} );
	cell( 15, () => {
		const g = x.createRadialGradient( S / 2, S / 2, 10, S / 2, S / 2, S / 2 );
		g.addColorStop( 0, 'rgba(10,8,6,0.9)' ); g.addColorStop( 0.6, 'rgba(20,16,12,0.5)' ); g.addColorStop( 1, 'rgba(20,16,12,0)' );
		x.fillStyle = g; x.fillRect( 0, 0, S, S );
	} );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
	return t;
}
