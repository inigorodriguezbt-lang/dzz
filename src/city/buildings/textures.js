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

export const LAYERS = 42; // 0..31 and 33..41 surfaces, 32 = sign atlas (sampled from its own texture)
const N = 512, NN = 256;

// layers whose colour comes from the vertex tint (texture = detail only)
const PAINTED = new Set( [ L.stucco, L.plaster, L.beige, L.panels, L.planks, L.oldplanks, L.tinroof, L.concrete, L.metal, L.fabric, L.carpet,
	L.cmu, L.tilewall, L.ceiltile, L.wood, L.tiles, L.lino, L.spandrel, L.wallpaper, L.wallstripe, L.hcarpet ] );

// contrast kept for the painted layers (1 = the photo's own)
const SOFT = { [ L.plaster ]: 0.35, [ L.stucco ]: 0.55, [ L.beige ]: 0.5, [ L.concrete ]: 0.7, [ L.cmu ]: 0.9, [ L.carpet ]: 0.7, [ L.fabric ]: 0.8, [ L.wallpaper ]: 1, [ L.wallstripe ]: 1, [ L.hcarpet ]: 1 };

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
			// a shelf face packed with goods: 1 repeat = 1.2 m wide, 4 shelves of 0.4 m. Runs of identical facings
			// (cereal boxes, cans two high, bottles, jars, bags of chips), gaps where it was raided, price tags
			x.fillStyle = '#26282a'; x.fillRect( 0, 0, N, N );
			const cols = [ '#c8302a', '#e8c040', '#2e6fb4', '#f2f2ea', '#3a9a4a', '#e07a2a', '#7a3a8a', '#d0d0c8', '#8a5a30', '#20a0b0', '#f4a0b0', '#303030', '#6a8a2a', '#b02050' ];
			const rh = N / 4;
			for ( let row = 0; row < 4; row ++ ) {
				const y1 = row * rh + rh - 6; // the shelf line (bottom of the row)
				let px = 2;
				while ( px < N ) {
					if ( R() < 0.12 ) { px += 30 + R() * 70; continue; }
					const kind = ( R() * 5 ) | 0, col = cols[ ( R() * cols.length ) | 0 ], col2 = cols[ ( R() * cols.length ) | 0 ];
					// (1 px = 2.3 mm across, 3.1 mm up: a cereal box 20-25 cm wide, a can 7 cm, a bottle 8 cm)
					const n = 1 + ( ( R() * 4 ) | 0 );
					const iw = [ 80 + R() * 30, 30 + R() * 4, 32 + R() * 8, 38 + R() * 6, 70 + R() * 20 ][ kind ];
					const ih = [ 96 + R() * 20, 40 + R() * 4, 90 + R() * 24, 52 + R() * 12, 84 + R() * 22 ][ kind ];
					for ( let k = 0; k < n && px + iw < N; k ++ ) {
						const x0 = px, top = y1 - ih;
						if ( kind === 0 ) { // box: brand band, a label panel
							x.fillStyle = col; x.fillRect( x0, top, iw - 2, ih );
							x.fillStyle = col2; x.fillRect( x0 + 3, top + 6, iw - 8, ih * 0.22 );
							x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect( x0 + 5, top + ih * 0.45, iw - 12, ih * 0.3 );
							x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect( x0 + iw - 5, top, 3, ih );
						} else if ( kind === 1 ) { // cans, two high
							for ( const t of [ 0, 1 ] ) { const cy = y1 - ( t + 1 ) * ih; x.fillStyle = col; x.fillRect( x0, cy + 3, iw - 2, ih - 4 ); x.fillStyle = '#c8c8c8'; x.fillRect( x0, cy, iw - 2, 4 ); x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect( x0 + 3, cy + ih * 0.35, iw - 8, ih * 0.25 ); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect( x0 + iw - 6, cy + 3, 4, ih - 4 ); }
						} else if ( kind === 2 ) { // bottles: body, shoulder, neck, cap, label
							x.fillStyle = col; x.fillRect( x0 + 1, top + ih * 0.32, iw - 3, ih * 0.68 );
							x.fillRect( x0 + iw * 0.3, top + ih * 0.12, iw * 0.35, ih * 0.22 );
							x.fillStyle = col2; x.fillRect( x0 + iw * 0.28, top + ih * 0.04, iw * 0.4, ih * 0.09 );
							x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect( x0 + 2, top + ih * 0.55, iw - 5, ih * 0.2 );
							x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect( x0 + 3, top + ih * 0.34, 2, ih * 0.6 );
						} else if ( kind === 3 ) { // jars
							x.fillStyle = col; x.fillRect( x0, top + 8, iw - 2, ih - 8 ); x.fillStyle = col2; x.fillRect( x0 + 1, top, iw - 4, 9 );
							x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect( x0 + 3, top + ih * 0.4, iw - 8, ih * 0.3 );
						} else { // bags: a rounded top, a window
							x.fillStyle = col; x.beginPath(); x.moveTo( x0, y1 ); x.lineTo( x0 + 2, top + 8 ); x.quadraticCurveTo( x0 + iw / 2, top - 4, x0 + iw - 4, top + 8 ); x.lineTo( x0 + iw - 2, y1 ); x.fill();
							x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect( x0 + 6, top + ih * 0.3, iw - 14, ih * 0.25 );
							x.fillStyle = col2; x.fillRect( x0 + 4, top + ih * 0.65, iw - 10, 8 );
						}
						px += iw;
					}
					px += 2 + R() * 4;
				}
				// shade under the shelf above, the shelf edge and its price tags
				const g = x.createLinearGradient( 0, row * rh, 0, row * rh + 30 ); g.addColorStop( 0, 'rgba(0,0,0,0.55)' ); g.addColorStop( 1, 'rgba(0,0,0,0)' );
				x.fillStyle = g; x.fillRect( 0, row * rh, N, 30 );
				x.fillStyle = '#9a9a96'; x.fillRect( 0, y1, N, 6 );
				for ( let tx = 10 + R() * 30; tx < N; tx += 50 + R() * 40 ) { x.fillStyle = R() < 0.3 ? '#f0d040' : '#f4f4f0'; x.fillRect( tx, y1, 18, 6 ); }
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
		case L.wallpaper: {
			// damask: a diamond lattice of stylised flowers, soft paper grain; 1 repeat = 0.6 m (painted: grey)
			noiseFill( [ 214, 214, 214 ], 8, 1 );
			const h = H();
			const motif = ( cx, cy, s ) => {
				x.save(); x.translate( cx, cy );
				x.fillStyle = 'rgba(150,150,150,0.55)';
				for ( let k = 0; k < 4; k ++ ) { x.rotate( Math.PI / 2 ); x.beginPath(); x.ellipse( 0, - s * 0.45, s * 0.16, s * 0.4, 0, 0, Math.PI * 2 ); x.fill(); }
				x.fillStyle = 'rgba(245,245,245,0.6)'; x.beginPath(); x.arc( 0, 0, s * 0.12, 0, Math.PI * 2 ); x.fill();
				x.strokeStyle = 'rgba(150,150,150,0.45)'; x.lineWidth = 3;
				for ( const sg of [ - 1, 1 ] ) { x.beginPath(); x.moveTo( 0, s * 0.5 ); x.quadraticCurveTo( sg * s * 0.6, s * 0.6, sg * s * 0.5, s * 0.1 ); x.stroke(); }
				x.restore();
			};
			for ( let j = 0; j < 3; j ++ ) for ( let i = 0; i < 3; i ++ ) { motif( i * N / 2, j * N / 2, N / 5 ); motif( i * N / 2 + N / 4, j * N / 2 + N / 4, N / 7 ); }
			h.fillStyle = '#909090'; for ( let i = 0; i < 2000; i ++ ) h.fillRect( R() * N, R() * N, 2, 2 );
			break;
		}
		case L.wallstripe: {
			// regency stripes with a thin pinline; 1 repeat = 0.6 m across
			x.fillStyle = '#d2d2d2'; x.fillRect( 0, 0, N, N );
			for ( let k = 0; k < 4; k ++ ) {
				const px = k * N / 4;
				x.fillStyle = '#b4b4b4'; x.fillRect( px, 0, N / 8, N );
				x.fillStyle = '#e8e8e8'; x.fillRect( px + N / 8 + 10, 0, 4, N );
				x.fillStyle = 'rgba(150,150,150,0.6)';
				for ( let y = 0; y < N; y += N / 8 ) { x.beginPath(); x.arc( px + N / 16 + N / 8 + 22, y + N / 16, 5, 0, Math.PI * 2 ); x.fill(); }
			}
			for ( let i = 0; i < 3000; i ++ ) { x.fillStyle = `rgba(90,90,90,${R() * 0.08})`; x.fillRect( R() * N, R() * N, 2, 2 ); }
			break;
		}
		case L.rug: {
			// an oriental rug: border bands, a field of small motifs and a medallion (fit to the rug, 0..1)
			x.fillStyle = '#7a1e1a'; x.fillRect( 0, 0, N, N );
			const band = ( o, w, c ) => { x.strokeStyle = c; x.lineWidth = w; x.strokeRect( o + w / 2, o + w / 2, N - 2 * o - w, N - 2 * o - w ); };
			band( 0, 34, '#1d2a4a' ); band( 34, 8, '#d8c79a' ); band( 42, 18, '#1d2a4a' ); band( 60, 5, '#d8c79a' );
			for ( let t = 0; t < 60; t ++ ) { x.fillStyle = t % 2 ? '#d8c79a' : '#b8862e'; const u = ( t / 60 ) * ( N - 68 ) + 34; for ( const [ px, py ] of [ [ u, 17 ], [ u, N - 17 ], [ 17, u ], [ N - 17, u ] ] ) { x.beginPath(); x.arc( px, py, 5, 0, Math.PI * 2 ); x.fill(); } }
			for ( let j = 0; j < 9; j ++ ) for ( let i = 0; i < 9; i ++ ) {
				const px = 90 + i * 42, py = 90 + j * 42;
				x.fillStyle = ( i + j ) % 2 ? 'rgba(216,199,154,0.55)' : 'rgba(29,42,74,0.6)';
				x.beginPath(); x.moveTo( px, py - 9 ); x.lineTo( px + 9, py ); x.lineTo( px, py + 9 ); x.lineTo( px - 9, py ); x.fill();
			}
			x.save(); x.translate( N / 2, N / 2 );
			for ( const [ r, c ] of [ [ 120, '#1d2a4a' ], [ 100, '#d8c79a' ], [ 84, '#7a1e1a' ], [ 50, '#b8862e' ], [ 24, '#1d2a4a' ] ] ) { x.fillStyle = c; x.beginPath(); for ( let k = 0; k < 16; k ++ ) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? r * 0.8 : r; x.lineTo( Math.cos( a ) * rr, Math.sin( a ) * rr * 0.75 ); } x.fill(); }
			x.restore();
			// wear
			for ( let i = 0; i < 6000; i ++ ) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,240,210'},${R() * 0.12})`; x.fillRect( R() * N, R() * N, 2, 2 ); }
			const h = H(); h.fillStyle = '#707070'; for ( let i = 0; i < 20000; i ++ ) h.fillRect( R() * N, R() * N, 1, 1 );
			break;
		}
		case L.hcarpet: {
			// hotel corridor carpet: a two-tone geometric repeat (painted); 1 repeat = 1.2 m
			x.fillStyle = '#9a9a9a'; x.fillRect( 0, 0, N, N );
			const q = N / 4;
			for ( let j = 0; j < 4; j ++ ) for ( let i = 0; i < 4; i ++ ) {
				const cx = i * q + q / 2, cy = j * q + q / 2;
				x.strokeStyle = '#6e6e6e'; x.lineWidth = 9;
				x.beginPath(); x.moveTo( cx, cy - q * 0.42 ); x.lineTo( cx + q * 0.42, cy ); x.lineTo( cx, cy + q * 0.42 ); x.lineTo( cx - q * 0.42, cy ); x.closePath(); x.stroke();
				x.fillStyle = '#c4c4c4'; x.beginPath(); x.arc( cx, cy, q * 0.1, 0, Math.PI * 2 ); x.fill();
				x.fillStyle = '#7c7c7c'; x.fillRect( i * q - 4, j * q - 4, 8, 8 );
			}
			for ( let i = 0; i < 30000; i ++ ) { x.fillStyle = `rgba(${R() < 0.5 ? '40,40,40' : '230,230,230'},${R() * 0.15})`; x.fillRect( R() * N, R() * N, 1.5, 1.5 ); }
			const h = H(); h.fillStyle = '#6a6a6a'; for ( let i = 0; i < 30000; i ++ ) h.fillRect( R() * N, R() * N, 1, 1 );
			break;
		}
		case L.cardboard: {
			// a carton face (fit to the face): kraft board, tape down the middle, printed marks
			x.fillStyle = '#b48a58'; x.fillRect( 0, 0, N, N );
			for ( let i = 0; i < 90; i ++ ) { x.fillStyle = `rgba(120,86,48,${0.05 + R() * 0.08})`; x.fillRect( 0, R() * N, N, 1 + R() * 3 ); }
			x.fillStyle = 'rgba(210,180,130,0.85)'; x.fillRect( N * 0.44, 0, N * 0.12, N );
			x.fillStyle = 'rgba(60,40,24,0.7)';
			x.fillRect( 60, 70, 150, 26 ); x.fillRect( 60, 108, 110, 14 ); x.fillRect( 60, 130, 130, 14 );
			// "this side up" arrows
			for ( const px of [ 340, 400 ] ) { x.beginPath(); x.moveTo( px, 110 ); x.lineTo( px + 22, 140 ); x.lineTo( px + 8, 140 ); x.lineTo( px + 8, 180 ); x.lineTo( px - 8, 180 ); x.lineTo( px - 8, 140 ); x.lineTo( px - 22, 140 ); x.fill(); }
			x.strokeStyle = 'rgba(60,40,24,0.55)'; x.lineWidth = 6; x.strokeRect( 330, 340, 120, 110 );
			x.fillStyle = 'rgba(40,28,16,0.35)'; x.fillRect( 0, 0, N, 6 ); x.fillRect( 0, N - 6, N, 6 ); x.fillRect( 0, 0, 6, N ); x.fillRect( N - 6, 0, 6, N );
			break;
		}
		case L.art: paintArt( x, N, R ); break;
		default:
			x.fillStyle = '#ffffff'; x.fillRect( 0, 0, N, N );
	}
	return { albedo: c, height: hgt };
}

// pictures and posters, a 4 x 4 atlas (data.js ART): paintings, photos, posters, notices, a menu, a calendar, a map
function paintArt( x, N, R ) {
	const S = N / 4;
	const grad = ( y0, y1, a, b ) => { const g = x.createLinearGradient( 0, y0, 0, y1 ); g.addColorStop( 0, a ); g.addColorStop( 1, b ); return g; };
	const lines = ( x0, y0, w, n, gap, c ) => { x.fillStyle = c; for ( let k = 0; k < n; k ++ ) x.fillRect( x0, y0 + k * gap, w * ( 0.6 + R() * 0.4 ), gap * 0.35 ); };
	const cells = [
		() => { x.fillStyle = grad( 0, S * 0.55, '#6fa8d8', '#cfe3ef' ); x.fillRect( 0, 0, S, S * 0.55 ); x.fillStyle = grad( S * 0.55, S, '#1f6f8f', '#0c3a50' ); x.fillRect( 0, S * 0.55, S, S * 0.45 ); x.fillStyle = '#e8f2f4'; for ( let k = 0; k < 6; k ++ ) x.fillRect( R() * S, S * ( 0.6 + R() * 0.35 ), 12 + R() * 16, 2 ); x.fillStyle = '#f4f0e0'; x.beginPath(); x.ellipse( S * 0.3, S * 0.25, 18, 8, 0, 0, 7 ); x.fill(); },
		() => { x.fillStyle = grad( 0, S * 0.6, '#3a2a5a', '#f08a3a' ); x.fillRect( 0, 0, S, S * 0.6 ); x.fillStyle = '#ffd070'; x.beginPath(); x.arc( S / 2, S * 0.6, 20, Math.PI, 0 ); x.fill(); x.fillStyle = grad( S * 0.6, S, '#8a4a3a', '#2a1a2a' ); x.fillRect( 0, S * 0.6, S, S * 0.4 ); x.fillStyle = 'rgba(255,200,110,0.6)'; for ( let k = 0; k < 8; k ++ ) x.fillRect( S / 2 - 16 + R() * 32 - 10, S * ( 0.62 + k * 0.04 ), 20, 2 ); },
		() => { x.fillStyle = grad( 0, S * 0.5, '#9cc8e8', '#e8f0f0' ); x.fillRect( 0, 0, S, S ); x.fillStyle = '#2e6a3a'; x.beginPath(); x.moveTo( 0, S * 0.75 ); x.lineTo( S * 0.2, S * 0.3 ); x.lineTo( S * 0.45, S * 0.55 ); x.lineTo( S * 0.7, S * 0.22 ); x.lineTo( S, S * 0.6 ); x.lineTo( S, S ); x.lineTo( 0, S ); x.fill(); x.fillStyle = '#5a9a4a'; x.fillRect( 0, S * 0.78, S, S * 0.22 ); x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.ellipse( S * 0.7, S * 0.3, 20, 5, 0, 0, 7 ); x.fill(); },
		() => { x.fillStyle = grad( 0, S, '#f6b04a', '#d0405a' ); x.fillRect( 0, 0, S, S ); x.fillStyle = '#ffe6a0'; x.beginPath(); x.arc( S * 0.62, S * 0.62, 16, 0, 7 ); x.fill(); x.fillStyle = '#1a1010'; x.fillRect( 0, S * 0.8, S, S * 0.2 ); x.strokeStyle = '#1a1010'; x.lineWidth = 5; x.beginPath(); x.moveTo( S * 0.3, S * 0.82 ); x.quadraticCurveTo( S * 0.26, S * 0.5, S * 0.36, S * 0.25 ); x.stroke(); for ( let k = 0; k < 6; k ++ ) { x.beginPath(); x.moveTo( S * 0.36, S * 0.25 ); x.quadraticCurveTo( S * ( 0.36 + Math.cos( k ) * 0.15 ), S * 0.15, S * ( 0.36 + Math.cos( k * 1.1 ) * 0.28 ), S * ( 0.3 + Math.sin( k ) * 0.08 ) ); x.stroke(); } },
		() => { x.fillStyle = '#2a2a30'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#6a7a8a'; x.fillRect( S * 0.4, S * 0.55, S * 0.2, S * 0.3 ); for ( let k = 0; k < 9; k ++ ) { x.fillStyle = [ '#d03030', '#f0c030', '#f0f0e0', '#e06a90' ][ k % 4 ]; x.beginPath(); x.arc( S * ( 0.3 + R() * 0.4 ), S * ( 0.25 + R() * 0.3 ), 8 + R() * 6, 0, 7 ); x.fill(); } x.fillStyle = '#3a7a3a'; for ( let k = 0; k < 5; k ++ ) x.fillRect( S * ( 0.42 + k * 0.03 ), S * 0.45, 2, S * 0.12 ); },
		() => { x.fillStyle = '#e4dccb'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#b8402e'; x.fillRect( 12, 12, S - 24, S * 0.45 ); x.fillStyle = '#243c5a'; x.fillRect( 12, S * 0.55, S - 24, S * 0.38 ); x.fillStyle = '#e8b030'; x.fillRect( S * 0.6, S * 0.3, S * 0.25, S * 0.15 ); },
		() => { x.fillStyle = '#3a2e24'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#c89a78'; x.beginPath(); x.ellipse( S / 2, S * 0.4, S * 0.17, S * 0.22, 0, 0, 7 ); x.fill(); x.fillStyle = '#2a2018'; x.beginPath(); x.ellipse( S / 2, S * 0.25, S * 0.19, S * 0.1, 0, Math.PI, 0 ); x.fill(); x.fillStyle = '#5a3a3a'; x.fillRect( S * 0.25, S * 0.65, S * 0.5, S * 0.35 ); },
		() => { x.fillStyle = '#d8cfb8'; x.fillRect( 0, 0, S, S ); x.fillStyle = grad( 0, S, '#8ab0c8', '#c8d0a0' ); x.fillRect( 8, 8, S - 16, S - 16 ); for ( let k = 0; k < 4; k ++ ) { const px = S * ( 0.2 + k * 0.2 ), h = S * ( 0.35 + ( k % 2 ) * 0.1 ); x.fillStyle = '#c8a080'; x.beginPath(); x.arc( px, S - 8 - h, 9, 0, 7 ); x.fill(); x.fillStyle = [ '#3a5a8a', '#c04040', '#e0e0d0', '#4a8a4a' ][ k ]; x.fillRect( px - 11, S - 8 - h + 9, 22, h - 9 ); } },
		() => { x.fillStyle = '#f2e8c8'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#1a6aa0'; x.beginPath(); x.moveTo( 0, S * 0.8 ); x.quadraticCurveTo( S * 0.2, S * 0.2, S * 0.75, S * 0.35 ); x.quadraticCurveTo( S * 0.45, S * 0.45, S * 0.5, S * 0.8 ); x.fill(); x.fillStyle = '#e04a2a'; x.fillRect( 0, 0, S, S * 0.16 ); x.fillStyle = '#f2e8c8'; x.fillRect( 10, 8, S * 0.6, 8 ); x.fillStyle = '#1a6aa0'; x.fillRect( 0, S * 0.8, S, S * 0.2 ); },
		() => { x.fillStyle = '#e07a2a'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#3a2210'; x.fillRect( S * 0.32, S * 0.18, S * 0.36, S * 0.72 ); x.fillStyle = '#e07a2a'; x.fillRect( S * 0.38, S * 0.3, S * 0.08, S * 0.06 ); x.fillRect( S * 0.54, S * 0.3, S * 0.08, S * 0.06 ); x.fillRect( S * 0.4, S * 0.5, S * 0.2, S * 0.05 ); x.fillStyle = '#f8e0a0'; x.fillRect( 8, 6, S - 16, 12 ); },
		() => { x.fillStyle = '#e8dcb0'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#2a2018'; x.fillRect( 14, 8, S - 28, 16 ); x.fillStyle = '#8a7a60'; x.fillRect( S * 0.25, S * 0.25, S * 0.5, S * 0.4 ); x.fillStyle = '#4a3a2a'; x.beginPath(); x.ellipse( S / 2, S * 0.42, S * 0.12, S * 0.15, 0, 0, 7 ); x.fill(); lines( 16, S * 0.72, S - 32, 4, 9, '#2a2018' ); },
		() => { x.fillStyle = '#f4f4f0'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#c02020'; x.fillRect( 0, 0, S, S * 0.22 ); x.fillStyle = '#ffffff'; x.fillRect( 10, 10, S * 0.5, 10 ); lines( 12, S * 0.32, S - 24, 8, 10, '#303030' ); },
		() => { x.fillStyle = '#1e2420'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#f0e0b0'; x.fillRect( 12, 8, S * 0.5, 12 ); for ( let k = 0; k < 8; k ++ ) { lines( 12, 30 + k * 12, S * 0.55, 1, 12, '#e8e8e0' ); x.fillStyle = '#f0c040'; x.fillRect( S - 34, 30 + k * 12, 20, 4 ); } },
		() => { x.fillStyle = '#f8f8f4'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#2a6a9a'; x.fillRect( 0, 0, S, S * 0.4 ); x.fillStyle = '#6aa0c0'; x.fillRect( 10, 10, S - 20, S * 0.3 ); x.strokeStyle = '#999'; x.lineWidth = 1; for ( let k = 0; k <= 7; k ++ ) { x.beginPath(); x.moveTo( 6 + k * ( S - 12 ) / 7, S * 0.45 ); x.lineTo( 6 + k * ( S - 12 ) / 7, S - 6 ); x.stroke(); } for ( let k = 0; k <= 5; k ++ ) { x.beginPath(); x.moveTo( 6, S * 0.45 + k * ( S * 0.55 - 6 ) / 5 ); x.lineTo( S - 6, S * 0.45 + k * ( S * 0.55 - 6 ) / 5 ); x.stroke(); } x.strokeStyle = '#c02020'; x.lineWidth = 2; for ( let k = 0; k < 9; k ++ ) { const cx = 6 + ( k % 7 + 0.5 ) * ( S - 12 ) / 7, cy = S * 0.45 + ( ( k / 7 | 0 ) + 0.5 ) * ( S * 0.55 - 6 ) / 5; x.beginPath(); x.moveTo( cx - 5, cy - 5 ); x.lineTo( cx + 5, cy + 5 ); x.moveTo( cx + 5, cy - 5 ); x.lineTo( cx - 5, cy + 5 ); x.stroke(); } },
		() => { x.fillStyle = '#5a9ac8'; x.fillRect( 0, 0, S, S ); x.fillStyle = '#d8c88a'; for ( const [ px, py, r ] of [ [ 0.15, 0.3, 10 ], [ 0.3, 0.38, 14 ], [ 0.45, 0.45, 8 ], [ 0.55, 0.5, 12 ], [ 0.62, 0.55, 7 ], [ 0.8, 0.72, 24 ] ] ) { x.beginPath(); x.ellipse( S * px, S * py, r, r * 0.7, 0.4, 0, 7 ); x.fill(); } x.fillStyle = '#4a8a3a'; x.beginPath(); x.arc( S * 0.8, S * 0.72, 12, 0, 7 ); x.fill(); x.strokeStyle = '#f4f4f0'; x.lineWidth = 2; x.strokeRect( 4, 4, S - 8, S - 8 ); },
		() => { x.fillStyle = '#f2f4f4'; x.fillRect( 0, 0, S, S ); x.strokeStyle = '#2a4aa0'; x.lineWidth = 3; x.beginPath(); for ( let k = 0; k < 5; k ++ ) { x.moveTo( 14, 20 + k * 18 ); for ( let t = 0; t < 8; t ++ ) x.lineTo( 14 + t * 10 + R() * 6, 20 + k * 18 + ( R() - 0.5 ) * 6 ); } x.stroke(); x.strokeStyle = '#c02a2a'; x.beginPath(); x.arc( S * 0.75, S * 0.7, 16, 0, 7 ); x.stroke(); x.strokeStyle = '#2a8a3a'; x.beginPath(); x.moveTo( S * 0.2, S * 0.85 ); x.lineTo( S * 0.45, S * 0.7 ); x.lineTo( S * 0.55, S * 0.8 ); x.stroke(); },
	];
	cells.forEach( ( fn, k ) => { x.save(); x.translate( ( k % 4 ) * S, ( k >> 2 ) * S ); x.beginPath(); x.rect( 0, 0, S, S ); x.clip(); fn(); x.restore(); } );
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
	c.height = S * 8;
	x.clearRect( 0, 0, S * 4, S * 8 );
	const R = rngOf( 991 );
	const cell = ( k, fn ) => { x.save(); x.translate( ( k % 4 ) * S, ( ( k / 4 ) | 0 ) * S ); x.beginPath(); x.rect( 0, 0, S, S ); x.clip(); fn(); x.restore(); };
	const blood = ( a ) => `rgba(${105 + R() * 35},${12 + R() * 10},${10 + R() * 8},${a})`;
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
		// a smear across the cell: overlapping strokes that thin and fade, a few spatters
		const y0 = S / 2 + ( R() - 0.5 ) * 30;
		for ( let i = 0; i < 90; i ++ ) {
			const t = i / 90;
			const y = y0 + Math.sin( t * 5 + k ) * 18 + ( R() - 0.5 ) * 10;
			x.fillStyle = blood( ( 0.08 + 0.3 * ( 1 - t ) ) * ( 0.4 + R() * 0.8 ) );
			x.beginPath(); x.ellipse( t * S, y, 6 + R() * 10, 18 + ( 1 - t ) * 22 + R() * 10, ( R() - 0.5 ) * 0.6, 0, Math.PI * 2 ); x.fill();
		}
		for ( let i = 0; i < 25; i ++ ) { x.fillStyle = blood( 0.7 ); x.beginPath(); x.arc( R() * S, y0 + ( R() - 0.5 ) * 100, 1 + R() * 4, 0, Math.PI * 2 ); x.fill(); }
	} );
	cell( 7, () => {
		// bloody hands dragged down a wall: palms, fingers smeared downwards, runs
		for ( let i = 0; i < 3; i ++ ) {
			const hx = 50 + i * 72 + R() * 16, hy = 70 + R() * 70, a = ( R() - 0.5 ) * 0.5;
			x.save(); x.translate( hx, hy ); x.rotate( a );
			x.fillStyle = blood( 0.75 );
			x.beginPath(); x.ellipse( 0, 0, 17, 21, 0, 0, Math.PI * 2 ); x.fill();
			for ( let f = 0; f < 4; f ++ ) { x.beginPath(); x.ellipse( - 13 + f * 8.5, - 30 - ( f === 1 || f === 2 ? 5 : 0 ), 3.6, 11, ( f - 1.5 ) * 0.12, 0, Math.PI * 2 ); x.fill(); }
			x.beginPath(); x.ellipse( 20, - 4, 4, 10, 0.9, 0, Math.PI * 2 ); x.fill();
			// smeared down as the hand slid
			for ( let k = 0; k < 14; k ++ ) { x.fillStyle = blood( 0.22 * ( 1 - k / 14 ) ); x.beginPath(); x.ellipse( ( R() - 0.5 ) * 6, 10 + k * 7, 16, 9, 0, 0, Math.PI * 2 ); x.fill(); }
			for ( let k = 0; k < 3; k ++ ) { x.fillStyle = blood( 0.6 ); x.fillRect( - 10 + R() * 20, 18, 2.5, 30 + R() * 70 ); }
			x.restore();
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
	// soft contact shadow of a piece of furniture (stretched to its footprint)
	cell( 16, () => {
		for ( let k = 0; k < 14; k ++ ) {
			const m = 8 + k * 7;
			x.fillStyle = `rgba(0,0,0,${0.075})`;
			x.beginPath(); x.roundRect?.( m, m, S - 2 * m, S - 2 * m, 40 - k * 2 ); if ( ! x.roundRect ) x.rect( m, m, S - 2 * m, S - 2 * m ); x.fill();
		}
	} );
	cell( 17, () => {
		for ( let i = 0; i < 10; i ++ ) { x.fillStyle = `rgba(${14 + R() * 10},${12 + R() * 8},${8},${0.35 + R() * 0.3})`; x.beginPath(); x.ellipse( S / 2 + ( R() - 0.5 ) * 90, S / 2 + ( R() - 0.5 ) * 70, 30 + R() * 50, 20 + R() * 40, R() * 3, 0, Math.PI * 2 ); x.fill(); }
		for ( let i = 0; i < 30; i ++ ) { x.fillStyle = 'rgba(20,16,10,0.6)'; x.beginPath(); x.arc( S / 2 + ( R() - 0.5 ) * 200, S / 2 + ( R() - 0.5 ) * 200, 1 + R() * 4, 0, Math.PI * 2 ); x.fill(); }
	} );
	cell( 18, () => {
		for ( let i = 0; i < 3; i ++ ) { x.strokeStyle = `rgba(120,90,50,${0.25 + R() * 0.2})`; x.lineWidth = 3 + R() * 5; x.beginPath(); x.ellipse( S / 2 + ( R() - 0.5 ) * 30, S / 2 + ( R() - 0.5 ) * 30, 70 + R() * 40, 50 + R() * 40, R() * 3, 0, Math.PI * 2 ); x.stroke(); }
		x.fillStyle = 'rgba(110,90,60,0.12)'; x.beginPath(); x.ellipse( S / 2, S / 2, 100, 80, 0.3, 0, Math.PI * 2 ); x.fill();
	} );
	cell( 19, () => {
		for ( let i = 0; i < 9; i ++ ) {
			const hx = 30 + R() * ( S - 60 ), hy = 30 + R() * ( S - 60 );
			x.fillStyle = 'rgba(200,196,186,0.7)'; x.beginPath(); x.arc( hx, hy, 9 + R() * 4, 0, Math.PI * 2 ); x.fill();
			x.strokeStyle = 'rgba(40,36,30,0.5)'; x.lineWidth = 1.5;
			for ( let k = 0; k < 5; k ++ ) { const a = R() * 6.3; x.beginPath(); x.moveTo( hx, hy ); x.lineTo( hx + Math.cos( a ) * ( 12 + R() * 14 ), hy + Math.sin( a ) * ( 12 + R() * 14 ) ); x.stroke(); }
			x.fillStyle = 'rgba(12,10,8,0.95)'; x.beginPath(); x.arc( hx, hy, 4 + R() * 2, 0, Math.PI * 2 ); x.fill();
		}
	} );
	cell( 20, () => {
		for ( let i = 0; i < 26; i ++ ) {
			const px = 30 + R() * ( S - 60 ), py = 30 + R() * ( S - 60 ), s = 5 + R() * 16;
			x.fillStyle = R() < 0.7 ? `rgba(240,240,234,0.95)` : `rgba(60,90,150,0.9)`;
			x.beginPath(); x.moveTo( px, py ); x.lineTo( px + s, py + R() * s * 0.5 ); x.lineTo( px + R() * s, py + s ); x.fill();
			x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1; x.stroke();
		}
	} );
	cell( 21, () => {
		for ( let i = 0; i < 500; i ++ ) { const a = R() * 6.3, r = Math.pow( R(), 0.6 ) * 110; x.fillStyle = `rgba(${170 + R() * 60},${120 + R() * 50},${40 + R() * 30},0.9)`; x.beginPath(); x.ellipse( S / 2 + Math.cos( a ) * r, S / 2 + Math.sin( a ) * r * 0.7, 2 + R() * 3, 1.5 + R() * 2, R() * 3, 0, Math.PI * 2 ); x.fill(); }
	} );
	cell( 22, () => {
		// HELP scrawled in blood
		x.strokeStyle = blood( 0.85 ); x.lineWidth = 16; x.lineCap = 'round';
		const L2 = [ [ [ 20, 70 ], [ 22, 190 ] ], [ [ 72, 70 ], [ 70, 190 ] ], [ [ 21, 130 ], [ 71, 128 ] ], [ [ 100, 72 ], [ 98, 188 ] ], [ [ 100, 72 ], [ 140, 70 ] ], [ [ 99, 128 ], [ 132, 128 ] ], [ [ 98, 188 ], [ 142, 190 ] ],
			[ [ 162, 70 ], [ 160, 190 ] ], [ [ 160, 190 ], [ 196, 188 ] ], [ [ 214, 190 ], [ 216, 70 ] ], [ [ 216, 70 ], [ 244, 84 ], [ 240, 118 ], [ 215, 128 ] ] ];
		for ( const seg of L2 ) { x.beginPath(); x.moveTo( ...seg[ 0 ] ); for ( const p of seg.slice( 1 ) ) x.lineTo( p[ 0 ] + ( R() - 0.5 ) * 6, p[ 1 ] ); x.stroke(); }
		x.fillStyle = blood( 0.6 ); for ( let i = 0; i < 12; i ++ ) x.fillRect( 20 + R() * 220, 188, 4, 20 + R() * 50 );
	} );
	cell( 23, () => {
		x.strokeStyle = 'rgba(30,30,34,0.85)'; x.lineWidth = 6; x.lineCap = 'round';
		for ( let g = 0; g < 4; g ++ ) { for ( let k = 0; k < 4; k ++ ) { x.beginPath(); x.moveTo( 24 + g * 58 + k * 10, 40 + R() * 6 ); x.lineTo( 26 + g * 58 + k * 10, 110 ); x.stroke(); } x.beginPath(); x.moveTo( 16 + g * 58, 100 ); x.lineTo( 70 + g * 58, 50 ); x.stroke(); }
		x.strokeStyle = 'rgba(160,20,16,0.85)'; x.lineWidth = 10;
		x.beginPath(); x.moveTo( 60, 150 ); x.lineTo( 190, 230 ); x.moveTo( 190, 150 ); x.lineTo( 60, 230 ); x.stroke();
	} );
	cell( 24, () => {
		for ( let i = 0; i < 70; i ++ ) { const a = R() * 6.3, r = Math.pow( R(), 0.5 ) * 100; x.fillStyle = [ '#f4f4f0', '#f0e6a0', '#e87a6a', '#9ac0e8' ][ ( R() * 4 ) | 0 ]; x.beginPath(); x.ellipse( S / 2 + Math.cos( a ) * r, S / 2 + Math.sin( a ) * r, 5, 3, R() * 3, 0, Math.PI * 2 ); x.fill(); }
		x.fillStyle = 'rgba(230,140,40,0.9)'; x.fillRect( S / 2 - 14, S / 2 - 30, 28, 60 );
	} );
	cell( 25, () => {
		// a body dragged across the floor: a wide smeared band that thins and breaks up, drips and finger marks
		for ( let i = 0; i < 140; i ++ ) {
			const t = i / 140, y = S / 2 + Math.sin( t * 4.2 ) * 12 + ( R() - 0.5 ) * 16;
			const w = 26 * ( 1 - t * 0.6 ) + R() * 14;
			x.fillStyle = blood( ( 0.06 + 0.22 * ( 1 - t ) ) * ( 0.5 + R() ) );
			x.beginPath(); x.ellipse( t * S, y, 5 + R() * 8, w, ( R() - 0.5 ) * 0.4, 0, Math.PI * 2 ); x.fill();
		}
		x.strokeStyle = blood( 0.35 ); x.lineWidth = 2;
		for ( let k = 0; k < 7; k ++ ) { const y = S / 2 - 18 + k * 6 + ( R() - 0.5 ) * 4; x.beginPath(); x.moveTo( R() * 40, y ); for ( let px = 0; px < S; px += 16 ) x.lineTo( px, y + Math.sin( px * 0.05 + k ) * 3 ); x.globalAlpha = 0.5 * ( 1 - k / 7 ); x.stroke(); }
		x.globalAlpha = 1;
		for ( let i = 0; i < 40; i ++ ) { x.fillStyle = blood( 0.7 ); x.beginPath(); x.arc( R() * S, S / 2 + ( R() - 0.5 ) * 90, 1 + R() * 3.5, 0, Math.PI * 2 ); x.fill(); }
	} );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
	return t;
}
