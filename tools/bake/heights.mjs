// Mosaics the Terrarium tiles and resamples them onto the game grid.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { BOUNDS, ZOOM, V_SCALE, lonToTileX, latToTileY, worldToLonLat } from './geo.mjs';

export function loadMosaic( cache ) {
	const x0 = Math.floor( lonToTileX( BOUNDS.west, ZOOM ) ), x1 = Math.floor( lonToTileX( BOUNDS.east, ZOOM ) );
	const y0 = Math.floor( latToTileY( BOUNDS.north, ZOOM ) ), y1 = Math.floor( latToTileY( BOUNDS.south, ZOOM ) );
	const W = ( x1 - x0 + 1 ) * 256, H = ( y1 - y0 + 1 ) * 256;
	const data = new Float32Array( W * H );
	for ( let ty = y0; ty <= y1; ty ++ ) for ( let tx = x0; tx <= x1; tx ++ ) {
		const png = PNG.sync.read( fs.readFileSync( path.join( cache, `${ZOOM}_${tx}_${ty}.png` ) ) );
		const ox = ( tx - x0 ) * 256, oy = ( ty - y0 ) * 256;
		for ( let y = 0; y < 256; y ++ ) for ( let x = 0; x < 256; x ++ ) {
			const i = ( y * 256 + x ) * 4;
			const h = png.data[ i ] * 256 + png.data[ i + 1 ] + png.data[ i + 2 ] / 256 - 32768;
			data[ ( oy + y ) * W + ox + x ] = h;
		}
	}
	return { data, W, H, x0, y0 };
}

// real-world metres at a lon/lat, bilinear in tile pixel space
export function sampleReal( m, lon, lat ) {
	const px = ( lonToTileX( lon, ZOOM ) - m.x0 ) * 256 - 0.5;
	const py = ( latToTileY( lat, ZOOM ) - m.y0 ) * 256 - 0.5;
	const ix = Math.max( 0, Math.min( m.W - 2, Math.floor( px ) ) ), iy = Math.max( 0, Math.min( m.H - 2, Math.floor( py ) ) );
	const fx = Math.min( 1, Math.max( 0, px - ix ) ), fy = Math.min( 1, Math.max( 0, py - iy ) );
	const d = m.data, W = m.W, i = iy * W + ix;
	const a = d[ i ] + ( d[ i + 1 ] - d[ i ] ) * fx;
	const b = d[ i + W ] + ( d[ i + W + 1 ] - d[ i + W ] ) * fx;
	return a + ( b - a ) * fy;
}

// real metres -> game metres. Land gets a soft lift near sea level: at 1/6 the coastal plains (Waikīkī
// is 1-3 m above the sea) would sit a few centimetres above the waves, so the first few real metres are
// stretched to roughly two game metres, then the linear scale takes over.
export function realToGame( h ) {
	if ( h <= 0 ) return h * V_SCALE;
	return 2.8 * ( 1 - Math.exp( - h / 2 ) ) + h * V_SCALE;
}

export function sampleGame( m, x, z ) {
	const [ lon, lat ] = worldToLonLat( x, z );
	return realToGame( sampleReal( m, lon, lat ) );
}
