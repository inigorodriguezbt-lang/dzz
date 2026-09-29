// Placed fires: a campfire (stone ring, a log teepee, glowing embers, animated flames, crackle, warmth, cooking)
// and the camp stove (a small blue burner for cooking only). Owned and saved by game.crafting.
import * as THREE from 'three';
import { patchMaterial } from '../../render/Materials.js';
import { M, G, facet } from './models/lib.js';
import { getItem } from './ItemDB.js';
import { buildItemModel } from '../../render/ItemModels.js';
import { ensureItemSound } from './sounds.js';

const FLAME_VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const FLAME_FRAG = /* glsl */`
	uniform float uT; uniform float uStrength; uniform vec3 uCore; uniform vec3 uEdge; uniform float uSeed;
	varying vec2 vUv;
	float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
	float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), u.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), u.x ), u.y ); }
	float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { s += a * n2( p ); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
	void main() {
		vec2 uv = vUv;
		// flame body narrows towards the tip and licks sideways with the noise
		float y = uv.y;
		float n = fbm( vec2( uv.x * 3.5 + uSeed, y * 2.5 - uT * 2.6 ) );
		float x = abs( uv.x - 0.5 + ( n - 0.5 ) * 0.35 * y ) * 2.0;
		float width = mix( 0.95, 0.05, pow( y, 0.8 ) );
		float body = 1.0 - smoothstep( width * 0.55, width, x );
		float f = body * smoothstep( 1.0, 0.25, y + ( 1.0 - uStrength ) * 0.6 ) * ( 0.55 + n * 0.9 );
		f = clamp( f, 0.0, 1.0 );
		vec3 col = mix( uEdge, uCore, smoothstep( 0.35, 0.95, f ) );
		gl_FragColor = vec4( col * ( 1.4 + 2.2 * f ), f * smoothstep( 0.0, 0.08, y ) );
	}`;

let geoCache = null;
function geos() {
	if ( geoCache ) return geoCache;
	const stones = [];
	for ( let i = 0; i < 9; i ++ ) {
		const g = new THREE.IcosahedronGeometry( 0.07, 0 );
		const p = g.attributes.position;
		for ( let k = 0; k < p.count; k ++ ) {
			const j = 0.8 + ( ( Math.sin( p.getX( k ) * 97 + i * 13.7 + p.getZ( k ) * 51 ) * 43758.5 ) % 1 + 1 ) % 1 * 0.35;
			p.setXYZ( k, p.getX( k ) * j * 1.25, p.getY( k ) * j * 0.75, p.getZ( k ) * j );
		}
		stones.push( facet( g ) );
	}
	geoCache = {
		stones,
		log: G.cylX( 0.034, 0.52, 7, 0.028 ),
		ash: new THREE.CircleGeometry( 0.24, 18 ).rotateX( - Math.PI / 2 ),
		flame: new THREE.PlaneGeometry( 0.5, 0.75 ).translate( 0, 0.375, 0 ),
		smallFlame: new THREE.PlaneGeometry( 0.07, 0.07 ).translate( 0, 0.035, 0 ),
	};
	return geoCache;
}

export class Campfire {
	constructor( game, mgr, kind, pos, o = {} ) {
		this.game = game;
		this.mgr = mgr;
		this.kind = kind; // 'campfire' | 'stove'
		this.pos = pos.clone();
		this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
		this.lit = !! o.lit;
		this.fuel = o.fuel ?? 1.5; // game hours of burning left
		this.uses = o.uses ?? 0; // stove canister meals left
		this.cond = o.cond ?? 1;
		this.born = o.born ?? game.time.hours;
		this.deadSince = o.deadSince ?? null;
		this.id = 'fire' + Math.random().toString( 36 ).slice( 2, 8 );
		this.t = Math.random() * 10;
		this.snd = null;
		this.strength = this.lit ? 1 : 0;
		this.build();
	}

	get radius() { return this.kind === 'stove' ? 1.6 : 3.2; }

	build() {
		const g = this.game, grp = new THREE.Group();
		grp.position.copy( this.pos );
		grp.rotation.y = this.yaw;
		const flameMat = ( core, edge ) => new THREE.ShaderMaterial( {
			uniforms: { uT: { value: 0 }, uStrength: { value: 1 }, uCore: { value: new THREE.Color( core ) }, uEdge: { value: new THREE.Color( edge ) }, uSeed: { value: Math.random() * 10 } },
			vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
		} );
		if ( this.kind === 'stove' ) {
			const def = getItem( 'camp_stove' );
			if ( def ) { const m = buildItemModel( def ).clone(); grp.add( m ); }
			this.flameMat = flameMat( 0xbfe0ff, 0x2a5aff );
			const G0 = geos();
			for ( let i = 0; i < 3; i ++ ) {
				const f = new THREE.Mesh( G0.smallFlame, this.flameMat );
				f.position.set( 0, 0.132, 0 ); f.rotation.y = i * Math.PI / 3;
				f.layers.set( 1 );
				grp.add( f );
			}
			this.flames = grp.children.filter( c => c.material === this.flameMat );
		} else {
			const G0 = geos();
			const stone = M( 0x4d4844, { rough: 0.95 } );
			G0.stones.forEach( ( geo, i ) => {
				const a = i / G0.stones.length * Math.PI * 2;
				const m = new THREE.Mesh( geo, stone );
				m.position.set( Math.cos( a ) * 0.34, 0.035, Math.sin( a ) * 0.34 );
				m.rotation.y = a * 3.1;
				m.castShadow = true; m.receiveShadow = true;
				grp.add( m );
			} );
			// the log material chars as the fire burns
			this.logMat = patchMaterial( new THREE.MeshStandardMaterial( { color: 0x6a4a2e, roughness: 0.95 } ), 'item' );
			for ( let i = 0; i < 4; i ++ ) {
				const a = i / 4 * Math.PI * 2 + 0.3;
				const m = new THREE.Mesh( G0.log, this.logMat );
				// a teepee: each log leans in from the ring towards the centre
				m.position.set( Math.cos( a ) * 0.13, 0.12, Math.sin( a ) * 0.13 );
				m.rotation.set( 0, - a, - 0.72 );
				m.castShadow = true; m.receiveShadow = true;
				grp.add( m );
			}
			this.emberMat = patchMaterial( new THREE.MeshStandardMaterial( { color: 0x2a2420, roughness: 1, emissive: 0xff4a0a, emissiveIntensity: 0 } ), 'item' );
			const ash = new THREE.Mesh( G0.ash, this.emberMat );
			ash.position.y = 0.012; ash.receiveShadow = true;
			grp.add( ash );
			this.flameMat = flameMat( 0xfff0b0, 0xff4a0a );
			this.flames = [];
			for ( let i = 0; i < 3; i ++ ) {
				const f = new THREE.Mesh( G0.flame, this.flameMat );
				f.position.y = 0.03; f.rotation.y = i * Math.PI / 3;
				f.layers.set( 1 );
				f.frustumCulled = true;
				grp.add( f );
				this.flames.push( f );
			}
		}
		g.scene.add( grp );
		this.obj = grp;
		this.src = this.mgr.lights?.add( {
			pos: this.pos, lift: this.kind === 'stove' ? 0.2 : 0.45, color: this.kind === 'stove' ? 0x9ab8ff : 0xff8a3a,
			intensity: this.kind === 'stove' ? 2.5 : 38, range: this.kind === 'stove' ? 3 : 16, flicker: true, on: this.lit, priority: this.kind === 'stove' ? 1 : 2.5,
		} );
		this.refresh();
	}

	refresh() {
		for ( const f of this.flames ) f.visible = this.lit;
		if ( this.src ) this.src.on = this.lit;
		if ( this.logMat ) {
			// fresh wood when laid, charred once it has burned for a while
			const char = this.lit || this.deadSince !== null ? 1 : 0;
			this.logMat.color.setHex( char ? 0x2a1d14 : 0x6a4a2e );
		}
	}

	update( dt, dh ) {
		const g = this.game;
		this.t += dt;
		if ( this.lit ) {
			// rain drowns a campfire faster; a stove does not care
			const rain = this.kind === 'campfire' && ! g.world.isIndoors?.( this.pos ) ? ( g.weather?.rain || 0 ) : 0;
			this.fuel -= dh * ( 1 + rain * 2 );
			if ( this.fuel <= 0 ) this.burnOut();
		}
		const want = this.lit ? Math.min( 1, 0.35 + this.fuel / 1.5 ) : 0;
		this.strength += ( want - this.strength ) * Math.min( 1, dt * 2 );
		if ( this.flameMat ) { this.flameMat.uniforms.uT.value = this.t; this.flameMat.uniforms.uStrength.value = this.strength; }
		if ( this.emberMat ) this.emberMat.emissiveIntensity = ( this.lit ? 1.8 + Math.sin( this.t * 3.1 ) * 0.4 : ( this.deadSince !== null && g.time.hours - this.deadSince < 1 ? 0.4 : 0 ) ) * Math.max( 0.3, this.strength );
		if ( this.src ) this.src.dim = 0.4 + this.strength * 0.6;
		for ( const f of this.flames ) f.scale.set( 0.8 + this.strength * 0.4, 0.6 + this.strength * 0.6, 1 );
		// crackle when close
		const d = this.pos.distanceTo( g.camera.position );
		if ( this.lit && d < 30 && g.audio?.ctx ) {
			if ( ! this.snd ) { ensureItemSound( g.audio, 'fire_loop' ); this.snd = g.audio.loop( 'fire_loop', { pos: this.pos, vol: 0, bus: 'sfx', ref: 2.5 } ); }
			this.snd?.set( ( this.kind === 'stove' ? 0.12 : 0.55 ) * this.strength, this.kind === 'stove' ? 1.6 : 1, this.pos );
		} else if ( this.snd ) { this.snd.stop(); this.snd = null; }
		// standing in the fire hurts
		if ( this.lit && this.kind === 'campfire' ) {
			const p = g.player.pos;
			if ( ! g.player.vehicle && Math.hypot( p.x - this.pos.x, p.z - this.pos.z ) < 0.38 && Math.abs( p.y - this.pos.y ) < 0.8 ) g.survival?.hurt?.( dt * 7, 'burn', { cause: 'a campfire' } );
		}
	}

	light() { this.lit = true; this.deadSince = null; this.refresh(); }
	burnOut() {
		this.fuel = 0; this.lit = false; this.deadSince = this.game.time.hours;
		this.refresh();
	}
	putOut() { this.lit = false; this.deadSince = this.game.time.hours; this.refresh(); }

	serialize() {
		const r = ( v ) => Math.round( v * 100 ) / 100;
		return { k: this.kind, p: [ r( this.pos.x ), r( this.pos.y ), r( this.pos.z ) ], y: r( this.yaw ), lit: this.lit, fuel: r( this.fuel ), uses: this.uses, cond: this.cond, born: r( this.born ), dead: this.deadSince };
	}

	dispose() {
		this.game.scene.remove( this.obj );
		this.flameMat?.dispose(); this.logMat?.dispose(); this.emberMat?.dispose();
		if ( this.src ) this.mgr.lights?.remove( this.src );
		this.snd?.stop();
	}
}
