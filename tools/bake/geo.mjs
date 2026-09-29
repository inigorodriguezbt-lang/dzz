// Geographic frame of the game world.
// The world is the Hawaiian chain from Niʻihau to Hawaiʻi Island, scaled down: 1 game metre = 8 real
// metres horizontally, 6 real metres vertically (a gentle 1.33x vertical exaggeration).
// World axes: +x east, +z south, +y up; the origin is the centre of BOUNDS; sea level is y = 0.
export const BOUNDS = { west: -160.45, east: -154.60, north: 22.40, south: 18.75 };
export const ZOOM = 11;
export const H_SCALE = 1 / 8;
export const V_SCALE = 1 / 6;
export const LAT0 = ( BOUNDS.north + BOUNDS.south ) / 2;
export const LON0 = ( BOUNDS.west + BOUNDS.east ) / 2;
const R = 6378137;
const DEG = Math.PI / 180;
// equirectangular about the centre: fine at this size (the chain spans ~3.6 degrees of latitude)
export const M_PER_DEG_LAT = R * DEG;
export const M_PER_DEG_LON = R * DEG * Math.cos( LAT0 * DEG );
export function lonLatToWorld( lon, lat ) {
	return [ ( lon - LON0 ) * M_PER_DEG_LON * H_SCALE, - ( lat - LAT0 ) * M_PER_DEG_LAT * H_SCALE ];
}
export function worldToLonLat( x, z ) {
	return [ LON0 + x / ( M_PER_DEG_LON * H_SCALE ), LAT0 - z / ( M_PER_DEG_LAT * H_SCALE ) ];
}
export function lonToTileX( lon, z ) { return ( lon + 180 ) / 360 * 2 ** z; }
export function latToTileY( lat, z ) {
	const p = lat * DEG;
	return ( 1 - Math.log( Math.tan( p ) + 1 / Math.cos( p ) ) / Math.PI ) / 2 * 2 ** z;
}
export const WORLD_HALF_X = ( BOUNDS.east - BOUNDS.west ) / 2 * M_PER_DEG_LON * H_SCALE;
export const WORLD_HALF_Z = ( BOUNDS.north - BOUNDS.south ) / 2 * M_PER_DEG_LAT * H_SCALE;
