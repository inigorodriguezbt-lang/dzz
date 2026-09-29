// Human characters for the infected and the survivors: Microsoft Rocketbox avatars (MIT, see
// public/models/characters/LICENSE-Rocketbox.md) converted by src/ai/tools/rb_build.py into one GLB
// (skinned mesh + alpha-tested cards + a decimated LOD, the 80-bone Bip01 skeleton) and three atlas
// images per avatar: colour, normal and a mask (R skin, G eyes, B card alpha / 1 - garment in the body cell).
//
// The infected look is a shader over the living texture: grey-green mottled skin with veins and rot,
// milky eyes, dirt and grime on the clothes (hue / tint varied per instance), an optional aloha print on
// the shirt, blood around the mouth, down the chin and chest, on the hands, and bullet wounds added where
// the body is hit — all in the avatar's bind-pose space, so it stays glued to the body while it animates.
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
	uniform float uBindScale;
	uniform float uHip;
`;
const FRAG_PARS = /* glsl */`
	varying vec3 vBind;
	uniform sampler2D uMask, uPrint;
	uniform float uInfect, uRot, uHue, uDirt, uBlood, uSeed, uWetBody, uHandBlood, uMouthBlood, uAloha, uAtlasK;
	uniform vec3 uSkinTone, uClothTint, uMouth, uHandL, uHandR, uFwd, uPrintA, uPrintB, uPrintC, uPrintD;
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
// blood amount at the bind-space point: mouth and chin run-off, hands, wounds, random splatter
const BLOOD_FN = /* glsl */`
	float zBlood( vec3 p, float skin ) {
		float b = 0.0;
		// mouth: a smear around the lips and a run-off down the chin, neck and chest front
		vec3 d = p - uMouth;
		float fwdD = dot( d, uFwd );
		vec3 side = d - uFwd * fwdD; side.y = 0.0;
		float lat = length( side );
		float below = - d.y;
		float smear = smoothstep( 0.05, 0.018, length( vec3( lat, d.y * 1.3, fwdD * 0.6 ) ) );
		float streak = zn3( vec3( lat * 70.0 + uSeed * 13.0, p.y * 2.5, uSeed ) );
		float run = step( 0.0, below ) * smoothstep( 0.5, 0.05, below ) * smoothstep( 0.05 + below * 0.28, 0.0, lat ) * smoothstep( - 0.07, 0.0, fwdD + below * 0.05 );
		run *= smoothstep( 0.35, 0.75, streak + ( 0.4 - below ) * 0.6 );
		b += ( smear + run ) * uMouthBlood;
		// hands and forearms
		float hl = length( p - uHandL ), hr = length( p - uHandR );
		float hn = zn3( p * 30.0 + uSeed );
		b += smoothstep( 0.22, 0.05, min( hl, hr ) ) * smoothstep( 0.35, 0.6, hn + 0.25 ) * uHandBlood;
		// wounds: dark holes with a run below
		for ( int i = 0; i < ${MAX_WOUNDS}; i ++ ) {
			vec4 w = uWounds[ i ];
			if ( w.w <= 0.0 ) continue;
			vec3 q = p - w.xyz;
			float hole = smoothstep( w.w, w.w * 0.2, length( q ) );
			float drip = step( q.y, 0.0 ) * smoothstep( w.w * 0.7, 0.0, length( q.xz ) ) * smoothstep( - 0.3, 0.0, q.y ) * step( 0.45, zn3( vec3( q.x * 90.0, q.y * 6.0, q.z * 90.0 + float( i ) ) ) );
			b += hole + drip * 0.8;
		}
		// random splatter over everything, more with uBlood
		float sp = zfbm( p * 7.0 + uSeed * 3.1 );
		b += smoothstep( 1.0 - uBlood * 0.45, 1.02 - uBlood * 0.45, sp ) * 0.9;
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
	float zSkin = zm.r;
	// the body texture fills the top 1024 rows of the atlas; head, hair and gear sit below
	float zBodyCell = step( vMapUv.y * uAtlasK, 1.0 );
	vec3 zBase = diffuseColor.rgb;
	float zLum = dot( zBase, vec3( 0.3, 0.59, 0.11 ) );
	// infected skin: bloodless grey-green, mottled with rot and bruising, dark veins
	float zN1 = zfbm( vBind * 7.0 + uSeed ), zN2 = zn3( vBind * 23.0 + uSeed * 2.0 );
	vec3 zPale = uSkinTone * ( 0.1 + zLum * 1.35 );
	zPale = mix( zPale, zPale * vec3( 0.72, 0.6, 0.66 ), smoothstep( 0.52, 0.78, zN1 ) * uRot );          // bruises
	zPale = mix( zPale, zPale * vec3( 0.78, 0.86, 0.62 ), smoothstep( 0.6, 0.9, zN2 ) * uRot * 0.8 );      // rot
	float zVein = 1.0 - abs( zn3( vBind * vec3( 26.0, 55.0, 26.0 ) + uSeed ) * 2.0 - 1.0 );
	zPale = mix( zPale, vec3( 0.2, 0.2, 0.28 ) * ( 0.3 + zLum ), smoothstep( 0.9, 0.985, zVein ) * 0.55 );
	// sunken, dark eye sockets and lips (darker parts of the face get darker)
	zPale *= mix( 1.0, smoothstep( 0.05, 0.5, zLum ) * 0.9 + 0.1, 0.5 );
	vec3 zCol = mix( zBase, zPale, zSkin * uInfect );
	// clothes: hue shift and tint on the body garments (not hair or gear), an aloha print on the shirt,
	// faded, grimy (more towards the feet)
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
	zCloth = mix( zCloth, vec3( dot( zCloth, vec3( 0.33 ) ) ), 0.25 * uInfect );
	float zDirt = smoothstep( 0.35, 0.85, zfbm( vBind * 4.0 + uSeed * 5.0 ) + ( 0.9 - vBind.y ) * 0.25 ) * uDirt;
	zCloth = mix( zCloth, zCloth * vec3( 0.5, 0.44, 0.36 ) + vec3( 0.02, 0.016, 0.01 ), zDirt );
	zCol = mix( zCloth, zCol, zSkin );
	// milky eyes
	zCol = mix( zCol, vec3( 0.62, 0.64, 0.58 ) + zN2 * 0.08, zm.g * ( 1.0 - zBodyCell ) * uInfect );
	// blood
	float zB = zBlood( vBind, zSkin );
	float zFresh = zn3( vBind * 11.0 + 4.0 );
	vec3 zBloodCol = mix( vec3( 0.075, 0.012, 0.01 ), vec3( 0.2, 0.012, 0.01 ), zFresh );
	zCol = mix( zCol, zBloodCol, zB );
	diffuseColor.rgb = zCol;
	float zRough = mix( mix( 0.86, 0.5, zSkin * ( 0.5 + 0.5 * uInfect ) ), 0.28, zB * zFresh );
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
		uMask: { value: null }, uPrint: { value: null }, uBindScale: { value: 0.01 }, uHip: { value: 0.9 }, uAtlasK: { value: 1.5 },
		uInfect: { value: 1 }, uRot: { value: 0.6 }, uHue: { value: 0 }, uDirt: { value: 0.5 }, uBlood: { value: 0.3 }, uSeed: { value: 0 },
		uWetBody: { value: 0 }, uHandBlood: { value: 0.6 }, uMouthBlood: { value: 1 }, uAloha: { value: 0 },
		uSkinTone: { value: new THREE.Color( 0.72, 0.76, 0.66 ) }, uClothTint: { value: new THREE.Color( 1, 1, 1 ) },
		uPrintA: { value: new THREE.Color() }, uPrintB: { value: new THREE.Color() }, uPrintC: { value: new THREE.Color() }, uPrintD: { value: new THREE.Color() },
		uMouth: { value: new THREE.Vector3() }, uHandL: { value: new THREE.Vector3() }, uHandR: { value: new THREE.Vector3() },
		uFwd: { value: new THREE.Vector3( 0, 0, 1 ) }, uWounds: { value: w },
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
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvBind = transformed * uBindScale + vec3( 0.0, uHip, 0.0 );' );
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
		const p = this._load( id ).then( t => { this.templates.set( id, t ); this.lastUse.set( id, performance.now() ); return t; } ).catch( e => {
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
		// bind-space landmarks for the shader (metres above the feet, character frame)
		const toChar = new THREE.Matrix4().copy( avatar.matrixWorld ).invert();
		const bp = ( name ) => {
			const b = bones[ name ];
			if ( ! b ) return null;
			const v = new THREE.Vector3().setFromMatrixPosition( b.matrixWorld ).applyMatrix4( toChar );
			return v.multiplyScalar( avatar.scale.x ).add( new THREE.Vector3( 0, info.hip, 0 ) );
		};
		const lip = bp( 'Bip01_MUpperLip' ), lip2 = bp( 'Bip01_MBottomLip' );
		const mouth = lip && lip2 ? lip.clone().add( lip2 ).multiplyScalar( 0.5 ) : bp( BONE.head ).add( new THREE.Vector3( 0, 0.05, 0 ) );
		const handL = bp( 'Bip01_L_Finger2' ) || bp( BONE.lHand ), handR = bp( 'Bip01_R_Finger2' ) || bp( BONE.rHand );
		const headTop = bp( BONE.head ).y + 0.24;
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
			landmarks: { mouth, handL, handR, fwd: info.fwd.clone() },
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
		t.scene.traverse( o => { if ( o.isMesh ) o.geometry.dispose(); } );
		for ( const k in t.tex ) t.tex[ k ].dispose();
		this.templates.delete( id );
		return true;
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
		u.uHip.value = t.hip;
		u.uAtlasK.value = t.atlasK;
		u.uBindScale.value = t.avatar.scale.x;
		u.uMouth.value.copy( t.landmarks.mouth );
		u.uHandL.value.copy( t.landmarks.handL );
		u.uHandR.value.copy( t.landmarks.handR );
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
	}

	// root transform: feet position, yaw, uniform scale, and an optional extra rotation (crawling, lying)
	place( pos, yaw, tilt = null ) {
		const r = this.root;
		r.position.copy( pos );
		if ( tilt ) r.quaternion.setFromAxisAngle( _v3.set( 0, 1, 0 ), yaw ).multiply( tilt );
		else r.quaternion.setFromAxisAngle( _v3.set( 0, 1, 0 ), yaw );
		r.scale.setScalar( this.scale );
		r.updateMatrix();
	}

	// the living-dead look. o: { infect, rot, hue, tint (Color), dirt, blood, seed, skin (Color), aloha (palette | null),
	// mouthBlood, handBlood, wet }
	setLook( o ) {
		const u = this.u;
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
		local.multiplyScalar( this.t.avatar.scale.x ).y += this.t.hip;
		const w = this.u.uWounds.value[ this.nextWound ++ % MAX_WOUNDS ];
		w.set( local.x, local.y, local.z, size );
	}

	// back to a clean state for the pool
	reset() {
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
