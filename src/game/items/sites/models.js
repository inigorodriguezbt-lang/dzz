// Item models for the sites' own items (register( reg ), added to render/ItemModels.js through models/ext/index.js):
// a stash note (a folded sheet of lined paper, scrawled with directions and a sketch) and a treasure map (an old
// creased chart with a red X). Model conventions as render/ItemModels.js: metres, origin at the bottom centre.
import { M, G, PI, add, group, canvasTex } from '../models/lib.js';

function noteTex() {
	return canvasTex( 'sites:note', 256, 192, ( ctx, W, H ) => {
		ctx.fillStyle = '#efe9d6'; ctx.fillRect( 0, 0, W, H );
		// ruled lines and a margin
		ctx.strokeStyle = 'rgba(90,130,190,0.45)'; ctx.lineWidth = 1;
		for ( let y = 22; y < H; y += 14 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( W, y ); ctx.stroke(); }
		ctx.strokeStyle = 'rgba(200,70,70,0.5)'; ctx.beginPath(); ctx.moveTo( 26, 0 ); ctx.lineTo( 26, H ); ctx.stroke();
		// a hurried scrawl
		ctx.strokeStyle = '#1d2a55'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
		let s = 7;
		const r = () => ( s = ( s * 16807 ) % 2147483647 ) / 2147483647;
		for ( let row = 0; row < 6; row ++ ) {
			const y = 19 + row * 14;
			let x = 32;
			const end = row === 5 ? 120 : W - 20 - r() * 40;
			ctx.beginPath(); ctx.moveTo( x, y );
			while ( x < end ) { x += 3 + r() * 4; ctx.lineTo( x, y - 2 - r() * 6 ); x += 2 + r() * 3; ctx.lineTo( x, y ); if ( r() < 0.15 ) { ctx.moveTo( x + 5, y ); x += 5; } }
			ctx.stroke();
		}
		// the sketch: a road, a tree and the X
		ctx.strokeStyle = '#1d2a55'; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( 130, 180 ); ctx.quadraticCurveTo( 170, 120, 250, 110 ); ctx.stroke();
		ctx.beginPath(); ctx.arc( 196, 150, 9, 0, PI * 2 ); ctx.stroke();
		ctx.beginPath(); ctx.moveTo( 196, 159 ); ctx.lineTo( 196, 170 ); ctx.stroke();
		ctx.strokeStyle = '#b3262a'; ctx.lineWidth = 3.5;
		ctx.beginPath(); ctx.moveTo( 218, 150 ); ctx.lineTo( 234, 166 ); ctx.moveTo( 234, 150 ); ctx.lineTo( 218, 166 ); ctx.stroke();
	} );
}

function mapTex() {
	return canvasTex( 'sites:tmap', 256, 256, ( ctx, W, H ) => {
		const g = ctx.createRadialGradient( W / 2, H / 2, 20, W / 2, H / 2, W * 0.75 );
		g.addColorStop( 0, '#e6d3a4' ); g.addColorStop( 0.7, '#cfb27a' ); g.addColorStop( 1, '#8d6b3c' );
		ctx.fillStyle = g; ctx.fillRect( 0, 0, W, H );
		// stains
		for ( const [ x, y, r ] of [ [ 60, 190, 26 ], [ 200, 60, 18 ] ] ) { ctx.fillStyle = 'rgba(110,70,30,0.18)'; ctx.beginPath(); ctx.arc( x, y, r, 0, PI * 2 ); ctx.fill(); }
		// a coastline and contour rings
		ctx.strokeStyle = '#5a3e22'; ctx.lineWidth = 2.5;
		ctx.beginPath(); ctx.moveTo( 10, 70 ); ctx.bezierCurveTo( 80, 40, 120, 120, 170, 90 ); ctx.bezierCurveTo( 220, 60, 240, 150, 246, 240 ); ctx.stroke();
		ctx.lineWidth = 1;
		for ( let k = 1; k < 4; k ++ ) { ctx.beginPath(); ctx.ellipse( 110, 170, 18 * k, 12 * k, 0.4, 0, PI * 2 ); ctx.stroke(); }
		// a dotted trail to the X
		ctx.setLineDash( [ 4, 5 ] ); ctx.lineWidth = 2; ctx.strokeStyle = '#3a2a18';
		ctx.beginPath(); ctx.moveTo( 30, 230 ); ctx.bezierCurveTo( 90, 230, 140, 210, 186, 170 ); ctx.stroke();
		ctx.setLineDash( [] );
		ctx.strokeStyle = '#b01e1e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
		ctx.beginPath(); ctx.moveTo( 180, 150 ); ctx.lineTo( 206, 176 ); ctx.moveTo( 206, 150 ); ctx.lineTo( 180, 176 ); ctx.stroke();
		// a compass rose
		ctx.fillStyle = '#4a321c'; ctx.beginPath(); ctx.moveTo( 220, 20 ); ctx.lineTo( 226, 44 ); ctx.lineTo( 220, 40 ); ctx.lineTo( 214, 44 ); ctx.closePath(); ctx.fill();
		ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'; ctx.fillText( 'N', 220, 16 );
		// fold creases
		ctx.strokeStyle = 'rgba(80,55,25,0.35)'; ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.moveTo( W / 2, 0 ); ctx.lineTo( W / 2, H ); ctx.moveTo( 0, H / 2 ); ctx.lineTo( W, H / 2 ); ctx.stroke();
	} );
}

export function register( reg ) {
	// a sheet folded in half, lying a little open
	reg( 'sites_note', () => {
		const g = group(), m = M( 0xffffff, { map: noteTex(), rough: 0.95 } );
		const a = G.box( 0.09, 0.0015, 0.13 ), b = G.box( 0.09, 0.0015, 0.13 );
		add( g, a, m, [ - 0.045, 0, 0 ] );
		add( g, b, m, [ 0.044, 0.004, 0 ], [ 0, 0, 0.12 ] );
		return g;
	} );
	// a creased chart, folded in four and opened out
	reg( 'sites_tmap', () => {
		const g = group(), m = M( 0xffffff, { map: mapTex(), rough: 0.9 } );
		for ( const [ x, z, rz, rx ] of [ [ - 0.055, - 0.055, 0.05, - 0.04 ], [ 0.055, - 0.055, - 0.06, - 0.03 ], [ - 0.055, 0.055, 0.04, 0.05 ], [ 0.055, 0.055, - 0.05, 0.04 ] ] ) {
			const q = G.box( 0.11, 0.0018, 0.11 );
			// each quarter shows its part of the chart
			const uv = q.attributes.uv;
			for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, ( x > 0 ? 0.5 : 0 ) + uv.getX( i ) * 0.5, ( z > 0 ? 0 : 0.5 ) + uv.getY( i ) * 0.5 );
			add( g, q, m, [ x, 0.003, z ], [ rx, 0, rz ] );
		}
		return g;
	} );
}
