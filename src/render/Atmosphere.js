// Single-scattering atmosphere (Rayleigh, Mie, ozone) shared by the sky, the fog on every surface and
// the light colours. The GPU renders a sky-view LUT from it; the CPU evaluates the same model for the
// sun / ambient light colours.
import * as THREE from 'three';

export const ATMOS_GLSL = /* glsl */`
	const float ATM_RE = 6360e3;
	const float ATM_RA = 6420e3;
	const vec3 ATM_BR = vec3( 5.802e-6, 13.558e-6, 33.1e-6 );
	const float ATM_BM = 3.996e-6;
	const float ATM_BMEXT = 4.44e-6;
	const vec3 ATM_BO = vec3( 0.650e-6, 1.881e-6, 0.085e-6 );
	const float ATM_HR = 8000.0;
	const float ATM_HM = 1200.0;

	vec2 atmRaySphere( vec3 ro, vec3 rd, float r ) {
		float b = dot( ro, rd ), c = dot( ro, ro ) - r * r, d = b * b - c;
		if ( d < 0.0 ) return vec2( 1e9, -1e9 );
		d = sqrt( d );
		return vec2( -b - d, -b + d );
	}
	vec3 atmExtinction( float h, float haze ) {
		float dr = exp( -h / ATM_HR ), dm = exp( -h / ATM_HM ) * haze;
		float dO = max( 0.0, 1.0 - abs( h - 25000.0 ) / 15000.0 );
		return ATM_BR * dr + vec3( ATM_BMEXT ) * dm + ATM_BO * dO;
	}
	// transmittance from p along l to the top of the atmosphere
	vec3 atmTransmittance( vec3 p, vec3 l, float haze ) {
		vec2 t = atmRaySphere( p, l, ATM_RA );
		vec2 g = atmRaySphere( p, l, ATM_RE );
		if ( g.x > 0.0 ) return vec3( 0.0 );
		float seg = t.y / 8.0;
		vec3 od = vec3( 0.0 );
		for ( int i = 0; i < 8; i ++ ) {
			vec3 q = p + l * ( float( i ) + 0.5 ) * seg;
			od += atmExtinction( length( q ) - ATM_RE, haze ) * seg;
		}
		return exp( -od );
	}
	// in-scattered radiance along the view ray v from altitude alt (m), sun direction s
	vec3 atmSky( vec3 v, vec3 s, float alt, float haze, float sunI ) {
		vec3 ro = vec3( 0.0, ATM_RE + alt, 0.0 );
		vec2 t = atmRaySphere( ro, v, ATM_RA );
		vec2 g = atmRaySphere( ro, v, ATM_RE );
		float tMax = t.y;
		if ( g.x > 0.0 ) tMax = g.x;
		float seg = tMax / 16.0;
		float mu = dot( v, s );
		float pr = 3.0 / ( 16.0 * 3.14159265 ) * ( 1.0 + mu * mu );
		float gg = 0.78;
		float pm = 3.0 / ( 8.0 * 3.14159265 ) * ( ( 1.0 - gg * gg ) * ( 1.0 + mu * mu ) ) / ( ( 2.0 + gg * gg ) * pow( 1.0 + gg * gg - 2.0 * gg * mu, 1.5 ) );
		vec3 sumR = vec3( 0.0 ), sumM = vec3( 0.0 ), od = vec3( 0.0 );
		for ( int i = 0; i < 16; i ++ ) {
			vec3 p = ro + v * ( float( i ) + 0.5 ) * seg;
			float h = length( p ) - ATM_RE;
			float dr = exp( -h / ATM_HR ) * seg, dm = exp( -h / ATM_HM ) * haze * seg;
			od += atmExtinction( h, haze ) * seg;
			vec3 tl = atmTransmittance( p, normalize( s ), haze );
			vec3 tr = exp( -od ) * tl;
			sumR += tr * dr;
			sumM += tr * dm;
		}
		// a little multiple scattering: lift the dark side and the twilight
		vec3 ms = ( sumR * ATM_BR + sumM * ATM_BM ) * 0.08 * max( 0.0, s.y + 0.1 );
		return sunI * ( sumR * ATM_BR * pr + sumM * ATM_BM * pm ) + sunI * ms;
	}
`;

// ---- CPU twin (for light colours and fog) ----------------------------------------------------------

const RE = 6360e3, RA = 6420e3, HR = 8000, HM = 1200;
const BR = [ 5.802e-6, 13.558e-6, 33.1e-6 ], BM = 3.996e-6, BMEXT = 4.44e-6, BO = [ 0.650e-6, 1.881e-6, 0.085e-6 ];

function raySphere( oy, dx, dy, dz, r ) {
	// origin (0, oy, 0)
	const b = oy * dy, c = oy * oy - r * r, d = b * b - c;
	if ( d < 0 ) return null;
	const s = Math.sqrt( d );
	return [ - b - s, - b + s ];
}

export function transmittanceCPU( alt, l, haze = 1, out = new THREE.Vector3() ) {
	const oy = RE + alt;
	const t = raySphere( oy, l.x, l.y, l.z, RA );
	const g = raySphere( oy, l.x, l.y, l.z, RE );
	if ( ! t || ( g && g[ 0 ] > 0 ) ) {
		// below the horizon: fade through the Earth's shadow instead of a hard cut
		const k = Math.max( 0, 1 + l.y * 12 );
		return transmittanceCPU( alt, new THREE.Vector3( l.x, 0.0005, l.z ).normalize(), haze, out ).multiplyScalar( k * k );
	}
	const seg = t[ 1 ] / 16;
	let o0 = 0, o1 = 0, o2 = 0;
	for ( let i = 0; i < 16; i ++ ) {
		const s = ( i + 0.5 ) * seg;
		const px = l.x * s, py = oy + l.y * s, pz = l.z * s;
		const h = Math.hypot( px, py, pz ) - RE;
		const dr = Math.exp( - h / HR ), dm = Math.exp( - h / HM ) * haze, dO = Math.max( 0, 1 - Math.abs( h - 25000 ) / 15000 );
		o0 += ( BR[ 0 ] * dr + BMEXT * dm + BO[ 0 ] * dO ) * seg;
		o1 += ( BR[ 1 ] * dr + BMEXT * dm + BO[ 1 ] * dO ) * seg;
		o2 += ( BR[ 2 ] * dr + BMEXT * dm + BO[ 2 ] * dO ) * seg;
	}
	return out.set( Math.exp( - o0 ), Math.exp( - o1 ), Math.exp( - o2 ) );
}

// sun position for a latitude (deg), day of year and local solar hour; returns a world vector
// (+x east, +y up, +z south)
export function sunDirection( hour, day = 172, lat = 20.5, out = new THREE.Vector3() ) {
	const D = Math.PI / 180;
	const decl = - 23.44 * Math.cos( 2 * Math.PI / 365 * ( day + 10 ) ) * D;
	const H = ( hour - 12 ) * 15 * D;
	const phi = lat * D;
	const sinAlt = Math.sin( phi ) * Math.sin( decl ) + Math.cos( phi ) * Math.cos( decl ) * Math.cos( H );
	const alt = Math.asin( sinAlt );
	// azimuth from north, clockwise
	const cosAz = ( Math.sin( decl ) - Math.sin( alt ) * Math.sin( phi ) ) / ( Math.cos( alt ) * Math.cos( phi ) );
	let az = Math.acos( Math.max( - 1, Math.min( 1, cosAz ) ) );
	if ( H > 0 ) az = 2 * Math.PI - az;
	const ca = Math.cos( alt );
	return out.set( Math.sin( az ) * ca, Math.sin( alt ), - Math.cos( az ) * ca );
}
