// Human characters for the infected and the survivors: Microsoft Rocketbox avatars (MIT, see
// public/models/characters/LICENSE-Rocketbox.md) converted by src/ai/tools/rb_build.py into one GLB
// (skinned mesh + alpha-tested cards + a decimated LOD, the 80-bone Bip01 skeleton) and three atlas
// images per avatar: colour, normal and a mask (R skin, G eyes, B card alpha).
//
// The infected look is a shader over the living texture: grey-green mottled skin with veins and rot,
// milky eyes, dirt and grime on the clothes (hue / tint varied per instance), blood around the mouth,
// down the chin and chest, on the hands, and bullet wounds added where the body is hit — all in the
// avatar's bind-pose space, so it stays glued to the body while it animates.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { patchMaterial } from '../render/Materials.js';
import { ClipBank, RigInfo, Rig, BONE } from './Anim.js';

const DIR = 'models/characters/';
export const MAX_WOUNDS = 6;

// avatar id -> sex, what it can be (the spawner picks by these roles), clothing hue freedom
export const AVATARS = {
	m_casual1: { sex: 'm', roles: [ 'civilian', 'tourist' ], hue: 0.5 },
	m_tourist1: { sex: 'm', roles: [ 'tourist' ], hue: 0.3 },
	m_casual2: { sex: 'm', roles: [ 'civilian' ], hue: 0.5 },
	m_casual3: { sex: 'm', roles: [ 'civilian', 'bandit' ], hue: 0.4 },
	m_casual4: { sex: 'm', roles: [ 'civilian', 'bandit' ], hue: 0.4 },
	m_tourist2: { sex: 'm', roles: [ 'tourist' ], hue: 0.3 },
	m_worker: { sex: 'm', roles: [ 'civilian', 'brute', 'bandit' ], hue: 0.3 },
	m_overalls: { sex: 'm', roles: [ 'civilian', 'brute' ], hue: 0.2 },
	m_flannel: { sex: 'm', roles: [ 'civilian', 'bandit', 'brute' ], hue: 0.3 },
	m_swim: { sex: 'm', roles: [ 'tourist' ], hue: 0.5 },
	m_office: { sex: 'm', roles: [ 'civilian' ], hue: 0.15 },
	m_sport: { sex: 'm', roles: [ 'runner', 'tourist' ], hue: 0.5 },
	f_casual1: { sex: 'f', roles: [ 'civilian', 'runner' ], hue: 0.5 },
	f_casual2: { sex: 'f', roles: [ 'civilian', 'tourist' ], hue: 0.5 },
	f_casual3: { sex: 'f', roles: [ 'civilian' ], hue: 0.5 },
	f_party: { sex: 'f', roles: [ 'tourist' ], hue: 0.5 },
	f_sport: { sex: 'f', roles: [ 'runner' ], hue: 0.4 },
	m_police1: { sex: 'm', roles: [ 'police' ], hue: 0.02 },
	m_police2: { sex: 'm', roles: [ 'police' ], hue: 0.02 },
	m_army1: { sex: 'm', roles: [ 'military', 'bandit_mil' ], hue: 0.0 },
	m_army2: { sex: 'm', roles: [ 'military', 'bandit_mil' ], hue: 0.0 },
	f_army: { sex: 'f', roles: [ 'military' ], hue: 0.0 },
	m_medic: { sex: 'm', roles: [ 'medic' ], hue: 0.03 },
	f_nurse: { sex: 'f', roles: [ 'medic' ], hue: 0.03 },
	m_surgeon: { sex: 'm', roles: [ 'medic' ], hue: 0.05 },
	m_fire: { sex: 'm', roles: [ 'firefighter' ], hue: 0.02 },
	m_pilot: { sex: 'm', roles: [ 'pilot', 'civilian' ], hue: 0.02 },
	m_security: { sex: 'm', roles: [ 'bandit', 'police' ], hue: 0.05 },
};

// ---- the character shader --------------------------------------------------------------------------------

const VERT_PARS = /* glsl */`
	varying vec3 vBind;
	uniform float uBindScale;
	uniform float uHip;
`;
const FRAG_PARS = /* glsl */`
	varying vec3 vBind;
	uniform sampler2D uMask;
	uniform float uInfect, uRot, uHue, uDirt, uBlood, uSeed, uWetBody, uHandBlood, uMouthBlood;
	uniform vec3 uSkinTone, uClothTint, uMouth, uHandL, uHandR, uFwd;
	uniform vec4 uWounds[ ${MAX_WOUNDS} ];
	float zh3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
	float zn3( vec3 x ) {
		vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( mix( zh3( i ), zh3( i + vec3( 1, 0, 0 ) ), f.x ), mix( zh3( i + vec3( 0, 1, 0 ) ), zh3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
			mix( mix( zh3( i + vec3( 0, 0, 1 ) ), zh3( i + vec3( 1, 0, 1 ) ), f.x ), mix( zh3( i + vec3( 0, 1, 1 ) ), zh3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
	}
	float zfbm( vec3 p ) { return zn3( p ) * 0.55 + zn3( p * 2.13 + 7.1 ) * 0.3 + zn3( p * 4.37 + 3.3 ) * 0.15; }
	vec3 zHue( vec3 c, float h ) {
		// rotate the hue around the grey axis (YIQ-style)
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
			float r = length( vec3( q.x, max( q.y, - 0.0 ) , q.z ) );
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
	#endif
	float zSkin = zm.r;
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
	// clothes: hue shift, tint, faded, grimy (more towards the feet), wet
	vec3 zCloth = max( zHue( zBase, uHue ), 0.0 ) * uClothTint;
	zCloth = mix( zCloth, vec3( dot( zCloth, vec3( 0.33 ) ) ), 0.25 * uInfect );
	float zDirt = smoothstep( 0.35, 0.85, zfbm( vBind * 4.0 + uSeed * 5.0 ) + ( 0.9 - vBind.y ) * 0.25 ) * uDirt;
	zCloth = mix( zCloth, zCloth * vec3( 0.5, 0.44, 0.36 ) + vec3( 0.02, 0.016, 0.01 ), zDirt );
	zCol = mix( zCloth, zCol, zSkin );
	// milky eyes
	zCol = mix( zCol, vec3( 0.62, 0.64, 0.58 ) + zN2 * 0.08, zm.g * uInfect );
	// blood
	float zB = zBlood( vBind, zSkin );
	float zFresh = zn3( vBind * 11.0 + 4.0 );
	vec3 zBloodCol = mix( vec3( 0.075, 0.012, 0.01 ), vec3( 0.2, 0.012, 0.01 ), zFresh );
	zCol = mix( zCol, zBloodCol, zB );
	diffuseColor.rgb = zCol;
	float zRough = mix( mix( 0.86, 0.5, zSkin * ( 0.5 + 0.5 * uInfect ) ), 0.28, zB * zFresh );
	zRough = mix( zRough, 0.25, uWetBody );
`;

function makeUniforms() {
	const w = [];
	for ( let i = 0; i < MAX_WOUNDS; i ++ ) w.push( new THREE.Vector4( 0, 0, 0, 0 ) );
	return {
		uMask: { value: null }, uBindScale: { value: 0.01 }, uHip: { value: 0.9 },
		uInfect: { value: 1 }, uRot: { value: 0.6 }, uHue: { value: 0 }, uDirt: { value: 0.5 }, uBlood: { value: 0.3 }, uSeed: { value: 0 },
		uWetBody: { value: 0 }, uHandBlood: { value: 0.6 }, uMouthBlood: { value: 1 },
		uSkinTone: { value: new THREE.Color( 0.72, 0.76, 0.66 ) }, uClothTint: { value: new THREE.Color( 1, 1, 1 ) },
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

// ---- library -------------------------------------------------------------------------------------------------

export class CharacterLib {
	constructor( game ) {
		this.game = game;
		this.loader = new GLTFLoader();
		this.texLoader = new THREE.TextureLoader();
		this.templates = new Map(); // id -> template | Promise
		this.bank = null;
		this.failed = new Set();
		this.ready = this.init();
	}

	async init() {
		try { this.bank = await ClipBank.load( DIR + 'anims.bin' ); } catch ( e ) { console.error( 'creature clips', e ); }
		return this.bank;
	}

	// the template if loaded; otherwise start loading it and return null
	get( id ) {
		const t = this.templates.get( id );
		if ( t && ! t.then ) return t;
		if ( ! t && ! this.failed.has( id ) && this.bank ) this.load( id );
		return null;
	}

	loaded() { return [ ...this.templates.values() ].filter( t => ! t.then ); }

	load( id ) {
		if ( this.templates.has( id ) ) return this.templates.get( id );
		const p = this._load( id ).then( t => { this.templates.set( id, t ); return t; } ).catch( e => {
			console.warn( 'character', id, e.message ); this.failed.add( id ); this.templates.delete( id ); return null;
		} );
		this.templates.set( id, p );
		return p;
	}

	_tex( file, srgb ) {
		return new Promise( ( resolve, reject ) => {
			this.texLoader.load( DIR + file, t => {
				t.flipY = false; // glTF uv convention
				t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
				t.anisotropy = 4;
				resolve( t );
			}, undefined, () => reject( new Error( 'texture ' + file ) ) );
		} );
	}

	async _load( id ) {
		if ( ! this.bank ) await this.ready;
		const [ gltf, c, n, m ] = await Promise.all( [
			this.loader.loadAsync( DIR + id + '.glb' ), this._tex( id + '_c.jpg', true ), this._tex( id + '_n.jpg', false ), this._tex( id + '_m.png', false ),
		] );
		const scene = gltf.scene;
		const bones = {};
		let avatar = null;
		const meshes = { skin: null, cards: null, lod: null };
		scene.traverse( o => {
			if ( o.isBone ) bones[ o.name ] = o;
			if ( o.name === 'Avatar' ) avatar = o;
			if ( o.isSkinnedMesh ) {
				if ( o.name.startsWith( 'lod1' ) || o.parent?.name?.startsWith( 'lod1' ) ) meshes.lod = o;
				else if ( o.material?.name === 'cards' ) meshes.cards = o;
				else meshes.skin = o;
			}
		} );
		if ( ! avatar || ! meshes.skin ) throw new Error( 'unexpected avatar layout' );
		const info = new RigInfo( this.bank, bones, avatar );
		// bind-space landmarks for the shader (metres above the feet, character frame)
		const bp = ( name ) => {
			const b = bones[ name ];
			if ( ! b ) return null;
			const v = new THREE.Vector3().setFromMatrixPosition( b.matrixWorld ).applyMatrix4( new THREE.Matrix4().copy( avatar.matrixWorld ).invert() );
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
		for ( const k in meshes ) {
			const o = meshes[ k ];
			if ( ! o ) continue;
			o.frustumCulled = true;
			// a generous fixed bound instead of skinning every vertex to compute one (mesh space is cm)
			o.boundingSphere = new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 190 );
		}
		const tex = { c, n, m };
		const t = {
			id, scene, info, avatar, tex, face, meshes, hip: info.hip, height: headTop, sex: AVATARS[ id ]?.sex || 'm',
			landmarks: { mouth, handL, handR, fwd: info.fwd.clone() },
			pelvisScale: info.hip / 0.8952,
		};
		return t;
	}

	// a posable instance of a loaded template
	create( t, opts = {} ) {
		const root = new THREE.Group();
		const model = SkeletonUtils.clone( t.scene );
		model.quaternion.copy( t.face );
		root.add( model );
		const bones = {};
		let avatar = null;
		const meshes = { skin: null, cards: null, lod: null };
		model.traverse( o => {
			if ( o.isBone ) bones[ o.name ] = o;
			if ( o.name === 'Avatar' ) avatar = o;
			if ( o.isSkinnedMesh ) {
				if ( o.name.startsWith( 'lod1' ) || o.parent?.name?.startsWith( 'lod1' ) ) meshes.lod = o;
				else if ( o.material?.name === 'cards' ) meshes.cards = o;
				else meshes.skin = o;
				o.boundingSphere = new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 190 );
			}
		} );
		const u = makeUniforms();
		u.uMask.value = t.tex.m;
		u.uHip.value = t.hip;
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
		const rig = new Rig( this.bank, t.info, bones );
		rig.pelvisScale = t.pelvisScale;
		return new CharacterInstance( t, root, model, meshes, rig, u, [ mat, cardMat ].filter( Boolean ), avatar );
	}
}

// ---- instance -------------------------------------------------------------------------------------------------------

const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3();

export class CharacterInstance {
	constructor( t, root, model, meshes, rig, u, mats, avatar ) {
		this.t = t; this.root = root; this.model = model; this.meshes = meshes; this.rig = rig; this.u = u; this.mats = mats;
		this.avatar = avatar;
		this.lod = 0;
		this.shadow = true;
		this.nextWound = 0;
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
		const local = _v3.copy( point ).applyMatrix4( _m4 ); // bone-local (cm, the avatar scale is in the chain)
		const q = new THREE.Quaternion( info.bindW[ best * 4 ], info.bindW[ best * 4 + 1 ], info.bindW[ best * 4 + 2 ], info.bindW[ best * 4 + 3 ] );
		local.applyQuaternion( q ).add( _v3b.set( info.bindPos[ best * 3 ], info.bindPos[ best * 3 + 1 ], info.bindPos[ best * 3 + 2 ] ) );
		local.multiplyScalar( this.t.avatar.scale.x ).y += this.t.hip;
		const w = this.u.uWounds.value[ this.nextWound ++ % MAX_WOUNDS ];
		w.set( local.x, local.y, local.z, size );
	}

	dispose() {
		for ( const m of this.mats ) m.dispose();
		this.root.removeFromParent();
	}
}
const _v3b = new THREE.Vector3();
