// The character in the inventory's centre column (docs/UI_DAYZ.md "The character preview"): a living Rocketbox
// survivor (the creatures' CharacterLib), idle, under a soft studio light on a dark gradient, turned by dragging,
// holding what you hold. The avatar follows what you wear where an avatar matches (board shorts: the swimmer; a
// uniform: police, army, medic, fire), else one casual survivor fixed per save.
//
// It draws with the game's own WebGLRenderer, so nothing is uploaded twice and no second context exists: once the
// game's frame is done (UI.update runs after Renderer.render), the figure is rendered into a small multisampled
// half-float target, tone-mapped over the backdrop into the element's rectangle of the game canvas, and copied from
// there into the element's own 2D canvas (which covers that rectangle). Only while the inventory is open; detach()
// gives the avatar back to the library's pool and frees the target, so a closed inventory costs nothing.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G as UNI } from '../render/Materials.js';
import { buildItemModel } from '../render/ItemModels.js';
import { getItem } from '../game/items/ItemDB.js';
import { ALOHA } from '../ai/Characters.js';

// what the worn top and bottom say (item tags, then ids) -> avatar by sex; null: keep the casual one
const ROLES = [
	[ ( t ) => t.has( 'police' ), { m: 'm_police1' } ],
	[ ( t ) => t.has( 'security' ), { m: 'm_security' } ],
	[ ( t ) => t.has( 'military' ), { m: 'm_army1', f: 'f_army' } ],
	[ ( t ) => t.has( 'fire' ), { m: 'm_fire' } ],
	[ ( t, ids ) => t.has( 'medical' ), { m: 'm_medic', f: 'f_nurse' } ],
	[ ( t, ids, torso, legs ) => /board_shorts|swim/.test( legs ) && ! /shirt|jacket|hoodie|coat|suit|dress|muumuu/.test( torso ), { m: 'm_swim', f: 'f_sport' } ],
	[ ( t, ids ) => /coveralls/.test( ids ), { m: 'm_overalls' } ],
	[ ( t, ids ) => /flannel|palaka/.test( ids ), { m: 'm_flannel' } ],
	[ ( t, ids ) => /aloha|board_shorts/.test( ids ), { m: 'm_tourist1', f: 'f_casual2' } ],
	[ ( t ) => t.has( 'sports' ) || t.has( 'surf' ), { m: 'm_sport', f: 'f_sport' } ],
	[ ( t ) => t.has( 'office' ) || t.has( 'hotel' ) || t.has( 'formal' ), { m: 'm_office' } ],
];
// an aloha shirt worn: its print on the avatar's shirt (Characters.ALOHA palettes: ground, leaves, flowers, centres)
const PRINT = { aloha_shirt: 0, aloha_shirt_blue: 1, aloha_shirt_black: 2, aloha_shirt_yellow: 3, aloha_shirt_green: 4, aloha_shirt_turtle: 7 };
const CASUAL = [ 'm_casual1', 'm_casual2', 'm_casual3', 'm_casual4', 'f_casual1', 'f_casual3', 'm_casual2', 'f_casual2' ];
const LONG_GUNS = new Set( [ 'rifle', 'sniper', 'shotgun', 'lmg', 'smg', 'launcher' ] );
const FOV = 22;

let GunModels = null;
let Body = null;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _vp = new THREE.Vector4(), _sc = new THREE.Vector4(), _col = new THREE.Color();

function hashStr( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }

export class CharacterPreview {
	constructor( app ) {
		this.app = app;
		this.attached = false;
		this.yaw = Math.PI - 0.3; // facing the camera (yaw 0 faces -z), turned a little towards the key light
	}

	get lib() { return this.game?.creatures?.lib || null; }

	// el: the box in the centre column (its own canvas goes in it)
	attach( el, game ) {
		this.detach();
		this.el = el;
		this.game = game;
		this.attached = true;
		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'view';
		this.ctx = this.canvas.getContext( '2d', { alpha: false } );
		el.appendChild( this.canvas );
		el.classList.remove( 'live' );
		this.rect = null;
		this.t = 0;
		this.ro = new ResizeObserver( () => { this.rect = null; } );
		this.ro.observe( el );
		this.onResize = () => { this.rect = null; };
		addEventListener( 'resize', this.onResize );
		// drag to turn
		this.onDown = e => {
			if ( e.button !== 0 ) return;
			e.preventDefault();
			e.stopPropagation();
			el.setPointerCapture?.( e.pointerId );
			this.turn = { x: e.clientX, yaw: this.yaw, id: e.pointerId };
			el.classList.add( 'turning' );
		};
		this.onMove = e => { if ( this.turn && e.pointerId === this.turn.id ) this.yaw = this.turn.yaw + ( e.clientX - this.turn.x ) * 0.012; };
		this.onUp = e => { if ( this.turn && e.pointerId === this.turn.id ) { this.turn = null; el.classList.remove( 'turning' ); } };
		el.addEventListener( 'pointerdown', this.onDown );
		el.addEventListener( 'pointermove', this.onMove );
		el.addEventListener( 'pointerup', this.onUp );
		el.addEventListener( 'pointercancel', this.onUp );
		this.casual = CASUAL[ hashStr( String( game.save?.id ?? game.seed ?? 'deadtide' ) ) % CASUAL.length ];
	}

	// what to show: the avatar for the worn clothes, the held stack
	sync( inv ) {
		if ( ! this.attached ) return;
		this.wantId = this._avatarFor( inv );
		this.wantPrint = PRINT[ inv.equip?.torso?.id ] ?? - 1;
		this.rect = null; // (the columns may have moved)
		const held = inv.heldStack?.() || null;
		this.wantHeld = held ? held.id : null;
	}

	_avatarFor( inv ) {
		const t = inv.equip?.torso, l = inv.equip?.legs;
		const tags = new Set( [ ...( getItem( t?.id )?.tags || [] ), ...( getItem( l?.id )?.tags || [] ) ] );
		const torso = t?.id || '', legs = l?.id || '', ids = torso + ' ' + legs;
		const sex = this.casual[ 0 ];
		for ( const [ test, by ] of ROLES ) if ( test( tags, ids, torso, legs ) ) return by[ sex ] || this.casual;
		return this.casual;
	}

	// ---- per frame ------------------------------------------------------------------------------------------------

	update( dt ) {
		if ( ! this.attached || ! this.el.isConnected ) return;
		this._load();
		const R = this.app.renderer;
		if ( ! this.inst || ! this.ready || ! R?.gl ) return;
		this.t = ( this.t || 0 ) + dt;
		this._animate( dt );
		this._render( R.gl );
	}

	// the avatar for this.wantId: from the library (it may still be loading), then its shaders compiled off the frame
	_load() {
		const lib = this.lib;
		if ( ! lib || ! this.wantId ) return;
		if ( ! Body && ! this.bodyLoading ) this.bodyLoading = import( '../ai/Body.js' ).then( m => { Body = m; } ).catch( e => { console.warn( 'preview body', e ); } );
		if ( ! GunModels && ! this.gunsLoading ) this.gunsLoading = import( '../weapons/GunModels.js' ).then( m => { GunModels = m; } ).catch( () => {} );
		if ( ! Body ) return;
		if ( this.inst && this.instId === this.wantId ) { this._look(); this._held(); return; }
		if ( this.loadingId === this.wantId ) return;
		const t = lib.get( this.wantId );
		if ( ! t ) {
			// (get() starts the load; wait for it)
			if ( lib.failed?.has( this.wantId ) && this.wantId !== this.casual ) this.wantId = this.casual;
			return;
		}
		this.loadingId = this.wantId;
		this._release();
		this._stage();
		const inst = lib.acquire( t );
		inst.scale = 1;
		inst.setLOD( 0, false );
		this.inst = inst;
		this.print = undefined;
		this._look();
		this.instId = this.wantId;
		this.body = new Body.HumanBody( inst, { idle: 'idle', walk: 'walk', run: 'run', hunch: 0, tilt: 0, twitch: 0, arms: 'hang' } );
		this.height = t.height || 1.75;
		this.scene.add( inst.root );
		inst.place( _v.set( 0, 0, 0 ), this.yaw );
		this.body.update( 0.016 );
		inst.updateWorld();
		this.heldId = undefined;
		this._held();
		this._compile();
	}

	// alive and clean; the worn aloha shirt's print where the avatar has a shirt for it
	_look() {
		if ( this.print === this.wantPrint ) return;
		this.print = this.wantPrint;
		this.inst.setLook( { infect: 0, rot: 0, hue: 0, dirt: 0.12, blood: 0, mouthBlood: 0, handBlood: 0, seed: hashStr( this.casual ) % 100,
			wet: Math.min( 1, this.game.survival?.wet || 0 ), tint: new THREE.Color( 1, 1, 1 ), aloha: this.print >= 0 ? ALOHA[ this.print ] : null } );
	}

	// every material in the stage compiled for its lights before the first draw (parallel where the browser can)
	_compile() {
		const gl = this.app.renderer?.gl;
		if ( ! gl ) return;
		this.ready = false;
		const n = ++ this.compiles || ( this.compiles = 1 );
		const prev = gl.getRenderTarget();
		this._ensureTarget( gl, 64, 64 );
		gl.setRenderTarget( this.rt );
		let p;
		try { p = gl.compileAsync ? gl.compileAsync( this.scene, this.cam ) : ( gl.compile( this.scene, this.cam ), Promise.resolve() ); } catch ( e ) { console.warn( 'preview compile', e ); p = Promise.resolve(); } finally { gl.setRenderTarget( prev ); }
		p.then( () => { if ( this.compiles === n && this.attached ) { this.ready = true; this.loadingId = null; } } );
	}

	// what is in the hands, at the right hand: a long gun held across the body, anything else along the forearm
	_held() {
		if ( this.heldId === this.wantHeld || ! this.inst ) return;
		if ( this.wantHeld && getItem( this.wantHeld )?.firearm && ! GunModels ) return; // its builder is still loading
		this.heldId = this.wantHeld;
		if ( this.heldObj ) { this.heldObj.removeFromParent(); this.heldObj = null; }
		const d = this.heldId ? getItem( this.heldId ) : null;
		this.longGun = !! ( d?.firearm && LONG_GUNS.has( d.firearm.cls ) );
		this.body.style.arms = this.longGun ? 'rifle' : 'hang';
		this.body.aimPitch = this.longGun ? - 0.42 : 0;
		if ( ! d ) return;
		try {
			if ( d.firearm && GunModels?.buildGunView ) this.heldObj = GunModels.buildGunView( d, 'world' ).obj;
			else this.heldObj = buildItemModel( d ).clone();
		} catch ( e ) { this.heldObj = null; return; }
		this.heldObj.traverse( o => { if ( o.isMesh ) { o.castShadow = false; o.frustumCulled = false; } } );
		this.heldGun = !! d.firearm;
		this.scene.add( this.heldObj );
		if ( this.inst ) this._compile();
	}

	_animate( dt ) {
		const inst = this.inst, body = this.body;
		inst.place( _v.set( 0, 0, 0 ), this.yaw );
		body.yaw = this.yaw;
		body.speed = 0;
		inst.u.uWetBody.value = Math.min( 1, this.game.survival?.wet || 0 );
		body.update( Math.min( dt, 0.1 ) );
		// alive and calm: the mouth closed (the body's jaw hangs open for the infected)
		const r = inst.rig;
		if ( r.jaw && r.jawRest ) { r.jaw.quaternion.copy( r.jawRest ); r.jaw.updateMatrix(); }
		inst.updateWorld();
		if ( this.heldObj ) this._place( inst );
	}

	_place( inst ) {
		const obj = this.heldObj, yaw = this.yaw;
		inst.bonePos( 'rHand', _v );
		if ( this.heldGun && this.longGun ) {
			// at the low ready, as the survivors carry one: muzzle down and across the body towards the left hand
			const p = this.body.aimPitch, a = yaw + 0.55;
			const fx = - Math.sin( a ), fz = - Math.cos( a );
			_v2.set( fx * Math.cos( p ), Math.sin( p ), fz * Math.cos( p ) );
			_v3.set( 0, 1, 0 ).addScaledVector( _v2, - Math.sin( p ) ).normalize();
			_z.crossVectors( _v2, _v3 ).normalize();
			_m.makeBasis( _v2, _v3, _z );
			obj.quaternion.setFromRotationMatrix( _m );
			obj.position.copy( _v ).addScaledVector( _v3, - 0.02 ).addScaledVector( _v2, 0.02 );
		} else {
			// along the forearm, out of the fist (a pistol points where the arm hangs)
			inst.bonePos( 'rFore', _v3 );
			_v2.subVectors( _v, _v3 ).normalize();
			const side = _z.set( Math.cos( yaw ), 0, - Math.sin( yaw ) ); // the character's right
			_v3.crossVectors( side, _v2 ).normalize();
			_z.crossVectors( _v2, _v3 ).normalize();
			_m.makeBasis( _v2, _v3, _z );
			obj.quaternion.setFromRotationMatrix( _m );
			obj.position.copy( _v ).addScaledVector( _v2, this.heldGun ? 0.02 : 0.05 );
		}
		obj.updateMatrixWorld( true );
	}

	// ---- drawing --------------------------------------------------------------------------------------------------

	_stage() {
		if ( this.scene ) return;
		const scene = this.scene = new THREE.Scene();
		// studio: a soft sky and floor fill, a warm key from the upper left, a cool fill, a rim from behind
		scene.add( new THREE.HemisphereLight( 0xdde6f0, 0x2e2a26, 0.9 ) );
		const key = new THREE.DirectionalLight( 0xfff0e0, 2.4 ); key.position.set( - 1.6, 2.6, 2.4 );
		const fill = new THREE.DirectionalLight( 0xcad8f0, 0.7 ); fill.position.set( 2.2, 1.2, 1.6 );
		const rim = new THREE.DirectionalLight( 0xffffff, 1.9 ); rim.position.set( 0.6, 2.4, - 2.8 );
		scene.add( key, fill, rim );
		this.cam = new THREE.PerspectiveCamera( FOV, 1, 0.1, 30 );
		this.quad = new FullScreenQuad( new THREE.ShaderMaterial( {
			uniforms: { tSrc: { value: null }, uAspect: { value: 1 }, uFeet: { value: 0.1 }, uExposure: { value: 1.0 } },
			vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
			fragmentShader: /* glsl */`
				uniform sampler2D tSrc; uniform float uAspect, uFeet, uExposure; varying vec2 vUv;
				vec3 RRTAndODTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
				vec3 aces( vec3 c ) {
					const mat3 I = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
					const mat3 O = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
					c *= uExposure / 0.6; c = I * c; c = RRTAndODTFit( c ); c = O * c; return clamp( c, 0.0, 1.0 );
				}
				vec3 srgb( vec3 c ) { return mix( 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, c * 12.92, vec3( lessThanEqual( c, vec3( 0.0031308 ) ) ) ); }
				float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
				void main() {
					vec4 s = texture2D( tSrc, vUv );
					float a = clamp( s.a, 0.0, 1.0 );
					vec3 c = a > 0.0 ? srgb( aces( s.rgb / a ) ) : vec3( 0.0 );
					// the backdrop: near black, a soft pool of light behind the figure, a darker floor under its feet
					vec2 p = vec2( ( vUv.x - 0.5 ) * uAspect, vUv.y - 0.56 );
					vec3 bg = mix( vec3( 0.03 ), vec3( 0.15, 0.152, 0.158 ), exp( - dot( p, p ) * 4.0 ) );
					vec2 f = vec2( ( vUv.x - 0.5 ) * uAspect * 3.2, ( vUv.y - uFeet ) * 14.0 );
					bg *= 1.0 - 0.55 * exp( - dot( f, f ) );
					vec3 col = mix( bg, c, a ) + ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;
					gl_FragColor = vec4( col, 1.0 );
				}`,
			depthTest: false, depthWrite: false, blending: THREE.NoBlending,
		} ) );
	}

	_ensureTarget( gl, W, H ) {
		if ( ! this.rt ) {
			const samples = Math.min( 4, gl.capabilities?.maxSamples || 0 );
			this.rt = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthBuffer: true } );
			this.rt.texture.generateMipmaps = false;
		} else if ( this.rt.width !== W || this.rt.height !== H ) this.rt.setSize( W, H );
	}

	_render( gl ) {
		const el = this.el, canvas = gl.domElement;
		if ( ! this.rect || this.t < 0.6 ) this.rect = el.getBoundingClientRect();
		const r = this.rect;
		if ( r.width < 8 || r.height < 8 ) return;
		const pr = gl.getPixelRatio();
		// the element's rectangle in the game canvas (CSS px for three, device px for the copy)
		const sx = Math.round( r.left * pr ), sy = Math.round( r.top * pr );
		const W = Math.max( 1, Math.min( canvas.width - sx, Math.round( r.width * pr ) ) ), H = Math.max( 1, Math.min( canvas.height - sy, Math.round( r.height * pr ) ) );
		if ( sx < 0 || sy < 0 || W < 4 || H < 4 ) return;
		this._ensureTarget( gl, W, H );
		// frame the whole body with a margin, a little from above
		const cam = this.cam, hgt = this.height;
		cam.aspect = W / H;
		const halfV = Math.tan( THREE.MathUtils.degToRad( FOV / 2 ) );
		const needH = hgt * 1.16, needW = 0.95;
		const dist = Math.max( needH / 2 / halfV, needW / 2 / ( halfV * cam.aspect ) );
		cam.position.set( 0, hgt * 0.53 + dist * 0.05, dist );
		cam.lookAt( 0, hgt * 0.5, 0 );
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld( true );
		const feet = _v.set( 0, 0, 0 ).project( cam ).y * 0.5 + 0.5;
		const U = this.quad.material.uniforms;
		U.tSrc.value = this.rt.texture; U.uAspect.value = W / H; U.uFeet.value = feet;

		// the world's shading globals are set for the game camera far away: neutralise them (as the icon stage does)
		const saved = { cam: UNI.uCamPos.value.clone(), k: UNI.uCloudShadowK.value, wet: UNI.uWet.value, bounce: UNI.uBounceOn.value, haze: UNI.uHazeDensity.value, under: UNI.uUnderwater.value };
		UNI.uCamPos.value.copy( cam.position ); UNI.uCloudShadowK.value = 0; UNI.uWet.value = 0; UNI.uBounceOn.value = 0; UNI.uHazeDensity.value = 0; UNI.uUnderwater.value = 0;
		const prevTarget = gl.getRenderTarget(), auto = gl.autoClear, alpha = gl.getClearAlpha();
		gl.getClearColor( _col ); gl.getViewport( _vp ); gl.getScissor( _sc );
		const scT = gl.getScissorTest();
		try {
			gl.setRenderTarget( this.rt );
			gl.setClearColor( 0x000000, 0 );
			gl.clear( true, true, false );
			gl.render( this.scene, cam );
			// into the element's rectangle of the game canvas, then a copy into the element's canvas
			gl.setRenderTarget( null );
			const y0 = ( canvas.height - sy - H ) / pr;
			gl.setViewport( sx / pr, y0, W / pr, H / pr );
			gl.setScissor( sx / pr, y0, W / pr, H / pr );
			gl.setScissorTest( true );
			this.quad.render( gl );
		} finally {
			gl.setScissorTest( scT ); gl.setScissor( _sc ); gl.setViewport( _vp );
			gl.setRenderTarget( prevTarget );
			gl.setClearColor( _col, alpha ); gl.autoClear = auto;
			UNI.uCamPos.value.copy( saved.cam ); UNI.uCloudShadowK.value = saved.k; UNI.uWet.value = saved.wet; UNI.uBounceOn.value = saved.bounce; UNI.uHazeDensity.value = saved.haze; UNI.uUnderwater.value = saved.under;
		}
		const c = this.canvas;
		if ( c.width !== W || c.height !== H ) { c.width = W; c.height = H; }
		try { this.ctx.drawImage( canvas, sx, sy, W, H, 0, 0, W, H ); } catch ( e ) { return; }
		if ( ! this.live ) { this.live = true; el.classList.add( 'live' ); }
	}

	// ---- teardown -----------------------------------------------------------------------------------------------------

	_release() {
		if ( this.heldObj ) { this.heldObj.removeFromParent(); this.heldObj = null; }
		this.heldId = undefined;
		if ( this.inst ) { this.inst.root.removeFromParent(); this.lib?.release( this.inst ); }
		this.inst = null;
		this.instId = null;
		this.body = null;
		this.ready = false;
	}

	detach() {
		if ( ! this.attached ) return;
		this.attached = false;
		this._release();
		this.loadingId = null;
		this.compiles = ( this.compiles || 0 ) + 1; // a compile still running finds itself stale
		this.rt?.dispose(); this.rt = null;
		this.quad?.material.dispose(); this.quad?.dispose(); this.quad = null;
		this.scene = null; this.cam = null;
		this.ro?.disconnect(); this.ro = null;
		removeEventListener( 'resize', this.onResize );
		const el = this.el;
		if ( el ) {
			el.removeEventListener( 'pointerdown', this.onDown );
			el.removeEventListener( 'pointermove', this.onMove );
			el.removeEventListener( 'pointerup', this.onUp );
			el.removeEventListener( 'pointercancel', this.onUp );
			el.classList.remove( 'live', 'turning' );
		}
		this.canvas?.remove();
		this.canvas = this.ctx = null;
		this.el = this.game = null;
		this.live = false;
		this.turn = null;
		this.rect = null;
	}
}
