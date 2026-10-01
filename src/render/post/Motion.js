// Motion vectors for the things that move on their own, and a reactive mask, for the TAA resolve (post/TAA.js).
// The resolve reprojects static pixels from depth and the camera alone; a creature walking past a still camera
// would keep the background's history (it showed see-through). Objects registered here are drawn a second time,
// after the scene pass, into one full-resolution RGBA16F target:
//   rg: uv motion (current - previous, unjittered) of a dynamic surface (a = 1): the previous model matrix and,
//       for skinned meshes, the previous bone matrices (a copy of the skeleton's bone texture kept per frame),
//       for instanced meshes the previous instance matrices (slot by slot: for batches whose slots are stable)
//   b:  reactive (0..1, FSR2's reactive mask): the share of the history to drop where fast transparents (alpha
//       particles) or things with no usable previous transform (instance batches re-sorted every frame) cover it
// Only the surfaces the scene pass kept are written: each fragment compares its depth with the scene depth
// (equal within a small tolerance), so no depth buffer is needed and occluded parts write nothing. Rigid meshes
// that did not move since the last frame are skipped (parked cars stay on the static path, which keeps the
// best anti-aliasing), so the pass costs a clear plus a draw per moving object, and nothing at all (no clear,
// no fetch in the resolve) when no registered object is in view.
//
//   setDynamic( object, on = true )         motion vectors for the opaque layer-0 meshes under object
//                                           (object.userData.dynamic); nested dynamic roots are drawn on their own;
//                                           an InstancedMesh must keep each thing in the same slot
//   setReactive( object, strength = 1 )     a reactive mask from object's meshes (0 turns it off;
//                                           object.userData.reactive): ShaderMaterials with blending give
//                                           reactive = alpha x strength, other meshes reactive = strength
// Registration holds weak references: an object that is dropped and collected leaves by itself.
import * as THREE from 'three';

const dynamicRefs = new Set(), reactiveRefs = new Set();
const refOf = new WeakMap();

function register( set, obj ) {
	let r = refOf.get( obj );
	if ( ! r ) { r = new WeakRef( obj ); refOf.set( obj, r ); }
	set.add( r );
}

export function setDynamic( obj, on = true ) {
	if ( ! obj ) return obj;
	obj.userData.dynamic = !! on;
	if ( on ) register( dynamicRefs, obj );
	return obj;
}

export function setReactive( obj, strength = 1 ) {
	if ( ! obj ) return obj;
	const s = strength === true ? 1 : + strength || 0;
	if ( obj.userData.reactive === s ) return obj;
	obj.userData.reactive = s;
	if ( s > 0 ) register( reactiveRefs, obj );
	return obj;
}

// (reversed-Z: larger is nearer. The tolerance is relative: about 2 mm per metre of distance)
const DEPTH_GLSL = /* glsl */`
	uniform sampler2D tMotionSceneDepth;
	float motionSceneDepth() { return texelFetch( tMotionSceneDepth, ivec2( gl_FragCoord.xy ), 0 ).r; }
	bool motionHidden( bool equalOnly ) {
		float d = motionSceneDepth();
		float tol = d * 2e-3 + 1e-7;
		return equalOnly ? abs( gl_FragCoord.z - d ) > tol : gl_FragCoord.z < d - tol;
	}`;

const VEL_VS = /* glsl */`
	#include <common>
	#include <skinning_pars_vertex>
	uniform mat4 uMotionVP; uniform mat4 uMotionPrevVP; uniform mat4 uPrevModel;
	#ifdef USE_INSTANCING
	attribute mat4 prevInstanceMatrix;
	#endif
	#ifdef USE_SKINNING
	uniform highp sampler2D uPrevBones;
	mat4 prevBoneMatrix( const in float i ) {
		int size = textureSize( uPrevBones, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		return mat4( texelFetch( uPrevBones, ivec2( x, y ), 0 ), texelFetch( uPrevBones, ivec2( x + 1, y ), 0 ),
			texelFetch( uPrevBones, ivec2( x + 2, y ), 0 ), texelFetch( uPrevBones, ivec2( x + 3, y ), 0 ) );
	}
	#endif
	varying vec4 vCur;
	varying vec4 vPrev;
	void main() {
		// (the same chunks as the lit materials: the same jittered position, so the depth test below matches)
		#include <skinbase_vertex>
		#include <begin_vertex>
		#include <skinning_vertex>
		#include <project_vertex>
		vec4 cur = vec4( transformed, 1.0 );
		vec4 prev = vec4( position, 1.0 );
		#ifdef USE_SKINNING
		// uPrevModel is last frame's matrixWorld x bindMatrixInverse
		vec4 sv = bindMatrix * prev;
		prev = prevBoneMatrix( skinIndex.x ) * sv * skinWeight.x + prevBoneMatrix( skinIndex.y ) * sv * skinWeight.y
			+ prevBoneMatrix( skinIndex.z ) * sv * skinWeight.z + prevBoneMatrix( skinIndex.w ) * sv * skinWeight.w;
		#endif
		#ifdef USE_INSTANCING
		cur = instanceMatrix * cur;
		prev = prevInstanceMatrix * prev;
		#endif
		vCur = uMotionVP * ( modelMatrix * cur );
		vPrev = uMotionPrevVP * ( uPrevModel * prev );
	}`;

const VEL_FS = /* glsl */`
	${DEPTH_GLSL}
	varying vec4 vCur;
	varying vec4 vPrev;
	void main() {
		if ( motionHidden( true ) ) discard;
		// (behind the last frame's camera: no usable history, a motion that leaves the screen)
		vec2 v = vPrev.w > 1e-5 ? ( vCur.xy / vCur.w - vPrev.xy / vPrev.w ) * 0.5 : vec2( 2.0 );
		gl_FragColor = vec4( v, 0.0, 1.0 );
	}`;

// reactive, opaque: instanced things with no previous transform. MAX blending with -65504 in r, g and 0 in a
// leaves the motion vectors and the dynamic flag alone and keeps the largest reactive value
const REACT_VS = /* glsl */`
	#include <common>
	void main() {
		#include <begin_vertex>
		#include <project_vertex>
	}`;
const REACT_FS = /* glsl */`
	${DEPTH_GLSL}
	uniform float uReactive;
	void main() {
		if ( motionHidden( true ) ) discard;
		gl_FragColor = vec4( -65504.0, -65504.0, uReactive, 0.0 );
	}`;
// reactive from a blended ShaderMaterial: its own shader, the alpha it computed turned into the mask
const REACT_TAIL = /* glsl */`
	if ( motionHidden( false ) ) discard;
	gl_FragColor = vec4( -65504.0, -65504.0, clamp( gl_FragColor.a * uReactive, 0.0, 1.0 ), 0.0 );
`;

function maxBlend( m ) {
	m.blending = THREE.CustomBlending;
	m.blendEquation = m.blendEquationAlpha = THREE.MaxEquation;
	m.blendSrc = m.blendDst = m.blendSrcAlpha = m.blendDstAlpha = THREE.OneFactor;
	m.transparent = true; // (drawn after the dynamic surfaces, which write b = 0)
	m.depthTest = false; m.depthWrite = false;
	return m;
}

const SKIP = new THREE.MeshBasicMaterial( { visible: false } );

export class MotionPass {
	constructor() {
		// (read with texelFetch; the mip chain gives the resolve a cheap "near a moving object" from a)
		this.target = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.HalfFloatType, depthBuffer: false } );
		this.target.texture.minFilter = THREE.LinearMipmapNearestFilter;
		this.target.texture.magFilter = THREE.LinearFilter;
		this.target.texture.generateMipmaps = true;
		this.scene = new THREE.Scene();
		this.scene.matrixWorldAutoUpdate = false;
		// shared by every motion material
		this.shared = {
			uMotionVP: { value: new THREE.Matrix4() }, uMotionPrevVP: { value: new THREE.Matrix4() },
			tMotionSceneDepth: { value: null },
		};
		this.proxies = new Map(); // source mesh -> proxy record
		this.skeletons = new Map(); // skeleton -> { tex, frame, used, moved }
		this.frame = 0;
		this.drawn = 0;
		this._col = new THREE.Color();
	}

	setSize( w, h ) { this.target.setSize( w, h ); }
	get texture() { return this.target.texture; }

	_velMaterial() {
		return new THREE.ShaderMaterial( {
			name: 'MotionVectors', vertexShader: VEL_VS, fragmentShader: VEL_FS,
			uniforms: { ...this.shared, uPrevModel: { value: new THREE.Matrix4() }, uPrevBones: { value: null } },
			side: THREE.DoubleSide, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
		} );
	}

	_reactMaterial( src, strength ) {
		let m;
		if ( src.isShaderMaterial && src.transparent ) {
			// the source's own shader (billboards and the like position themselves in it), alpha -> reactive
			const fs = src.fragmentShader.replace( /}\s*$/, REACT_TAIL + '}' );
			m = new THREE.ShaderMaterial( {
				name: ( src.name || 'shader' ) + 'Reactive', vertexShader: src.vertexShader, fragmentShader: DEPTH_GLSL + '\nuniform float uReactive;\n' + fs,
				defines: { ...src.defines }, uniforms: { ...src.uniforms, tMotionSceneDepth: this.shared.tMotionSceneDepth, uReactive: { value: strength } },
				side: src.side, glslVersion: src.glslVersion,
			} );
		} else {
			m = new THREE.ShaderMaterial( {
				name: 'MotionReactive', vertexShader: REACT_VS, fragmentShader: REACT_FS,
				uniforms: { tMotionSceneDepth: this.shared.tMotionSceneDepth, uReactive: { value: strength } }, side: THREE.DoubleSide,
			} );
		}
		return maxBlend( m );
	}

	// the stand-in drawn for a source mesh: shares its geometry (and skeleton / instances), own material
	_proxy( src, reactive ) {
		let p = this.proxies.get( src );
		if ( p && ( p.reactive !== reactive || p.geoSrc !== src.geometry || ( p.prevAttr && p.prevAttr.array.length !== src.instanceMatrix.array.length ) ) ) { this._dropProxy( src, p ); p = null; }
		if ( p ) return p;
		let obj, prevAttr = null;
		if ( src.isInstancedMesh && ! reactive ) {
			// its own geometry sharing the source's buffers, plus last frame's instance matrices
			const geo = new THREE.BufferGeometry();
			for ( const k in src.geometry.attributes ) geo.setAttribute( k, src.geometry.attributes[ k ] );
			geo.setIndex( src.geometry.index );
			geo.groups = src.geometry.groups;
			geo.drawRange = src.geometry.drawRange;
			prevAttr = new THREE.InstancedBufferAttribute( new Float32Array( src.instanceMatrix.array.length ), 16 ).setUsage( THREE.DynamicDrawUsage );
			geo.setAttribute( 'prevInstanceMatrix', prevAttr );
			obj = new THREE.InstancedMesh( geo, SKIP, 0 );
			obj.instanceMatrix = src.instanceMatrix;
			obj.frustumCulled = false;
		} else if ( src.isSkinnedMesh ) {
			obj = new THREE.SkinnedMesh( src.geometry, SKIP );
			obj.skeleton = src.skeleton;
			obj.bindMatrix = src.bindMatrix;
			obj.bindMatrixInverse = src.bindMatrixInverse;
			obj.bindMode = src.bindMode;
		} else if ( src.isInstancedMesh ) {
			obj = new THREE.InstancedMesh( src.geometry, SKIP, 0 );
			obj.instanceMatrix = src.instanceMatrix;
			obj.frustumCulled = false;
		} else obj = new THREE.Mesh( src.geometry, SKIP );
		obj.matrixAutoUpdate = false;
		obj.matrixWorldAutoUpdate = false;
		const one = reactive ? this._reactMaterial( Array.isArray( src.material ) ? src.material[ 0 ] : src.material, src.userData.reactive || 1 ) : this._velMaterial();
		p = { obj, mat: one, reactive, geoSrc: src.geometry, prevAttr, prev: new THREE.Matrix4(), prevFrame: - 10, moved: - 10, used: 0, srcMat: null, mats: null };
		this.proxies.set( src, p );
		return p;
	}

	_dropProxy( src, p ) {
		p.mat.dispose();
		if ( p.prevAttr ) {
			// (free only our own buffer: the source's attributes are not ours to delete)
			const geo = p.obj.geometry;
			for ( const k in geo.attributes ) if ( k !== 'prevInstanceMatrix' ) geo.deleteAttribute( k );
			geo.setIndex( null );
			geo.dispose();
		}
		this.proxies.delete( src );
	}

	// per-group materials: the motion material where the source draws an opaque surface, nothing elsewhere
	_materials( src, p ) {
		const sm = src.material;
		if ( ! Array.isArray( sm ) ) return opaque( sm ) ? p.mat : SKIP;
		if ( p.srcMat !== sm || ! p.mats || p.mats.length !== sm.length || p.mats.some( ( m, i ) => ( m === SKIP ) === opaque( sm[ i ] ) ) ) {
			p.srcMat = sm;
			p.mats = sm.map( m => opaque( m ) ? p.mat : SKIP );
		}
		return p.mats;
	}

	_skeleton( sk ) {
		let s = this.skeletons.get( sk );
		if ( ! s ) {
			if ( sk.boneTexture === null ) sk.computeBoneTexture();
			const img = sk.boneTexture.image;
			const tex = new THREE.DataTexture( new Float32Array( img.data.length ), img.width, img.height, THREE.RGBAFormat, THREE.FloatType );
			s = { tex, frame: - 10, used: 0, moved: - 10 };
			this.skeletons.set( sk, s );
		}
		return s;
	}

	// draw the registered objects in view; returns whether the target holds anything this frame.
	// camera: still jittered (the scene pass's projection); vp / prevVP: this and last frame's unjittered
	// view-projection; sceneDepth: the opaque scene's depth texture
	render( gl, scene, camera, vp, prevVP, sceneDepth ) {
		const f = ++ this.frame;
		const S = this.shared;
		S.uMotionVP.value.copy( vp );
		S.uMotionPrevVP.value.copy( prevVP );
		S.tMotionSceneDepth.value = sceneDepth;
		const list = this.scene.children;
		list.length = 0;
		const skels = this._skels || ( this._skels = new Set() );
		const insts = this._insts || ( this._insts = [] );
		skels.clear();
		insts.length = 0;

		for ( const ref of dynamicRefs ) {
			const root = ref.deref();
			if ( ! root || root.userData.dynamic !== true ) { dynamicRefs.delete( ref ); continue; }
			if ( ! attached( root, scene ) ) continue;
			this._collect( root, root, false, list, skels, insts );
		}
		for ( const ref of reactiveRefs ) {
			const root = ref.deref();
			if ( ! root || ! ( root.userData.reactive > 0 ) ) { reactiveRefs.delete( ref ); continue; }
			if ( ! attached( root, scene ) ) continue;
			this._collect( root, root, true, list, skels, insts );
		}
		this.drawn = list.length;
		if ( list.length ) {
			const cc = gl.getClearColor( this._col ), ca = gl.getClearAlpha();
			const mask = camera.layers.mask, sort = gl.sortObjects;
			camera.layers.set( 0 );
			// (no depth sort: there is no depth buffer, and it would compute bounds of the stand-ins)
			gl.sortObjects = false;
			gl.setRenderTarget( this.target );
			gl.setClearColor( 0x000000, 0 );
			gl.clear( true, false, false );
			gl.render( this.scene, camera );
			gl.setClearColor( cc, ca );
			gl.sortObjects = sort;
			camera.layers.mask = mask;
		}
		// this frame's transforms become the previous ones (every visited mesh, drawn or not)
		for ( const sk of skels ) {
			const s = this.skeletons.get( sk );
			// (a copy and an upload only when the bones moved)
			if ( s.moved === f || s.frame !== f - 1 ) { s.tex.image.data.set( sk.boneMatrices ); s.tex.needsUpdate = true; }
			s.frame = f;
		}
		for ( let i = 0; i < insts.length; i += 2 ) {
			const a = insts[ i ].prevAttr, cur = insts[ i + 1 ].instanceMatrix.array;
			if ( ! sameArray( a.array, cur ) ) { a.array.set( cur ); a.needsUpdate = true; }
		}
		list.length = 0;
		insts.length = 0;
		// forget the stand-ins and bone copies of things gone for a while (10 s at 60 fps)
		if ( f % 300 === 0 ) {
			for ( const [ src, p ] of this.proxies ) if ( f - p.used > 600 ) this._dropProxy( src, p );
			for ( const [ sk, s ] of this.skeletons ) if ( f - s.used > 600 ) { s.tex.dispose(); this.skeletons.delete( sk ); }
		}
		return this.drawn > 0;
	}

	_collect( o, root, reactive, list, skels, insts ) {
		if ( ! o.visible ) return;
		// (a nested root is drawn on its own: a character in a vehicle)
		if ( o !== root && ( o.userData.dynamic === true || o.userData.reactive > 0 ) ) return;
		if ( o.isMesh && ( o.layers.mask & 1 || reactive ) ) this._add( o, reactive, list, skels, insts );
		const ch = o.children;
		for ( let i = 0; i < ch.length; i ++ ) this._collect( ch[ i ], root, reactive, list, skels, insts );
	}

	_add( src, reactive, list, skels, insts ) {
		const f = this.frame;
		const p = this._proxy( src, reactive );
		p.used = f;
		const obj = p.obj;
		if ( src.isInstancedMesh ) {
			obj.instanceMatrix = src.instanceMatrix;
			obj.count = src.count;
		}
		if ( reactive ) {
			if ( src.isInstancedMesh && src.count === 0 ) return;
			p.mat.uniforms.uReactive.value = src.userData.reactive;
			obj.material = p.mat;
			obj.matrixWorld.copy( src.matrixWorld );
			obj.frustumCulled = src.frustumCulled && ! src.isInstancedMesh && ! src.geometry.isInstancedBufferGeometry;
			list.push( obj );
			return;
		}
		const valid = p.prevFrame === f - 1;
		// (skinned: matrixWorld x bindMatrixInverse, what takes the skinned bind-space position to the world)
		const M = src.isSkinnedMesh ? _mb.multiplyMatrices( src.matrixWorld, src.bindMatrixInverse ) : src.matrixWorld;
		const u = p.mat.uniforms;
		let moved = valid && ! p.prev.equals( M );
		if ( src.isSkinnedMesh ) {
			const sk = src.skeleton;
			const s = this._skeleton( sk );
			s.used = f;
			if ( ! skels.has( sk ) ) {
				skels.add( sk );
				// (bones that hold still too: a body lying still stays on the static path)
				if ( s.frame === f - 1 && ! sameArray( s.tex.image.data, sk.boneMatrices ) ) s.moved = f;
			}
			if ( s.moved >= f - 1 ) moved = true;
			u.uPrevBones.value = s.frame === f - 1 ? s.tex : sk.boneTexture;
		}
		if ( src.isInstancedMesh ) {
			insts.push( p, src );
			if ( valid && ! sameArray( p.prevAttr.array, src.instanceMatrix.array ) ) moved = true;
		}
		if ( moved ) p.moved = f;
		// the previous transform (none on the first frame: nothing is drawn then)
		u.uPrevModel.value.copy( p.prev );
		p.prev.copy( M );
		p.prevFrame = f;
		// still since the last frame: the static path is right (and keeps the best anti-aliasing)
		if ( ! valid || p.moved < f - 1 ) return;
		if ( src.isInstancedMesh && src.count === 0 ) return;
		obj.material = this._materials( src, p );
		if ( obj.material === SKIP ) return;
		obj.matrixWorld.copy( src.matrixWorld );
		if ( src.isSkinnedMesh ) {
			// (a skinned mesh's own bound, when it has one: computing one would skin every vertex)
			obj.boundingSphere = src.boundingSphere;
			obj.frustumCulled = src.frustumCulled && !! src.boundingSphere;
		} else if ( ! src.isInstancedMesh ) obj.frustumCulled = src.frustumCulled;
		list.push( obj );
	}

	dispose() {
		this.target.dispose();
		for ( const [ src, p ] of this.proxies ) this._dropProxy( src, p );
		for ( const s of this.skeletons.values() ) s.tex.dispose();
		this.skeletons.clear();
	}
}

const _mb = new THREE.Matrix4();

function opaque( m ) {
	return !! m && m.visible !== false && ! m.transparent && m.colorWrite !== false;
}

function sameArray( a, b ) {
	const n = Math.min( a.length, b.length );
	for ( let i = 0; i < n; i ++ ) if ( a[ i ] !== b[ i ] ) return false;
	return true;
}

// in the scene being drawn, and shown (the object and all its parents)
function attached( o, scene ) {
	while ( o ) {
		if ( ! o.visible ) return false;
		if ( o === scene ) return true;
		o = o.parent;
	}
	return false;
}

