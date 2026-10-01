// The render side of one vehicle: meshes built from the shared per-type geometries (models/index.js),
// one body material per vehicle (paint, dirt, rust, burn and the lamp channels are its uniforms) and
// the level of detail:
//   'active'  body + glass + separate wheels / steering wheel / moving parts (the driven or moving vehicle)
//   'parked'  body with the wheels and steering wheel merged in + glass (2 draw calls)
//   'far'     one merged mesh with dark glass (1 draw call)
//   'hidden'  nothing drawn
import * as THREE from 'three';
import { getModel } from './models/index.js';
import { Kit } from './kit.js';
import { riderKit } from './models/parts.js';
import { makeBodyMaterial, makeGlassMaterial, makeRotorDiscMaterial, EMIT_CHANNELS } from './materials.js';
import { LAYER_POST } from '../render/Renderer.js';
import { setDynamic } from '../render/post/Motion.js';

// lamp channels of the body material (kit.js MAT presets)
export const EMIT = { head: 1, tail: 2, reverse: 3, indL: 4, indR: 5, red: 6, blue: 7, gauge: 8, nav: 9, strobe: 10 };

const parkedCache = new Map();

// body + wheels + steering wheel + static parts merged, for vehicles standing still near the camera
function parkedGeometry( m ) {
	let g = parkedCache.get( m.name );
	if ( g ) return g;
	const k = new Kit();
	k.addBuilt( m.near );
	if ( m.wheelGeo ) for ( const w of m.wheels ) if ( ! w.hidden ) k.addBuilt( m.wheelGeo, { p: [ w.x, w.y, w.z ], s: [ w.side, 1, 1 ] } );
	if ( m.steering ) {
		const S = m.P.steer;
		k.addBuilt( m.steering, { p: [ S.x, S.y, - S.f ], r: [ - S.tilt, 0, 0 ] } );
	}
	const mats = {};
	for ( const p of m.parts ) {
		const M = new THREE.Matrix4().compose( new THREE.Vector3( ...p.pos ), new THREE.Quaternion().setFromEuler( new THREE.Euler( ...( p.rot || [ 0, 0, 0 ] ) ) ), new THREE.Vector3( 1, 1, 1 ) );
		if ( p.parent && mats[ p.parent ] ) M.premultiply( mats[ p.parent ] );
		mats[ p.name ] = M;
		if ( ! p.noMerge ) k.addBuilt( p.geo, M );
	}
	g = k.build();
	parkedCache.set( m.name, g );
	return g;
}

const riderCache = new Map();

// where the rider's hands and feet go for a seat of a model (model frame)
export function riderPose( model, kind, seat ) {
	const P = model.P, S = P.steer;
	const pose = { hip: seat.pos, eye: seat.eye, hands: null, feet: null };
	// a point in the steering column's frame (rotation.x = -tilt about the column's base)
	const col = ( lx, ly, lz ) => { const a = - S.tilt; return [ S.x + lx, S.y + ly * Math.cos( a ) - lz * Math.sin( a ), - S.f + ly * Math.sin( a ) + lz * Math.cos( a ) ]; };
	if ( seat.driver && S ) {
		if ( S.axis === 'y' ) { const w = kind === 'bike' ? 0.33 : 0.3; pose.hands = [ col( - w, kind === 'bike' ? 0.135 : 0.04, kind === 'bike' ? 0.07 : 0.04 ), col( w, kind === 'bike' ? 0.135 : 0.04, kind === 'bike' ? 0.07 : 0.04 ) ]; }
		else { const r = ( S.r ?? 0.19 ) * 0.95; pose.hands = [ col( - r * 0.87, r * 0.5, 0.02 ), col( r * 0.87, r * 0.5, 0.02 ) ]; }
	} else if ( seat.driver && kind === 'heli' ) pose.hands = [ [ 0.16, 0.86, - 0.86 ], [ 0.42, 1.12, - 0.84 ] ];
	if ( kind === 'bike' ) pose.feet = seat.driver ? [ [ - 0.21, 0.4, 0.14 ], [ 0.21, 0.4, 0.14 ] ] : [ [ - 0.2, 0.46, 0.55 ], [ 0.2, 0.46, 0.55 ] ];
	else if ( kind === 'boat' && model.name === 'jetski' ) pose.feet = [ [ - 0.36, 0.5, seat.pos[ 2 ] + 0.05 ], [ 0.36, 0.5, seat.pos[ 2 ] + 0.05 ] ];
	else {
		const floor = P.wells?.[ 0 ]?.floor ?? seat.pos[ 1 ] - 0.45;
		const y = Math.max( floor + 0.06, seat.pos[ 1 ] - 0.42 );
		pose.feet = [ - 1, 1 ].map( s => [ seat.pos[ 0 ] + s * 0.13, y, seat.pos[ 2 ] - 0.52 ] );
	}
	return pose;
}

export class VehicleVisual {
	// look: { paint, paint2, metallic, dirt, rust, fade, burnt, crack, gdirt }
	constructor( model, look = {} ) {
		const m = typeof model === 'string' ? getModel( model ) : model;
		this.model = m;
		this.look = look;
		this.group = new THREE.Group();
		this.group.name = 'vehicle-' + m.name;
		// motion vectors for the TAA while it (or a part of it) moves; parked it stays on the static path
		setDynamic( this.group );
		this.mat = makeBodyMaterial( {
			paint: look.paint ?? 0xb0b4b8, paint2: look.paint2 ?? 0xf2f2f0, metallic: look.metallic ?? 0.4,
			dirt: look.dirt ?? 0, rust: look.rust ?? 0, fade: look.fade ?? 0, dent: look.dent ?? 0, height: m.bounds.max.y,
		} );
		if ( look.burnt ) this.mat.userData.u.uBurnt.value = 1;
		this.emit = this.mat.userData.u.uEmit.value; // live array of EMIT_CHANNELS lamp levels
		this.glassMat = m.glass ? makeGlassMaterial( { crack: look.crack || 0, dirt: look.gdirt || 0, tint: m.P.glassTint } ) : null;

		// level meshes (created lazily)
		this.meshes = {};
		this.wheels = []; // { pivot (steer, suspension), spin (Mesh), w (model wheel) }
		this.steering = null;
		this.parts = {}; // name -> Object3D for animated parts
		this.lod = null;
		this.shadow = true;
	}

	_mesh( geo, mat, name ) {
		const me = new THREE.Mesh( geo, mat );
		me.name = name;
		me.castShadow = this.shadow; me.receiveShadow = true;
		me.matrixAutoUpdate = false; me.updateMatrix();
		return me;
	}

	_build( level ) {
		const m = this.model;
		const o = { root: new THREE.Group() };
		o.root.matrixAutoUpdate = false;
		if ( level === 'far' ) {
			o.root.add( this._mesh( m.far, this.mat, 'far' ) );
		} else {
			const bodyGeo = level === 'parked' ? parkedGeometry( m ) : m.near;
			o.root.add( this._mesh( bodyGeo, this.mat, 'body' ) );
			if ( m.glass ) {
				const gl = new THREE.Mesh( m.glass, this.glassMat );
				gl.layers.set( LAYER_POST );
				gl.matrixAutoUpdate = false; gl.updateMatrix();
				gl.name = 'glass';
				o.root.add( gl );
			}
			if ( level === 'active' ) {
				o.wheels = [];
				if ( m.wheelGeo ) for ( const w of m.wheels ) {
					const pivot = new THREE.Group();
					pivot.position.set( w.x, w.y, w.z );
					const spin = new THREE.Mesh( m.wheelGeo, this.mat );
					spin.scale.x = w.side;
					spin.castShadow = this.shadow; spin.receiveShadow = true;
					spin.visible = ! w.hidden;
					pivot.add( spin );
					o.root.add( pivot );
					o.wheels.push( { pivot, spin, w } );
				}
				if ( m.steering ) {
					const S = m.P.steer;
					const col = new THREE.Group();
					col.position.set( S.x, S.y, - S.f );
					col.rotation.x = - S.tilt;
					const sw = new THREE.Mesh( m.steering, this.mat );
					sw.castShadow = false; sw.receiveShadow = true;
					col.add( sw );
					o.root.add( col );
					o.steering = sw;
				}
				o.parts = {};
				for ( const p of m.parts ) {
					const piv = new THREE.Group();
					piv.position.fromArray( p.pos );
					if ( p.rot ) piv.rotation.fromArray( p.rot );
					const pm = new THREE.Mesh( p.geo, this.mat );
					pm.castShadow = this.shadow && ! p.noShadow; pm.receiveShadow = true;
					piv.add( pm );
					if ( p.disc ) {
						// motion-blurred disc shown while the blades spin fast
						const d = new THREE.Mesh( p.disc, this.discMat ||= makeRotorDiscMaterial() );
						d.layers.set( LAYER_POST );
						d.visible = false;
						piv.add( d );
						o.parts[ p.name + 'Disc' ] = d;
					}
					// nested parts (an outboard's propeller turns with the motor)
					( p.parent && o.parts[ p.parent ] ? o.parts[ p.parent ] : o.root ).add( piv );
					o.parts[ p.name ] = piv;
					o.parts[ p.name + 'Mesh' ] = pm;
				}
			}
		}
		return o;
	}

	// switch the level of detail ('active' | 'parked' | 'far' | 'hidden')
	setLOD( level ) {
		if ( level === this.lod ) return;
		if ( this.lod && this.meshes[ this.lod ] ) this.group.remove( this.meshes[ this.lod ].root );
		this.lod = level;
		if ( level === 'hidden' ) { this.group.visible = false; return; }
		this.group.visible = true;
		const o = this.meshes[ level ] ||= this._build( level );
		this.group.add( o.root );
		this.wheels = o.wheels || [];
		this.steering = o.steering || null;
		this.parts = o.parts || {};
	}

	// the player's figure in a seat (-1: nobody); `head` false for the first-person view from inside it, `arms` false
	// when the modelled first-person arms (driver.js) take their place
	setRider( seats, kind, i, head = true, arms = true ) {
		const key = i < 0 ? null : `${this.model.name}:${i}:${head ? 1 : 0}:${arms ? 1 : 0}`;
		if ( key === this.riderKey ) return;
		this.riderKey = key;
		if ( this.rider ) { this.group.remove( this.rider ); this.rider = null; }
		if ( ! key ) return;
		let g = riderCache.get( key );
		if ( ! g ) { g = riderKit( riderPose( this.model, kind, seats[ i ] ), head, arms ); riderCache.set( key, g ); }
		const m = new THREE.Mesh( g, this.mat );
		m.castShadow = true; m.receiveShadow = true;
		m.matrixAutoUpdate = false; m.updateMatrix();
		m.name = 'rider';
		this.rider = m;
		this.group.add( m );
	}

	setShadow( on ) {
		if ( on === this.shadow ) return;
		this.shadow = on;
		this.group.traverse( o => { if ( o.isMesh && o.material === this.mat ) o.castShadow = on; } );
	}

	// pose the wheels: states[ i ] = { y (centre height in the model frame), steer (rad), spin (rad) }
	poseWheels( states ) {
		for ( let i = 0; i < this.wheels.length; i ++ ) {
			const W = this.wheels[ i ], s = states[ i ];
			if ( ! s ) continue;
			W.pivot.position.y = s.y;
			W.pivot.rotation.y = s.steer;
			W.spin.rotation.x = s.spin;
		}
	}

	// the steering wheel turns about its hub (z), handlebars about their column (y)
	setSteeringWheel( a ) { this.steerAngle = a; if ( this.steering ) this.steering.rotation[ this.model.P.steer?.axis || 'z' ] = a; }

	setLook( look ) {
		const u = this.mat.userData.u;
		if ( look.paint != null ) u.uPaint.value.set( look.paint );
		if ( look.paint2 != null ) u.uPaint2.value.set( look.paint2 );
		if ( look.dirt != null ) u.uDirt.value = look.dirt;
		if ( look.rust != null ) u.uRust.value = look.rust;
		if ( look.dent != null ) u.uDent.value = look.dent;
		if ( look.burnt != null ) u.uBurnt.value = look.burnt;
		if ( look.crack != null && this.glassMat ) this.glassMat.userData.u.uCrack.value = look.crack;
	}

	dispose() {
		if ( this.group.parent ) this.group.parent.remove( this.group );
		this.mat.dispose();
		this.glassMat?.dispose();
		this.discMat?.dispose();
		this.meshes = {};
	}
}

export { EMIT_CHANNELS };
