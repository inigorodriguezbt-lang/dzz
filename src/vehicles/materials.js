// Vehicle materials: one clear-coated physical material per vehicle (paint colours, dirt, rust, burn,
// sun fade and the lamp channels are uniforms, everything else is per-vertex data from kit.js), the
// window glass (fresnel alpha, dirt film, cracks) and the decal atlas (plates, gauges, liveries).
import * as THREE from 'three';
import { patchMaterial } from '../render/Materials.js';

export const EMIT_CHANNELS = 12;

// ---- decal atlas ----------------------------------------------------------------------------------
// 1024 x 512 canvas. Regions (pixels, from the top-left); ATLAS[ name ] = [ u0, v0, u1, v1 ].
const AW = 1024, AH = 512;
const REGIONS = {
	plate: [ 64, 0, 256, 128 ],
	gauges: [ 320, 0, 384, 128 ],
	police: [ 704, 0, 320, 96 ],
	thebus: [ 704, 96, 320, 96 ],
	dest: [ 0, 128, 384, 64 ],
	grille: [ 384, 128, 128, 64 ],
	army: [ 512, 128, 192, 64 ],
	tours: [ 0, 192, 384, 64 ],
	boatname: [ 384, 192, 320, 64 ],
	panel: [ 704, 192, 320, 128 ],
	ambulance: [ 0, 256, 384, 64 ],
	star: [ 384, 256, 128, 128 ],
	tread: [ 512, 256, 128, 128 ],
	vents: [ 640, 320, 128, 64 ],
	stripes: [ 0, 320, 384, 64 ],
	fire: [ 0, 384, 384, 64 ],
	numbers: [ 384, 384, 256, 64 ],
};
export const ATLAS = {};
for ( const k in REGIONS ) {
	const [ x, y, w, h ] = REGIONS[ k ];
	ATLAS[ k ] = [ x / AW, 1 - ( y + h ) / AH, ( x + w ) / AW, 1 - y / AH ];
}

let atlasTex = null;
export function atlas() {
	if ( atlasTex ) return atlasTex;
	const c = document.createElement( 'canvas' );
	c.width = AW; c.height = AH;
	const g = c.getContext( '2d' );
	g.fillStyle = '#fff'; g.fillRect( 0, 0, AW, AH );
	const R = ( k ) => REGIONS[ k ];
	const font = ( px, w = 800 ) => `${w} ${px}px "Arial Narrow", Arial, Helvetica, sans-serif`;

	// Hawaii rainbow plate
	{
		const [ x, y, w, h ] = R( 'plate' );
		g.fillStyle = '#f7f7f2'; g.fillRect( x, y, w, h );
		const grad = g.createLinearGradient( x, 0, x + w, 0 );
		[ '#e23b3b', '#f08a2c', '#f4d23c', '#4cb04c', '#3b7fe0', '#7a4cc0' ].forEach( ( col, i, a ) => grad.addColorStop( i / ( a.length - 1 ), col ) );
		g.globalAlpha = 0.85;
		g.beginPath(); g.ellipse( x + w / 2, y + h * 1.15, w * 0.62, h * 0.95, 0, Math.PI, 2 * Math.PI ); g.lineWidth = 9; g.strokeStyle = grad; g.stroke();
		g.globalAlpha = 1;
		g.fillStyle = '#1a2a6a'; g.font = font( 22, 700 ); g.textAlign = 'center';
		g.fillText( 'HAWAII', x + w / 2, y + 26 );
		g.fillStyle = '#111'; g.font = font( 62, 800 );
		g.fillText( 'ALOHA', x + w / 2, y + 96 );
		g.font = font( 14, 600 ); g.fillStyle = '#333'; g.fillText( 'Aloha State', x + w / 2, y + 118 );
		g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect( x + 3, y + 3, w - 6, h - 6 );
	}
	// instrument cluster: speedometer and tachometer (lit at night)
	{
		const [ x, y, w, h ] = R( 'gauges' );
		g.fillStyle = '#050505'; g.fillRect( x, y, w, h );
		const dial = ( cx, cy, r, n, red ) => {
			g.strokeStyle = '#ddd'; g.lineWidth = 2;
			g.beginPath(); g.arc( cx, cy, r, Math.PI * 0.75, Math.PI * 2.25 ); g.stroke();
			for ( let i = 0; i <= n; i ++ ) {
				const a = Math.PI * 0.75 + i / n * Math.PI * 1.5;
				g.strokeStyle = red && i > n * 0.8 ? '#ff3b30' : '#f0f0f0';
				g.lineWidth = i % 2 ? 1.5 : 3;
				g.beginPath(); g.moveTo( cx + Math.cos( a ) * r * 0.82, cy + Math.sin( a ) * r * 0.82 ); g.lineTo( cx + Math.cos( a ) * r * 0.97, cy + Math.sin( a ) * r * 0.97 ); g.stroke();
			}
			g.fillStyle = '#ff7a1a';
			g.save(); g.translate( cx, cy ); g.rotate( Math.PI * 1.05 ); g.fillRect( - 2, 0, 4, r * 0.8 ); g.restore();
			g.fillStyle = '#333'; g.beginPath(); g.arc( cx, cy, 6, 0, Math.PI * 2 ); g.fill();
		};
		dial( x + 95, y + 64, 56, 12, false );
		dial( x + 289, y + 64, 56, 8, true );
		g.fillStyle = '#7fd4ff'; g.font = font( 16, 700 ); g.textAlign = 'center';
		g.fillText( 'km/h', x + 95, y + 100 ); g.fillText( 'x1000', x + 289, y + 100 );
		g.fillStyle = '#9be27a'; g.fillRect( x + 180, y + 40, 24, 8 ); g.fillStyle = '#ffb000'; g.fillRect( x + 180, y + 80, 24, 8 );
	}
	// POLICE door text on white
	{
		const [ x, y, w, h ] = R( 'police' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#0d2a6e'; g.font = font( 64, 900 ); g.textAlign = 'center'; g.fillText( 'POLICE', x + w / 2, y + 66 );
		g.fillStyle = '#0d2a6e'; g.fillRect( x + 10, y + 78, w - 20, 6 );
	}
	// TheBus logo
	{
		const [ x, y, w, h ] = R( 'thebus' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.textAlign = 'left';
		g.font = `italic 400 34px Georgia, serif`; g.fillStyle = '#7a4a12'; g.fillText( 'The', x + 30, y + 62 );
		g.font = `italic 900 60px Georgia, serif`; g.fillStyle = '#d6881a'; g.fillText( 'Bus', x + 92, y + 66 );
		g.fillStyle = '#f2b81c'; g.fillRect( x + 30, y + 76, 230, 5 );
	}
	// destination sign (LED amber on black)
	{
		const [ x, y, w, h ] = R( 'dest' );
		g.fillStyle = '#080806'; g.fillRect( x, y, w, h );
		g.fillStyle = '#ffb31a'; g.font = font( 44, 800 ); g.textAlign = 'left'; g.fillText( '8  WAIKIKI', x + 20, y + 48 );
		g.globalAlpha = 0.25; g.fillStyle = '#000';
		for ( let i = 0; i < w; i += 4 ) g.fillRect( x + i, y, 1, h );
		for ( let j = 0; j < h; j += 4 ) g.fillRect( x, y + j, w, 1 );
		g.globalAlpha = 1;
	}
	// grille mesh
	{
		const [ x, y, w, h ] = R( 'grille' );
		g.fillStyle = '#0c0c0d'; g.fillRect( x, y, w, h );
		g.strokeStyle = '#3a3b3e'; g.lineWidth = 2;
		for ( let j = 0; j < h; j += 8 ) for ( let i = ( j / 8 ) % 2 * 6; i < w; i += 12 ) { g.beginPath(); g.moveTo( x + i, y + j + 4 ); g.lineTo( x + i + 6, y + j ); g.lineTo( x + i + 12, y + j + 4 ); g.stroke(); }
	}
	// U.S. ARMY stencil (drab background multiplies the paint: white letters stay pale)
	{
		const [ x, y, w, h ] = R( 'army' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#1b1c16'; g.font = font( 40, 900 ); g.textAlign = 'center'; g.fillText( 'U.S. ARMY', x + w / 2, y + 46 );
	}
	// tour helicopter livery
	{
		const [ x, y, w, h ] = R( 'tours' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#0f5f8c'; g.font = `italic 900 38px Arial, sans-serif`; g.textAlign = 'left'; g.fillText( 'ISLAND AIR', x + 14, y + 40 );
		g.fillStyle = '#e8762a'; g.font = font( 22, 700 ); g.fillText( 'HELICOPTER TOURS', x + 16, y + 60 );
	}
	// boat name on the hull
	{
		const [ x, y, w, h ] = R( 'boatname' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#123'; g.font = `italic 700 40px Georgia, serif`; g.textAlign = 'center'; g.fillText( 'Kai Nani', x + w / 2, y + 42 );
		g.font = font( 14, 600 ); g.fillText( 'HONOLULU, HI', x + w / 2, y + 60 );
	}
	// aircraft instrument panel (six-pack)
	{
		const [ x, y, w, h ] = R( 'panel' );
		g.fillStyle = '#16171a'; g.fillRect( x, y, w, h );
		for ( let r = 0; r < 2; r ++ ) for ( let c = 0; c < 3; c ++ ) {
			const cx = x + 55 + c * 95, cy = y + 34 + r * 62;
			g.fillStyle = '#050505'; g.beginPath(); g.arc( cx, cy, 27, 0, Math.PI * 2 ); g.fill();
			g.strokeStyle = '#ccc'; g.lineWidth = 1.5; g.beginPath(); g.arc( cx, cy, 22, 0, Math.PI * 2 ); g.stroke();
			if ( r === 0 && c === 1 ) { g.fillStyle = '#3d7fd1'; g.fillRect( cx - 20, cy - 20, 40, 20 ); g.fillStyle = '#7a4b22'; g.fillRect( cx - 20, cy, 40, 20 ); g.fillStyle = '#fff'; g.fillRect( cx - 14, cy - 1, 28, 2 ); }
			else { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo( cx, cy ); g.lineTo( cx + 14 * Math.cos( r + c ), cy - 14 * Math.sin( r + c ) ); g.stroke(); }
		}
	}
	// AMBULANCE (mirrored for the front would be nicer; the sides read correctly)
	{
		const [ x, y, w, h ] = R( 'ambulance' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#c8141e'; g.font = font( 50, 900 ); g.textAlign = 'center'; g.fillText( 'AMBULANCE', x + w / 2, y + 50 );
	}
	// white star (military)
	{
		const [ x, y, w, h ] = R( 'star' );
		g.fillStyle = '#6d6f5a'; g.fillRect( x, y, w, h );
		g.fillStyle = '#f2f2ea';
		g.beginPath();
		for ( let i = 0; i < 10; i ++ ) { const a = - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 56; g.lineTo( x + w / 2 + Math.cos( a ) * r, y + h / 2 + Math.sin( a ) * r ); }
		g.closePath(); g.fill();
		g.strokeStyle = '#f2f2ea'; g.lineWidth = 5; g.beginPath(); g.arc( x + w / 2, y + h / 2, 60, 0, Math.PI * 2 ); g.stroke();
	}
	// tyre tread blocks
	{
		const [ x, y, w, h ] = R( 'tread' );
		g.fillStyle = '#2a2a2a'; g.fillRect( x, y, w, h );
		g.fillStyle = '#050505';
		for ( let j = 0; j < h; j += 16 ) { g.fillRect( x, y + j, w, 4 ); for ( let i = 0; i < w; i += 32 ) g.fillRect( x + i + ( j / 16 % 2 ) * 16, y + j, 5, 16 ); }
	}
	// louvres / vents
	{
		const [ x, y, w, h ] = R( 'vents' );
		g.fillStyle = '#777'; g.fillRect( x, y, w, h );
		for ( let j = 4; j < h; j += 10 ) { g.fillStyle = '#111'; g.fillRect( x + 4, y + j, w - 8, 5 ); }
	}
	// bus livery stripes (yellow, orange, brown)
	{
		const [ x, y, w, h ] = R( 'stripes' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#f4c21a'; g.fillRect( x, y + 8, w, 14 );
		g.fillStyle = '#e8861c'; g.fillRect( x, y + 24, w, 14 );
		g.fillStyle = '#8a4a16'; g.fillRect( x, y + 40, w, 14 );
	}
	// FIRE DEPT
	{
		const [ x, y, w, h ] = R( 'fire' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#c9a227'; g.font = font( 44, 900 ); g.textAlign = 'center'; g.fillText( 'HONOLULU FIRE', x + w / 2, y + 46 );
	}
	// hull / tail numbers
	{
		const [ x, y, w, h ] = R( 'numbers' );
		g.fillStyle = '#fff'; g.fillRect( x, y, w, h );
		g.fillStyle = '#111'; g.font = font( 46, 800 ); g.textAlign = 'center'; g.fillText( 'N172HI', x + w / 2, y + 48 );
	}
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	atlasTex = t;
	return t;
}

// ---- the body material ------------------------------------------------------------------------------

const BODY_VERT_PARS = /* glsl */`
	attribute vec4 aMat;
	varying vec4 vMat;
	varying vec3 vObj;
	varying vec3 vObjN;
`;
const BODY_FRAG_PARS = /* glsl */`
	uniform vec3 uPaint; uniform vec3 uPaint2; uniform float uPaintMetal; uniform float uPaintRough;
	uniform float uDirt; uniform float uRust; uniform float uBurnt; uniform float uFade; uniform float uHeight;
	uniform float uEmit[ ${EMIT_CHANNELS} ];
	varying vec4 vMat;
	varying vec3 vObj;
	varying vec3 vObjN;
	float vehRust = 0.0; float vehDirt = 0.0; float vehPaint = 0.0;
	vec3 vehLamp = vec3( 0.0 );
	float triNoise( vec3 p, vec3 n, float s ) {
		vec3 w = abs( n ); w /= ( w.x + w.y + w.z + 1e-4 );
		return fbm2( p.zy * s ) * w.x + fbm2( p.xz * s + 7.3 ) * w.y + fbm2( p.xy * s + 3.1 ) * w.z;
	}
`;

export function makeBodyMaterial( opts = {} ) {
	const u = {
		uPaint: { value: new THREE.Color( opts.paint ?? 0xffffff ) },
		uPaint2: { value: new THREE.Color( opts.paint2 ?? 0xffffff ) },
		uPaintMetal: { value: opts.metallic ?? 0.0 },
		uPaintRough: { value: opts.paintRough ?? 0.38 },
		uDirt: { value: opts.dirt ?? 0 },
		uRust: { value: opts.rust ?? 0 },
		uBurnt: { value: 0 },
		uFade: { value: opts.fade ?? 0 },
		uHeight: { value: opts.height ?? 1.5 },
		uEmit: { value: new Array( EMIT_CHANNELS ).fill( 0 ) },
	};
	const m = new THREE.MeshPhysicalMaterial( {
		vertexColors: true, map: atlas(), roughness: 1, metalness: 1,
		clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, envMapIntensity: 1,
	} );
	m.userData.u = u;
	patchMaterial( m, 'vehicle-body', ( shader ) => {
		Object.assign( shader.uniforms, u );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + BODY_VERT_PARS )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n vMat = aMat; vObj = position; vObjN = normal;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + BODY_FRAG_PARS )
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				{
					vehLamp = diffuseColor.rgb;
					float slot = vMat.z;
					vehPaint = slot > 0.5 ? 1.0 : 0.0;
					vec3 paint = slot > 1.5 ? uPaint2 : uPaint;
					// sun-bleached paint on abandoned cars
					float lp = dot( paint, vec3( 0.3, 0.55, 0.15 ) );
					paint = mix( paint, vec3( lp ) * 1.1 + 0.05, uFade * 0.55 );
					diffuseColor.rgb *= mix( vec3( 1.0 ), paint, vehPaint );
					vec3 on = normalize( vObjN );
					float h = clamp( vObj.y / uHeight, 0.0, 1.0 );
					// dirt: road grime from below, dust settled on the upper surfaces
					float nd = triNoise( vObj, on, 2.3 );
					float nd2 = triNoise( vObj, on, 9.0 );
					float low = 1.0 - smoothstep( 0.05, 0.55, h );
					float settle = smoothstep( 0.6, 0.95, on.y ) * 0.55;
					vehDirt = clamp( uDirt * ( low * 1.2 + settle + 0.25 ) * ( 0.55 + nd * 0.9 ) - ( 1.0 - uDirt ) * 0.2, 0.0, 1.0 );
					vec3 dirtCol = mix( vec3( 0.20, 0.155, 0.11 ), vec3( 0.34, 0.28, 0.21 ), nd2 );
					// rust: blotches on paint and bare steel, worst low down and on the edges of panels
					float rn = triNoise( vObj * 1.3 + 11.0, on, 1.4 ) * 0.75 + nd2 * 0.35 + low * 0.25;
					float metalBare = step( 0.5, vMat.y ) * step( 0.2, vMat.x );
					vehRust = uRust * smoothstep( 0.72, 0.9, rn + uRust * 0.25 ) * max( vehPaint, metalBare );
					vec3 rustCol = mix( vec3( 0.23, 0.085, 0.03 ), vec3( 0.45, 0.2, 0.07 ), nd2 );
					diffuseColor.rgb = mix( diffuseColor.rgb, rustCol, vehRust );
					diffuseColor.rgb = mix( diffuseColor.rgb, dirtCol, vehDirt * 0.85 );
					// burnt out: charcoal, soot and heat-rusted panels
					vec3 burnt = mix( vec3( 0.025, 0.022, 0.02 ), vec3( 0.22, 0.09, 0.04 ), smoothstep( 0.45, 0.8, rn ) );
					diffuseColor.rgb = mix( diffuseColor.rgb, burnt, uBurnt );
				}` )
			.replace( '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
				roughnessFactor = mix( vMat.x, uPaintRough, vehPaint );
				roughnessFactor = mix( roughnessFactor, 0.95, max( max( vehRust, vehDirt * 0.9 ), uBurnt ) );` )
			.replace( '#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
				metalnessFactor = mix( vMat.y, uPaintMetal, vehPaint );
				metalnessFactor = mix( metalnessFactor, 0.0, max( vehRust, vehDirt ) );
				metalnessFactor = mix( metalnessFactor, 0.15, uBurnt );` )
			.replace( '#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
				{
					int ch = int( vMat.w + 0.5 );
					if ( ch > 0 ) totalEmissiveRadiance += vehLamp * uEmit[ ch ] * ( 1.0 - uBurnt );
				}` )
			.replace( '#include <lights_physical_fragment>', /* glsl */`#include <lights_physical_fragment>
				#ifdef USE_CLEARCOAT
					material.clearcoat = vehPaint * ( 1.0 - max( vehRust, vehDirt ) ) * ( 1.0 - uFade * 0.7 ) * ( 1.0 - uBurnt );
				#endif` );
	} );
	m.customProgramCacheKey = () => 'vehicle-body';
	return m;
}

// ---- glass ------------------------------------------------------------------------------------------

export function makeGlassMaterial( opts = {} ) {
	const u = {
		uCrack: { value: opts.crack ?? 0 },
		uGDirt: { value: opts.dirt ?? 0 },
		uTint: { value: opts.tint ?? 0.35 },
	};
	const m = new THREE.MeshStandardMaterial( {
		color: 0x121a20, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.3, depthWrite: false,
		side: THREE.DoubleSide, envMapIntensity: 1.6,
	} );
	m.userData.u = u;
	patchMaterial( m, 'vehicle-glass', ( shader ) => {
		Object.assign( shader.uniforms, u );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vGObj;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n vGObj = position;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nuniform float uCrack; uniform float uGDirt; uniform float uTint; varying vec3 vGObj;\n' )
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				float gd = 0.0, crackLine = 0.0;
				{
					vec2 p = vGObj.zy * 1.0 + vGObj.x * 0.7;
					// cracks: cellular shards; the cells near the impact are gone
					if ( uCrack > 0.0 ) {
						vec2 q = p * 7.0;
						vec2 i = floor( q ), f = fract( q );
						float d1 = 8.0, d2 = 8.0;
						for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
							vec2 o = vec2( float( x ), float( y ) );
							vec2 r = o + vec2( hash12( i + o ), hash12( i + o + 17.0 ) ) - f;
							float d = dot( r, r );
							if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
						}
						crackLine = 1.0 - smoothstep( 0.0, 0.06, sqrt( d2 ) - sqrt( d1 ) );
						float hole = hash12( floor( q * 0.5 ) + 3.0 );
						if ( hole < uCrack * 0.85 - 0.25 ) discard;
					}
					gd = uGDirt * smoothstep( 0.2, 0.8, fbm2( p * 1.7 ) + ( 1.0 - clamp( vGObj.y, 0.0, 2.0 ) * 0.5 ) * 0.3 );
					diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.37, 0.3 ), gd );
					diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.85 ), crackLine * uCrack );
				}` )
			.replace( '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
				roughnessFactor = mix( roughnessFactor, 0.85, gd );` )
			.replace( '#include <opaque_fragment>', /* glsl */`
				{
					// glass reflects more at grazing angles: raise the alpha with a fresnel term
					float fr = pow( 1.0 - abs( dot( normalize( vViewPosition ), normal ) ), 4.0 );
					diffuseColor.a = clamp( uTint + fr * 0.6 + gd * 0.7 + crackLine * uCrack * 0.6, 0.0, 0.97 );
				}
				#include <opaque_fragment>` );
	}, { noCloudShadow: false } );
	m.customProgramCacheKey = () => 'vehicle-glass';
	return m;
}

// ---- simple shared materials for effects -------------------------------------------------------------

export function makeRotorDiscMaterial() {
	const m = new THREE.MeshBasicMaterial( { color: 0x202020, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide } );
	return m;
}
