// Human characters for the infected and the survivors: Microsoft Rocketbox avatars (MIT, see
// public/models/characters/LICENSE-Rocketbox.md) converted by src/ai/tools/rb_build.py into one GLB
// (skinned mesh + alpha-tested cards + a decimated LOD, the 80-bone Bip01 skeleton) and three atlas
// images per avatar: colour, normal and a mask (R skin, G eyes, B card alpha / 1 - garment in the body cell).
//
// The infected look is a shader over the living texture: bloodless ashen skin mottled with lividity and rot,
// fine veins, sunken dark eye sockets and lips, milky or bloodshot eyes; clothes faded, filthy and torn open
// (hue / tint varied per instance, uniforms keep their colours), an optional aloha print on the shirt; blood
// round the mouth and down the chin into a soaked chest, up the forearms, round the bite that turned them,
// smeared down the front and at the knees, and fresh wounds where the body is hit. It is all worked out in the
// mesh's bind-pose space (vBind), so it stays glued to the body while it animates.
//
// Instances are pooled per avatar (crowds spawn and despawn all the time) and templates nobody uses are
// unloaded so only a handful of atlases live on the GPU at once.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { patchMaterial } from '../render/Materials.js';
import { ClipBank, RigInfo, Rig, BONE } from './Anim.js';

export const MAX_WOUNDS = 6;

// avatar id -> sex, what it can be (the spawner picks by role), whether the shirt can take an aloha print
export const AVATARS = {
	m_casual1: { sex: 'm', roles: [ 'civilian', 'tourist' ], shirt: true },
	m_casual2: { sex: 'm', roles: [ 'civilian', 'tourist', 'runner', 'bandit' ], shirt: true },
	m_casual3: { sex: 'm', roles: [ 'civilian', 'brute', 'bandit' ], shirt: true },
	m_casual4: { sex: 'm', roles: [ 'civilian', 'brute', 'bandit' ] },
	m_tourist1: { sex: 'm', roles: [ 'tourist', 'civilian' ], shirt: true },
	m_office: { sex: 'm', roles: [ 'civilian', 'tourist' ], shirt: true },
	m_worker: { sex: 'm', roles: [ 'civilian', 'brute', 'worker' ] },
	m_overalls: { sex: 'm', roles: [ 'civilian', 'brute', 'worker' ] },
	m_flannel: { sex: 'm', roles: [ 'civilian', 'brute', 'worker', 'bandit' ] },
	m_swim: { sex: 'm', roles: [ 'tourist', 'runner' ] },
	m_sport: { sex: 'm', roles: [ 'runner', 'tourist', 'civilian' ], shirt: true },
	m_pilot: { sex: 'm', roles: [ 'pilot', 'civilian' ] },
	f_casual1: { sex: 'f', roles: [ 'civilian', 'runner' ] },
	f_casual2: { sex: 'f', roles: [ 'civilian', 'tourist', 'runner' ], shirt: true },
	f_casual3: { sex: 'f', roles: [ 'civilian', 'tourist' ], shirt: true },
	f_party: { sex: 'f', roles: [ 'tourist', 'civilian' ], shirt: true },
	f_sport: { sex: 'f', roles: [ 'runner', 'tourist' ] },
	m_police1: { sex: 'm', roles: [ 'police', 'bandit' ] },
	m_police2: { sex: 'm', roles: [ 'police' ] },
	m_security: { sex: 'm', roles: [ 'police', 'civilian', 'bandit' ] },
	m_army1: { sex: 'm', roles: [ 'military', 'bandit_mil' ] },
	m_army2: { sex: 'm', roles: [ 'military', 'bandit_mil' ] },
	f_army: { sex: 'f', roles: [ 'military' ] },
	m_medic: { sex: 'm', roles: [ 'medic' ] },
	f_nurse: { sex: 'f', roles: [ 'medic' ] },
	m_surgeon: { sex: 'm', roles: [ 'medic' ] },
	m_fire: { sex: 'm', roles: [ 'firefighter' ] },
};

export function avatarsFor( role ) {
	const out = [];
	for ( const id in AVATARS ) if ( AVATARS[ id ].roles.includes( role ) ) out.push( id );
	return out;
}

// classic aloha palettes: ground, leaves, flowers, flower centres
export const ALOHA = [
	[ 0xa11c2c, 0x2e6b3a, 0xf3e6cf, 0xe8b830 ], [ 0x1d3a6e, 0x2f7a8a, 0xf4f0e6, 0xe6b422 ], [ 0x16161a, 0x2c5a3a, 0xc8243a, 0xf0d060 ],
	[ 0xd9a82a, 0x3a6a2a, 0xb8243a, 0x6a2a14 ], [ 0x1b7078, 0x1f4a3a, 0xf2ead2, 0xd86a2a ], [ 0xefe6cf, 0x2f7a4a, 0xd8485a, 0xf0c040 ],
	[ 0x5a2a6a, 0x2a5a4a, 0xf2a0c0, 0xf8e070 ], [ 0x2a4a2a, 0x6a8a3a, 0xf0e6d0, 0xd83a2a ],
];

// ---- the character shader --------------------------------------------------------------------------------

const VERT_PARS = /* glsl */`
	varying vec3 vBind;
`;
const FRAG_PARS = /* glsl */`
	varying vec3 vBind;
	uniform sampler2D uMask, uPrint;
	uniform float uInfect, uRot, uHue, uDirt, uBlood, uSeed, uWetBody, uHandBlood, uMouthBlood, uAloha, uAtlasK, uTear, uEyeRed, uDetail;
	uniform vec3 uSkinTone, uClothTint, uMouth, uHandL, uHandR, uFwd, uEyeL, uEyeR, uPrintA, uPrintB, uPrintC, uPrintD;
	uniform vec4 uBite;
	uniform vec4 uWounds[ ${MAX_WOUNDS} ];
	float zh3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
	float zn3( vec3 x ) {
		vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( mix( zh3( i ), zh3( i + vec3( 1, 0, 0 ) ), f.x ), mix( zh3( i + vec3( 0, 1, 0 ) ), zh3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
			mix( mix( zh3( i + vec3( 0, 0, 1 ) ), zh3( i + vec3( 1, 0, 1 ) ), f.x ), mix( zh3( i + vec3( 0, 1, 1 ) ), zh3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
	}
	float zfbm( vec3 p ) { return zn3( p ) * 0.55 + zn3( p * 2.13 + 7.1 ) * 0.3 + zn3( p * 4.37 + 3.3 ) * 0.15; }
	vec3 zHue( vec3 c, float h ) {
		// rotate the hue around the grey axis
		const vec3 k = vec3( 0.57735 );
		float a = h * 6.2831853, ca = cos( a );
		return c * ca + cross( k, c ) * sin( a ) + k * dot( k, c ) * ( 1.0 - ca );
	}
`;
// blood at a bind-space point (0..1) and how fresh it is (wet red vs dried brown): the run-off from the mouth
// down the chin, throat and shirt front, the hands and forearms, the bite that turned them (a torn wound with
// the clothes around it soaked through), bullet and blade wounds, and spatter
const BLOOD_FN = /* glsl */`
	float zBlood( vec3 p, out float fresh ) {
		float b = 0.0;
		fresh = 0.0;
		vec3 d = p - uMouth;
		float fwdD = dot( d, uFwd );
		vec3 side = d - uFwd * fwdD; side.y = 0.0;
		float lat = length( side );
		float below = - d.y;
		// the mouth and chin: a smear round the lips, ragged at its edge
		float edge = zn3( p * 90.0 + uSeed ) * 0.012;
		float smear = smoothstep( 0.036 + edge, 0.016, length( vec3( lat * 1.1, d.y * 1.4 + 0.01, min( fwdD, 0.0 ) * 0.6 ) ) );
		// thin streaks down the chin and throat, widening into a soaked patch on the chest (front only)
		float front = smoothstep( - 0.06, 0.02, fwdD + below * 0.12 );
		float streak = zn3( vec3( lat * 80.0 + uSeed * 13.0, p.y * 2.5, uSeed ) );
		float run = step( 0.0, below ) * smoothstep( 0.55, 0.05, below ) * smoothstep( 0.025 + below * 0.3, 0.0, lat ) * front;
		run *= smoothstep( 0.45, 0.75, streak + ( 0.4 - below ) * 0.5 );
		// (its outline wanders and it runs down in tongues from the bottom edge)
		float bw = ( zfbm( p * 7.0 + uSeed * 1.7 ) - 0.5 ) * 0.14 + ( zn3( p * 40.0 + uSeed ) - 0.5 ) * 0.03;
		float tongue = smoothstep( 0.5, 0.8, zn3( vec3( lat * 34.0 + uSeed, 0.0, uSeed ) ) ) * smoothstep( 0.62, 0.3, below ) * step( 0.3, below );
		float bib = smoothstep( 0.15 + bw, 0.04, length( vec2( lat * 1.15, ( below - 0.3 ) * ( below > 0.3 ? 1.4 - tongue * 1.1 : 0.85 ) ) ) ) * front;
		// soaked unevenly: thinner where the cloth wicked it, rivulets through it
		bib *= 0.55 + 0.45 * smoothstep( 0.3, 0.6, zfbm( vec3( lat * 22.0, below * 6.0, uSeed ) + p * 3.0 ) );
		b += ( smear + run + bib * 0.85 ) * uMouthBlood;
		// hands and forearms: fingers and palms caked, streaks and flecks up towards the elbows
		float hd = min( length( p - uHandL ), length( p - uHandR ) );
		float hn = zfbm( p * 16.0 + uSeed );
		b += smoothstep( 0.14, 0.05, hd ) * smoothstep( 0.32, 0.55, hn + 0.12 ) * uHandBlood;
		b += smoothstep( 0.36, 0.1, hd ) * smoothstep( 0.6, 0.74, hn ) * uHandBlood * 0.85;
		// the bite: a ragged torn wound, a stain soaked out round it with a wandering edge, runs down below
		if ( uBite.w > 0.0 ) {
			vec3 q = p - uBite.xyz;
			float r = length( q ) / uBite.w;
			float ragged = ( zn3( q * 60.0 + uSeed ) - 0.5 ) * 0.8 + ( zfbm( q * 16.0 + uSeed ) - 0.5 ) * 1.4;
			b += smoothstep( 1.4 + ragged, 0.75 + ragged * 0.5, r ) * 0.85;
			float drip = step( q.y, 0.0 ) * smoothstep( uBite.w * 0.7, 0.0, length( q - vec3( 0.0, q.y, 0.0 ) ) - zn3( vec3( q.x * 40.0, 0.0, q.z * 40.0 ) + uSeed ) * uBite.w * 0.6 )
				* smoothstep( - 0.45, 0.0, q.y ) * step( 0.45, zn3( vec3( q.x * 60.0, q.y * 4.0, q.z * 60.0 ) ) );
			b += drip * 0.8;
			fresh = max( fresh, smoothstep( 0.8, 0.2, r + ragged * 0.25 ) * 0.6 );
		}
		// bullet / blade wounds: dark holes with a run below, fresh
		for ( int i = 0; i < ${MAX_WOUNDS}; i ++ ) {
			vec4 w = uWounds[ i ];
			if ( w.w <= 0.0 ) continue;
			vec3 q = p - w.xyz;
			float hole = smoothstep( w.w * 1.6, w.w * 0.3, length( q ) );
			float drip = step( q.y, 0.0 ) * smoothstep( w.w * 0.8, 0.0, length( q.xz ) ) * smoothstep( - 0.35, 0.0, q.y ) * step( 0.42, zn3( vec3( q.x * 90.0, q.y * 6.0, q.z * 90.0 + float( i ) ) ) );
			float wb = hole + drip * 0.85;
			b += wb;
			fresh = max( fresh, clamp( wb, 0.0, 1.0 ) );
		}
		// a few smears down the front where they wiped their hands or fell, frayed at the edge and run downwards
		float frontHalf = smoothstep( - 0.03, 0.04, dot( p, uFwd ) );
		for ( int i = 0; i < 3; i ++ ) {
			float fi = float( i ) + 1.0;
			vec3 c = vec3( ( zh3( vec3( uSeed, fi, 1.3 ) ) - 0.5 ) * 0.42, 0.45 + zh3( vec3( uSeed, fi, 2.7 ) ) * 0.95, 0.0 );
			if ( zh3( vec3( uSeed, fi, 5.3 ) ) * 1.3 < 1.0 - uBlood ) continue;
			float rr = 0.04 + zh3( vec3( uSeed, fi, 4.1 ) ) * 0.065;
			vec2 dq = vec2( p.x - c.x, ( p.y - c.y ) * ( p.y < c.y ? 0.45 : 1.0 ) );
			float fray = ( zn3( p * 14.0 + fi ) - 0.5 ) * 0.6;
			if ( uDetail > 0.5 ) fray += ( zn3( p * 55.0 + fi * 3.1 ) - 0.5 ) * 0.5;
			b += smoothstep( rr * ( 1.0 + fray ), rr * 0.45, length( dq ) ) * frontHalf * 0.9;
		}
		// kneeling in it: smudges on the knees and shins of the ones that fed
		float knee = smoothstep( 0.12, 0.03, abs( p.y - 0.47 ) ) * frontHalf * smoothstep( 0.5, 0.72, zfbm( p * 9.0 + uSeed ) );
		b += knee * uMouthBlood * uBlood * 0.6;
		// fine spray over the chest and arms around the mouth
		float spray = smoothstep( 0.45, 0.1, length( ( p - uMouth - vec3( 0.0, - 0.32, 0.0 ) ) * vec3( 0.8, 0.6, 1.0 ) ) ) * frontHalf * step( p.y, uMouth.y - 0.08 );
		if ( uDetail > 0.5 ) b += smoothstep( 0.93, 0.96, zn3( p * 120.0 + uSeed ) ) * spray * uMouthBlood;
		// old stains here and there
		float sp = zfbm( p * 7.0 + uSeed * 3.1 ) + zn3( p * 45.0 + uSeed ) * 0.1;
		b += smoothstep( 0.8 - uBlood * 0.05, 0.84 - uBlood * 0.05, sp ) * 0.6;
		return clamp( b, 0.0, 1.0 );
	}
`;
const FRAG_MAP = /* glsl */`
	vec4 zm = texture2D( uMask, vMapUv );
	#ifdef ZCARDS
		diffuseColor.a *= zm.b;
		float zShirt = 0.0;
	#else
		float zShirt = ( 1.0 - zm.b ) * uAloha;
	#endif
	// partly masked texels (the mask is soft at its edges) count as skin
	float zSkin = smoothstep( 0.12, 0.5, zm.r );
	// the body texture fills the top 1024 rows of the atlas; head, hair and gear sit below
	float zBodyCell = step( vMapUv.y * uAtlasK, 1.0 );
	vec3 zBase = diffuseColor.rgb;
	float zLum = dot( zBase, vec3( 0.3, 0.59, 0.11 ) );
	vec3 zp = vBind;
	float zN1 = zfbm( zp * 6.0 + uSeed ), zN2 = zn3( zp * 21.0 + uSeed * 2.0 ), zN3 = zfbm( zp * 2.2 + uSeed * 0.7 );
	// ---- infected skin: bloodless, waxy and grey, a little of the living skin's own colour left under the pallor
	// (lips, knuckles, the texture's shading), tinted by the instance's tone (ashen, sallow, cold or mottled)
	vec3 zAsh = uSkinTone * ( 0.03 + mix( vec3( zLum ), zBase, 0.2 ) * 0.86 );
	// livor and bruises: dusky purple-red blotches; decay: a sallow yellow-grey; an uneven, blotchy pallor overall
	zAsh = mix( zAsh, zAsh * vec3( 0.78, 0.58, 0.66 ), smoothstep( 0.48, 0.78, zN1 ) * ( 0.4 + uRot * 0.55 ) );
	zAsh = mix( zAsh, zAsh * vec3( 0.95, 0.85, 0.68 ), smoothstep( 0.58, 0.85, zN2 ) * uRot * 0.55 );
	zAsh *= 0.8 + zN3 * 0.4;
	// marbling: fine blue-grey veins under the skin of the throat, the temples and chest, the forearms
	// (these and the other fine marks only up close: uDetail is 0 on the far LOD, where they would not show)
	if ( uDetail > 0.5 ) {
		float zVz = smoothstep( 0.36, 0.08, length( zp - uMouth - vec3( 0.0, - 0.14, 0.0 ) ) ) + smoothstep( 0.36, 0.1, min( length( zp - uHandL ), length( zp - uHandR ) ) ) * 0.8;
		float zVein = 1.0 - abs( ( zn3( zp * vec3( 62.0, 115.0, 62.0 ) + uSeed ) * 0.7 + zn3( zp * 23.0 + uSeed * 1.7 ) * 0.3 ) * 2.0 - 1.0 );
		zAsh = mix( zAsh, zAsh * vec3( 0.55, 0.52, 0.64 ), smoothstep( 0.93, 0.985, zVein ) * min( 1.0, zVz ) * ( 0.25 + uRot * 0.3 ) );
		// sores: small raw, dark patches
		zAsh = mix( zAsh, vec3( 0.12, 0.045, 0.04 ) + zAsh * 0.2, smoothstep( 0.8, 0.87, zn3( zp * 34.0 + uSeed * 3.0 ) ) * uRot * 0.75 );
	}
	// sunken eyes: dark, bruised sockets; cracked dark lips
	// (bruised and hollow, not a painted mask: strongest in the inner corner under the brow)
	float zSock = smoothstep( 0.044, 0.014, min( length( zp - uEyeL ), length( zp - uEyeR ) ) );
	zAsh = mix( zAsh, zAsh * vec3( 0.52, 0.4, 0.44 ), zSock * ( 1.0 - zm.g ) * ( 0.75 + 0.25 * zN2 ) );
	float zLip = smoothstep( 0.03, 0.01, length( ( zp - uMouth ) * vec3( 0.75, 1.6, 0.9 ) ) );
	zAsh = mix( zAsh, vec3( 0.11, 0.05, 0.055 ) + zAsh * 0.15, zLip * 0.6 );
	// grime on the skin (the hands and feet most)
	float zSkinDirt = smoothstep( 0.5, 0.8, zfbm( zp * 5.0 + uSeed * 4.0 ) + ( 0.5 - zp.y ) * 0.2 ) * uDirt;
	zAsh = mix( zAsh, zAsh * vec3( 0.6, 0.55, 0.48 ), zSkinDirt * 0.8 );
	vec3 zCol = mix( zBase, zAsh, zSkin * uInfect );
	// ---- clothes: hue shift and tint on the body garments (not hair or gear), an optional aloha print on the shirt
	vec3 zCloth = mix( zBase, max( zHue( zBase, uHue ), 0.0 ) * uClothTint, zBodyCell );
	if ( zShirt > 0.01 ) {
		vec4 pr = texture2D( uPrint, vec2( vMapUv.x, vMapUv.y * uAtlasK ) * 2.6 );
		vec3 pc = mix( uPrintA, uPrintB, pr.r );
		pc = mix( pc, uPrintC, pr.g );
		pc = mix( pc, uPrintD, pr.b );
		// keep the garment's folds: its luminance against a blurred version of itself
		float zLumB = dot( texture2D( map, vMapUv, 4.0 ).rgb, vec3( 0.3, 0.59, 0.11 ) );
		float fold = mix( 1.0, clamp( zLum / max( zLumB, 0.03 ), 0.55, 1.3 ), 0.4 );
		zCloth = mix( zCloth, pc * fold, zShirt * zBodyCell );
	}
	// weeks in the tropics: faded, sun-bleached and filthy, caked towards the ground and at the knees
	zCloth = mix( zCloth, vec3( dot( zCloth, vec3( 0.33 ) ) ), 0.32 * uInfect );
	zCloth = mix( zCloth, zCloth * vec3( 0.86, 0.8, 0.68 ) + vec3( 0.02, 0.018, 0.012 ), 0.35 * uDirt * uInfect );
	float zGround = smoothstep( 0.75, 0.05, zp.y ) * 0.45 + smoothstep( 0.1, 0.02, abs( zp.y - 0.5 ) ) * 0.25;
	float zDirt = smoothstep( 0.45, 0.75, zfbm( zp * 3.6 + uSeed * 5.0 ) + zGround ) * uDirt;
	zCloth = mix( zCloth, zCloth * vec3( 0.5, 0.45, 0.38 ) + vec3( 0.014, 0.011, 0.007 ), zDirt );
	// mud flecks on the legs, sweat and grease marks: darker blotches
	if ( uDetail > 0.5 ) zCloth *= 1.0 - smoothstep( 0.72, 0.8, zn3( zp * 26.0 + uSeed * 7.0 ) ) * smoothstep( 0.6, 0.2, zp.y ) * 0.5 * uDirt;
	zCloth *= 1.0 - smoothstep( 0.6, 0.8, zN1 ) * 0.28 * uDirt;
	// rips: the fabric torn open on the grey skin under it, a dark frayed edge round the hole
	float zT = zn3( zp * vec3( 7.0, 2.6, 7.0 ) + uSeed * 1.3 ) * 0.75 + zn3( zp * 38.0 + uSeed ) * 0.25;
	float zTearK = uTear * zBodyCell * ( 1.0 - zSkin ) * step( 0.25, zp.y ) * step( zp.y, 1.45 ) * uInfect;
	float zHole = smoothstep( 0.8, 0.83, zT ) * zTearK;
	float zFray = smoothstep( 0.74, 0.8, zT ) * zTearK;
	// (the grey skin shows through the hole, grazed and bruised in places, shaded a little by the cloth)
	vec3 zUnder = uSkinTone * 0.3 * ( 0.8 + zN3 * 0.4 );
	zCloth = mix( zCloth, zCloth * 0.4, zFray * ( 1.0 - zHole ) );
	zCloth = mix( zCloth, mix( zUnder, zUnder * vec3( 0.62, 0.36, 0.38 ), smoothstep( 0.4, 0.8, zN2 ) ), zHole );
	zCol = mix( zCloth, zCol, zSkin );
	// ---- dead eyes: dull yellowed whites, the iris clouded over grey but still faintly there, no shine; some bloodshot
	float zEye = zm.g * ( 1.0 - zBodyCell ) * uInfect;
	if ( zEye > 0.001 ) {
		float irisK = smoothstep( 0.5, 0.2, zLum ); // the eye texture's darker iris and pupil
		vec3 eWhite = vec3( 0.46, 0.42, 0.33 ) * ( 0.55 + 0.45 * zLum );
		vec3 eCloud = mix( vec3( 0.27, 0.28, 0.28 ), vec3( zLum * 0.55 ), 0.4 );
		vec3 eCol = mix( eWhite, eCloud, irisK );
		eCol = mix( eCol, vec3( 0.3, 0.045, 0.035 ) * ( 0.6 + 0.4 * zLum ), uEyeRed * ( 1.0 - irisK * 0.6 ) * 0.85 );
		zCol = mix( zCol, eCol * 0.78, zEye );
	}
	// ---- blood: wet and red where fresh, soaked dark brown into cloth, flaking black-brown on skin
	float zFresh;
	float zB = zBlood( zp, zFresh ) * ( 0.3 + 0.7 * max( uInfect, zFresh ) );
	float zAge = clamp( zFresh * 0.85 + zn3( zp * 11.0 + 4.0 ) * 0.3, 0.0, 1.0 );
	// dried blood is nearly black-brown, fresh is deep red; soaked into cloth it keeps the weave (a filter over the fabric)
	vec3 zBloodSkin = mix( vec3( 0.045, 0.011, 0.008 ), vec3( 0.1, 0.008, 0.005 ), zAge );
	vec3 zBloodCloth = min( zCloth, vec3( 0.5 ) ) * mix( vec3( 0.13, 0.04, 0.032 ), vec3( 0.17, 0.022, 0.016 ), zAge ) + mix( vec3( 0.024, 0.007, 0.005 ), vec3( 0.034, 0.004, 0.003 ), zAge );
	// a darker tide line where a stain dried at its edge
	float zRim = smoothstep( 0.12, 0.35, zB ) * ( 1.0 - smoothstep( 0.45, 0.85, zB ) ) * ( 1.0 - zAge );
	zCol = mix( zCol, mix( zBloodCloth, zBloodSkin, zSkin ), smoothstep( 0.05, 0.75, zB ) );
	zCol *= 1.0 - zRim * 0.35;
	diffuseColor.rgb = zCol;
	// waxy skin, matte fabric, glossy fresh blood
	float zRough = mix( mix( 0.86, 0.58, zSkin * ( 0.4 + 0.6 * uInfect ) ), mix( 0.66, 0.34, zAge ), smoothstep( 0.05, 0.75, zB ) );
	zRough = mix( zRough, 0.7, zEye );
	zRough = mix( zRough, 0.25, uWetBody );
`;

// a tiling aloha print (R leaves, G flowers, B flower centres), drawn once on a canvas
let printTex = null;
function alohaPrint() {
	if ( printTex ) return printTex;
	const S = 512;
	const c = document.createElement( 'canvas' );
	c.width = c.height = S;
	const x = c.getContext( '2d' );
	x.fillStyle = '#000'; x.fillRect( 0, 0, S, S );
	x.globalCompositeOperation = 'lighter';
	let seed = 7;
	const r = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const wrap = ( fn ) => { for ( const ox of [ - S, 0, S ] ) for ( const oy of [ - S, 0, S ] ) fn( ox, oy ); };
	// monstera and palm leaves
	for ( let k = 0; k < 16; k ++ ) {
		const px = r() * S, py = r() * S, a = r() * Math.PI, L = S * ( 0.07 + r() * 0.07 );
		wrap( ( ox, oy ) => {
			x.save(); x.translate( px + ox, py + oy ); x.rotate( a );
			x.fillStyle = 'rgb(255,0,0)';
			x.beginPath(); x.ellipse( 0, 0, L, L * 0.42, 0, 0, Math.PI * 2 ); x.fill();
			// splits in the leaf and the midrib are left dark (the ground shows through)
			x.globalCompositeOperation = 'source-over';
			x.strokeStyle = '#000'; x.lineWidth = S / 300;
			x.beginPath(); x.moveTo( - L, 0 ); x.lineTo( L, 0 ); x.stroke();
			for ( let s = - 3; s <= 3; s ++ ) { if ( ! s ) continue; x.beginPath(); x.moveTo( s * L * 0.22, 0 ); x.lineTo( s * L * 0.3, Math.sign( s ) * L * 0.5 ); x.stroke(); x.beginPath(); x.moveTo( s * L * 0.22, 0 ); x.lineTo( s * L * 0.3, - Math.sign( s ) * L * 0.5 ); x.stroke(); }
			x.globalCompositeOperation = 'lighter';
			x.restore();
		} );
	}
	// hibiscus: five round petals, a centre and a stamen
	x.globalCompositeOperation = 'source-over';
	for ( let k = 0; k < 9; k ++ ) {
		const px = r() * S, py = r() * S, R = S * ( 0.045 + r() * 0.03 ), a0 = r() * 6.28;
		wrap( ( ox, oy ) => {
			x.fillStyle = 'rgb(0,255,0)';
			for ( let p = 0; p < 5; p ++ ) {
				const a = a0 + p / 5 * Math.PI * 2;
				x.beginPath(); x.ellipse( px + ox + Math.cos( a ) * R * 0.62, py + oy + Math.sin( a ) * R * 0.62, R * 0.58, R * 0.48, a, 0, Math.PI * 2 ); x.fill();
			}
			x.fillStyle = 'rgb(0,255,255)';
			x.beginPath(); x.arc( px + ox, py + oy, R * 0.24, 0, Math.PI * 2 ); x.fill();
			x.strokeStyle = 'rgb(0,255,255)'; x.lineWidth = S / 180;
			x.beginPath(); x.moveTo( px + ox, py + oy ); x.lineTo( px + ox + Math.cos( a0 + 0.6 ) * R, py + oy + Math.sin( a0 + 0.6 ) * R ); x.stroke();
		} );
	}
	// small plumeria
	for ( let k = 0; k < 14; k ++ ) {
		const px = r() * S, py = r() * S, R = S * ( 0.018 + r() * 0.01 ), a0 = r() * 6.28;
		wrap( ( ox, oy ) => {
			x.fillStyle = 'rgb(0,255,0)';
			for ( let p = 0; p < 5; p ++ ) {
				const a = a0 + p / 5 * Math.PI * 2;
				x.beginPath(); x.ellipse( px + ox + Math.cos( a ) * R * 0.7, py + oy + Math.sin( a ) * R * 0.7, R * 0.7, R * 0.4, a, 0, Math.PI * 2 ); x.fill();
			}
			x.fillStyle = 'rgb(0,255,255)';
			x.beginPath(); x.arc( px + ox, py + oy, R * 0.25, 0, Math.PI * 2 ); x.fill();
		} );
	}
	printTex = new THREE.CanvasTexture( c );
	printTex.wrapS = printTex.wrapT = THREE.RepeatWrapping;
	printTex.colorSpace = THREE.NoColorSpace;
	printTex.anisotropy = 4;
	return printTex;
}

function makeUniforms() {
	const w = [];
	for ( let i = 0; i < MAX_WOUNDS; i ++ ) w.push( new THREE.Vector4( 0, 0, 0, 0 ) );
	return {
		uMask: { value: null }, uPrint: { value: null }, uAtlasK: { value: 1.5 },
		uInfect: { value: 1 }, uRot: { value: 0.6 }, uHue: { value: 0 }, uDirt: { value: 0.5 }, uBlood: { value: 0.3 }, uSeed: { value: 0 },
		uWetBody: { value: 0 }, uHandBlood: { value: 0.6 }, uMouthBlood: { value: 1 }, uAloha: { value: 0 },
		uSkinTone: { value: new THREE.Color( 0.72, 0.76, 0.66 ) }, uClothTint: { value: new THREE.Color( 1, 1, 1 ) },
		uPrintA: { value: new THREE.Color() }, uPrintB: { value: new THREE.Color() }, uPrintC: { value: new THREE.Color() }, uPrintD: { value: new THREE.Color() },
		uMouth: { value: new THREE.Vector3() }, uHandL: { value: new THREE.Vector3() }, uHandR: { value: new THREE.Vector3() },
		uEyeL: { value: new THREE.Vector3( 0, - 9, 0 ) }, uEyeR: { value: new THREE.Vector3( 0, - 9, 0 ) },
		uFwd: { value: new THREE.Vector3( 0, 0, 1 ) }, uWounds: { value: w }, uBite: { value: new THREE.Vector4( 0, 0, 0, 0 ) },
		uTear: { value: 0 }, uEyeRed: { value: 0 }, uDetail: { value: 1 },
	};
}

function characterMaterial( tex, cards, u ) {
	const m = new THREE.MeshStandardMaterial( {
		map: tex.c, normalMap: tex.n, normalScale: new THREE.Vector2( 0.9, - 0.9 ), roughness: 1, metalness: 0,
		side: cards ? THREE.DoubleSide : THREE.FrontSide, alphaTest: cards ? 0.45 : 0,
	} );
	if ( cards ) m.defines = { ZCARDS: '' };
	m.userData.u = u;
	patchMaterial( m, cards ? 'zchar-cards' : 'zchar', ( shader ) => {
		Object.assign( shader.uniforms, u );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + VERT_PARS )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvBind = transformed;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FRAG_PARS + BLOOD_FN )
			.replace( '#include <map_fragment>', '#include <map_fragment>\n' + FRAG_MAP )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = zRough;' );
	} );
	return m;
}

function findMeshes( root ) {
	const bones = {};
	let avatar = null;
	const meshes = { skin: null, cards: null, lod: null };
	root.traverse( o => {
		if ( o.isBone ) bones[ o.name ] = o;
		if ( o.name === 'Avatar' ) avatar = o;
		if ( o.isSkinnedMesh ) {
			if ( o.name.startsWith( 'lod1' ) || o.parent?.name?.startsWith( 'lod1' ) ) meshes.lod = o;
			else if ( o.material?.name === 'cards' ) meshes.cards = o;
			else meshes.skin = o;
		}
	} );
	return { bones, avatar, meshes };
}

// ---- library -------------------------------------------------------------------------------------------------

function freeTemplate( t ) {
	t.scene.traverse( o => { if ( o.isMesh ) { o.geometry.dispose(); o.material?.dispose?.(); } } );
	for ( const k in t.tex ) t.tex[ k ].dispose();
}

export class CharacterLib {
	// opts.base: URL prefix of public/models/characters/ (the game runs from the site root)
	constructor( game, opts = {} ) {
		this.game = game;
		this.dir = opts.base || 'models/characters/';
		this.loader = new GLTFLoader();
		this.texLoader = new THREE.TextureLoader();
		this.templates = new Map(); // id -> template | Promise
		this.pools = new Map(); // id -> [ free instances ]
		this.live = new Map(); // id -> instances in use
		this.lastUse = new Map();
		this.bank = null;
		this.failed = new Set();
		this.ready = this.init();
	}

	async init() {
		try { this.bank = await ClipBank.load( this.dir + 'anims.bin' ); } catch ( e ) { console.error( 'creature clips', e ); }
		return this.bank;
	}

	// the template if loaded; otherwise start loading it and return null
	get( id ) {
		const t = this.templates.get( id );
		if ( t && ! t.then ) return t;
		if ( ! t && ! this.failed.has( id ) && this.bank ) this.load( id );
		return null;
	}

	isLoaded( id ) { const t = this.templates.get( id ); return !! t && ! t.then; }
	loadedIds() { const out = []; for ( const [ id, t ] of this.templates ) if ( ! t.then ) out.push( id ); return out; }
	get loading() { let n = 0; for ( const t of this.templates.values() ) if ( t.then ) n ++; return n; }

	load( id ) {
		if ( this.templates.has( id ) ) return this.templates.get( id );
		const p = this._load( id ).then( t => {
			if ( this.disposed ) { freeTemplate( t ); return null; } // arrived after the game was left
			this.templates.set( id, t ); this.lastUse.set( id, performance.now() ); return t;
		} ).catch( e => {
			console.warn( 'character', id, e.message ); this.failed.add( id ); this.templates.delete( id ); return null;
		} );
		this.templates.set( id, p );
		return p;
	}

	_tex( file, srgb ) {
		return new Promise( ( resolve, reject ) => {
			this.texLoader.load( this.dir + file, t => {
				t.flipY = false; // glTF uv convention
				t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
				t.anisotropy = 4;
				resolve( t );
			}, undefined, () => reject( new Error( 'texture ' + file ) ) );
		} );
	}

	async _load( id ) {
		if ( ! this.bank ) await this.ready;
		if ( ! this.bank ) throw new Error( 'no clip bank' );
		const [ gltf, c, n, m ] = await Promise.all( [
			this.loader.loadAsync( this.dir + id + '.glb' ), this._tex( id + '_c.jpg', true ), this._tex( id + '_n.jpg', false ), this._tex( id + '_m.png', false ),
		] );
		const scene = gltf.scene;
		const { bones, avatar, meshes } = findMeshes( scene );
		if ( ! avatar || ! meshes.skin ) throw new Error( 'unexpected avatar layout' );
		const info = new RigInfo( this.bank, bones, avatar );
		// landmarks for the shader in the space of the vertex attributes (what vBind sees): the template scene's
		// bind pose, metres, feet at y = 0 (the exporter baked the armature node's centimetre scale, turn and hip
		// lift into the inverse bind matrices). toMesh takes armature-local points (centimetres) there.
		scene.updateMatrixWorld( true );
		const toMesh = avatar.matrixWorld.clone();
		const bp = ( name ) => {
			const b = bones[ name ];
			return b ? new THREE.Vector3().setFromMatrixPosition( b.matrixWorld ) : null;
		};
		const fwdMesh = info.fwd.clone().transformDirection( toMesh ).setY( 0 ).normalize();
		const lip = bp( 'Bip01_MUpperLip' ), lip2 = bp( 'Bip01_MBottomLip' );
		const mouth = lip && lip2 ? lip.clone().add( lip2 ).multiplyScalar( 0.5 ) : bp( BONE.head ).add( new THREE.Vector3( 0, 0.05, 0 ) );
		const handL = bp( 'Bip01_L_Finger2' ) || bp( BONE.lHand ), handR = bp( 'Bip01_R_Finger2' ) || bp( BONE.rHand );
		const headTop = bp( BONE.head ).y + 0.24;
		const nose = bp( BONE.head ).add( fwdMesh.clone().multiplyScalar( 0.09 ) ).add( new THREE.Vector3( 0, 0.06, 0 ) );
		const eyeL = bp( 'Bip01_LEye' ) || nose, eyeR = bp( 'Bip01_REye' ) || nose;
		// where the bite that turned them can be: the throat and shoulders, a forearm, a hand, a calf
		const mid = ( a, b, k = 0.5 ) => { const A = bp( BONE[ a ] ), B = bp( BONE[ b ] ); return A && B ? A.lerp( B, k ) : null; };
		const bites = [ mid( 'neck', 'lUpper', 0.6 ), mid( 'neck', 'rUpper', 0.6 ), mid( 'lFore', 'lHand', 0.45 ), mid( 'rFore', 'rHand', 0.45 ),
			mid( 'lUpper', 'lFore', 0.5 ), mid( 'rUpper', 'rFore', 0.5 ), mid( 'lCalf', 'lFoot', 0.4 ), mid( 'rCalf', 'rFoot', 0.4 ), mid( 'spine1', 'spine2', 0.5 ) ].filter( Boolean );
		// ... moved out onto the skin on the front: the vertex nearest a point ahead of the bone
		{
			const pa = meshes.skin.geometry.attributes.position, q = new THREE.Vector3();
			for ( const b of bites ) {
				q.copy( b ).addScaledVector( fwdMesh, 0.25 );
				let bd = Infinity, bi = 0;
				for ( let i = 0; i < pa.count; i += 2 ) {
					const d = ( pa.getX( i ) - q.x ) ** 2 + ( pa.getY( i ) - q.y ) ** 2 + ( pa.getZ( i ) - q.z ) ** 2;
					if ( d < bd ) { bd = d; bi = i; }
				}
				b.set( pa.getX( bi ), pa.getY( bi ), pa.getZ( bi ) );
			}
		}
		// the model group turns the character to face -z (the game's yaw 0)
		scene.updateMatrixWorld( true );
		const fwdScene = info.fwd.clone().applyQuaternion( avatar.quaternion ).setY( 0 ).normalize();
		const face = new THREE.Quaternion().setFromUnitVectors( fwdScene, new THREE.Vector3( 0, 0, - 1 ) );
		// one skeleton per instance serves every mesh when their bind matrices agree
		const sk = meshes.skin.skeleton;
		const same = ( o ) => o && o.skeleton.bones.length === sk.bones.length && o.skeleton.bones.every( ( b, i ) => b === sk.bones[ i ] )
			&& o.skeleton.boneInverses.every( ( m4, i ) => m4.equals( sk.boneInverses[ i ] ) );
		const share = { cards: same( meshes.cards ), lod: same( meshes.lod ) };
		const tex = { c, n, m };
		return {
			id, scene, info, avatar, tex, face, meshes, share, hip: info.hip, height: headTop, sex: AVATARS[ id ]?.sex || 'm',
			landmarks: { mouth, handL, handR, eyeL, eyeR, bites, fwd: fwdMesh }, toMesh,
			pelvisScale: info.hip / 0.8952, atlasK: ( c.image?.height || 1536 ) / 1024, shirt: !! AVATARS[ id ]?.shirt,
		};
	}

	// a posable instance of a loaded template (from the pool when one is free)
	acquire( t ) {
		this.lastUse.set( t.id, performance.now() );
		let inst = this.pools.get( t.id )?.pop();
		if ( ! inst ) inst = this.create( t );
		let live = this.live.get( t.id );
		if ( ! live ) this.live.set( t.id, live = new Set() );
		live.add( inst );
		return inst;
	}

	release( inst ) {
		const id = inst.t.id;
		this.live.get( id )?.delete( inst );
		this.lastUse.set( id, performance.now() );
		inst.reset();
		let pool = this.pools.get( id );
		if ( ! pool ) this.pools.set( id, pool = [] );
		if ( pool.length < 6 ) pool.push( inst ); else inst.dispose();
	}

	inUse( id ) { return this.live.get( id )?.size || 0; }

	// drop a template nobody uses: its atlases and geometry leave the GPU
	unload( id ) {
		const t = this.templates.get( id );
		if ( ! t || t.then || this.inUse( id ) ) return false;
		for ( const inst of this.pools.get( id ) || [] ) inst.dispose();
		this.pools.delete( id );
		freeTemplate( t );
		this.templates.delete( id );
		return true;
	}

	// everything off the GPU (leaving the game): live and pooled instances, templates, the shared print
	dispose() {
		this.disposed = true;
		for ( const set of this.live.values() ) for ( const inst of set ) inst.dispose();
		this.live.clear();
		for ( const id of this.loadedIds() ) this.unload( id );
		this.templates.clear();
		printTex?.dispose();
		printTex = null;
	}

	// unload the least recently used idle templates above `keep`
	trim( keep ) {
		const idle = this.loadedIds().filter( id => ! this.inUse( id ) ).sort( ( a, b ) => ( this.lastUse.get( a ) || 0 ) - ( this.lastUse.get( b ) || 0 ) );
		let n = this.loadedIds().length;
		for ( const id of idle ) { if ( n <= keep ) break; if ( this.unload( id ) ) n --; }
	}

	create( t ) {
		const root = new THREE.Group();
		const model = SkeletonUtils.clone( t.scene );
		model.quaternion.copy( t.face );
		root.add( model );
		const { bones, avatar, meshes } = findMeshes( model );
		for ( const k in meshes ) {
			const o = meshes[ k ];
			if ( ! o ) continue;
			// a generous fixed bound (mesh space is cm) instead of skinning every vertex to compute one;
			// big enough for a ragdoll sprawled a couple of metres from its root
			o.boundingSphere = new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 260 );
			o.frustumCulled = true;
			if ( k !== 'skin' && t.share[ k ] ) o.skeleton = meshes.skin.skeleton;
		}
		const u = makeUniforms();
		u.uMask.value = t.tex.m;
		u.uPrint.value = alohaPrint();
		u.uAtlasK.value = t.atlasK;
		u.uMouth.value.copy( t.landmarks.mouth );
		u.uHandL.value.copy( t.landmarks.handL );
		u.uHandR.value.copy( t.landmarks.handR );
		u.uEyeL.value.copy( t.landmarks.eyeL );
		u.uEyeR.value.copy( t.landmarks.eyeR );
		u.uFwd.value.copy( t.landmarks.fwd );
		const mat = characterMaterial( t.tex, false, u );
		const cardMat = meshes.cards ? characterMaterial( t.tex, true, u ) : null;
		for ( const k in meshes ) {
			const o = meshes[ k ];
			if ( ! o ) continue;
			o.material = k === 'cards' ? cardMat : mat;
			o.castShadow = k !== 'cards';
			o.receiveShadow = true;
		}
		if ( meshes.lod ) meshes.lod.visible = false;
		// matrices are updated by hand: the rig refreshes the bones it moves, the entity the root, and the
		// scene traversal only recomputes world matrices below nodes that changed
		model.traverse( o => { o.updateMatrix(); o.matrixAutoUpdate = false; } );
		root.matrixAutoUpdate = false;
		const rig = new Rig( this.bank, t.info, bones );
		rig.pelvisScale = t.pelvisScale;
		return new CharacterInstance( t, root, model, meshes, rig, u, [ mat, cardMat ].filter( Boolean ), avatar, bones );
	}
}

// ---- instance -------------------------------------------------------------------------------------------------------

const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _v3b = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CharacterInstance {
	constructor( t, root, model, meshes, rig, u, mats, avatar, bones ) {
		this.t = t; this.root = root; this.model = model; this.meshes = meshes; this.rig = rig; this.u = u; this.mats = mats;
		this.avatar = avatar;
		this.boneMap = bones;
		this.lod = 0;
		this.shadow = true;
		this.nextWound = 0;
		this.scale = 1;
		this.build = 1;
	}

	// root transform: feet position, yaw, uniform scale, and an optional extra rotation (crawling, lying)
	place( pos, yaw, tilt = null ) {
		const r = this.root;
		r.position.copy( pos );
		if ( tilt ) r.quaternion.setFromAxisAngle( _v3.set( 0, 1, 0 ), yaw ).multiply( tilt );
		else r.quaternion.setFromAxisAngle( _v3.set( 0, 1, 0 ), yaw );
		// height by the uniform scale; build (slight to stocky) widens and deepens the body only
		r.scale.set( this.scale * this.build, this.scale, this.scale * this.build );
		r.updateMatrix();
	}

	// the living-dead look. o: { infect, rot, hue, tint (Color), dirt, blood, seed, skin (Color), aloha (palette | null),
	// mouthBlood, handBlood, wet, tear (0..1 torn clothes), eyeRed (0..1), bite (index into the template's bite spots, -1 none) }
	setLook( o ) {
		const u = this.u;
		u.uTear.value = o.tear ?? 0;
		u.uEyeRed.value = o.eyeRed ?? 0;
		const bites = this.t.landmarks.bites;
		if ( o.bite >= 0 && bites.length ) {
			const b = bites[ o.bite % bites.length ];
			u.uBite.value.set( b.x, b.y, b.z, 0.05 + ( ( o.seed || 0 ) % 1 ) * 0.03 );
		} else u.uBite.value.set( 0, 0, 0, 0 );
		u.uInfect.value = o.infect ?? 1;
		u.uRot.value = o.rot ?? 0.6;
		u.uHue.value = o.hue ?? 0;
		u.uDirt.value = o.dirt ?? 0.5;
		u.uBlood.value = o.blood ?? 0.3;
		u.uSeed.value = o.seed ?? Math.random() * 100;
		u.uMouthBlood.value = o.mouthBlood ?? 1;
		u.uHandBlood.value = o.handBlood ?? 0.6;
		u.uWetBody.value = o.wet ?? 0;
		u.uClothTint.value.copy( o.tint || _white );
		if ( o.skin ) u.uSkinTone.value.copy( o.skin );
		const pal = this.t.shirt ? o.aloha : null;
		u.uAloha.value = pal ? 1 : 0;
		if ( pal ) { u.uPrintA.value.setHex( pal[ 0 ] ); u.uPrintB.value.setHex( pal[ 1 ] ); u.uPrintC.value.setHex( pal[ 2 ] ); u.uPrintD.value.setHex( pal[ 3 ] ); }
	}

	// 0 full mesh + cards, 1 decimated, 2 hidden
	setLOD( l, shadow = true ) {
		const m = this.meshes;
		if ( l !== this.lod ) {
			this.lod = l;
			this.u.uDetail.value = l === 0 ? 1 : 0;
			m.skin.visible = l === 0 || ! m.lod;
			if ( m.cards ) m.cards.visible = l === 0;
			if ( m.lod ) m.lod.visible = l === 1;
			this.root.visible = l < 2;
		}
		if ( shadow !== this.shadow ) {
			this.shadow = shadow;
			m.skin.castShadow = shadow;
			if ( m.lod ) m.lod.castShadow = shadow;
		}
	}

	bone( k ) { return this.rig.bones[ this.rig.info.idx[ k ] ]; }

	// world position of a rig bone (valid after the scene's matrix update or updateWorld())
	bonePos( k, out ) { return out.setFromMatrixPosition( this.bone( k ).matrixWorld ); }

	// refresh the world matrices now (hit tests and the ragdoll need them the same frame)
	updateWorld() { this.root.updateMatrixWorld( true ); }

	// a bullet / blade wound at a world point: stored in bind space next to the closest bone
	addWound( point, size = 0.035 ) {
		const rig = this.rig, info = rig.info;
		let best = - 1, bd = Infinity;
		for ( let i = 0; i < rig.bones.length; i ++ ) {
			const d = _v3.setFromMatrixPosition( rig.bones[ i ].matrixWorld ).distanceToSquared( point );
			if ( d < bd ) { bd = d; best = i; }
		}
		if ( best < 0 ) return;
		// point -> bone local -> bind (character) space: bind world matrix of the bone = T(bindPos) R(bindW)
		const b = rig.bones[ best ];
		_m4.copy( b.matrixWorld ).invert();
		const local = _v3.copy( point ).applyMatrix4( _m4 ); // bone-local (cm: the avatar and root scales are in the chain)
		_q.set( info.bindW[ best * 4 ], info.bindW[ best * 4 + 1 ], info.bindW[ best * 4 + 2 ], info.bindW[ best * 4 + 3 ] );
		local.applyQuaternion( _q ).add( _v3b.set( info.bindPos[ best * 3 ], info.bindPos[ best * 3 + 1 ], info.bindPos[ best * 3 + 2 ] ) );
		local.applyMatrix4( this.t.toMesh );
		const w = this.u.uWounds.value[ this.nextWound ++ % MAX_WOUNDS ];
		w.set( local.x, local.y, local.z, size );
	}

	// back to a clean state for the pool
	reset() {
		this.build = 1;
		for ( const w of this.u.uWounds.value ) w.set( 0, 0, 0, 0 );
		this.nextWound = 0;
		this.rig.clearOverlays();
		this.root.removeFromParent();
		this.root.visible = true;
		this.setLOD( 0, true );
	}

	dispose() {
		for ( const m of this.mats ) m.dispose();
		this.root.removeFromParent();
		// skeletons own bone textures
		const seen = new Set();
		for ( const k in this.meshes ) { const s = this.meshes[ k ]?.skeleton; if ( s && ! seen.has( s ) ) { seen.add( s ); s.dispose(); } }
	}
}
const _white = new THREE.Color( 1, 1, 1 );
