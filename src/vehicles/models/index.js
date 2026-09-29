// Builds (once per type) and caches the vehicle geometries:
//   near  body + interior (one draw call), glass (layer 1), wheel, steering wheel, moving parts
//   far   body + dark glass + wheels merged (one draw call for distant vehicles)
import * as THREE from 'three';
import { Kit } from '../kit.js';
import { buildBody, wheelKit, steeringKit } from './body.js';
import { CARS } from './cars.js';
import { CRAFT } from './craft.js';

const cache = new Map();

export function modelNames() { return [ ...Object.keys( CARS ), ...Object.keys( CRAFT ) ]; }

export function getModel( name ) {
	let m = cache.get( name );
	if ( m ) return m;
	const def = CARS[ name ] ? CARS[ name ]() : CRAFT[ name ] ? CRAFT[ name ]() : null;
	if ( ! def ) throw new Error( 'unknown vehicle model ' + name );
	m = def.build ? def.build( def ) : assembleCar( def );
	m.name = name;
	cache.set( name, m );
	return m;
}

export function assembleCar( P ) {
	const { kit, glass } = buildBody( P );
	const W = P.wheel || {};
	const wheelGeo = wheelKit( P.wheelR, P.wheelW, W.style || 'alloy', W ).build();
	const axles = P.axles || [ P.axleR, P.axleF ];
	const front = Math.max( ...axles );
	const wheels = [];
	for ( const af of axles ) for ( const side of [ - 1, 1 ] ) {
		wheels.push( { x: side * ( P.track / 2 ), y: P.wheelR, z: - af, R: P.wheelR, W: P.wheelW, side, steer: af === front ? 1 : ( P.rearSteer && af === Math.min( ...axles ) ? - 0.3 : 0 ), front: af === front } );
	}
	return finish( P, kit, glass, wheelGeo, wheels );
}

// common tail of every builder: near / far / glass geometries and the meta the physics needs
export function finish( P, kit, glass, wheelGeo, wheels, extras = {} ) {
	const near = kit.build();
	const far = new Kit();
	far.parts = kit.parts.filter( p => p.tag !== 'near' ).concat( glass.parts );
	if ( wheelGeo ) for ( const w of wheels ) if ( ! w.hidden ) far.addBuilt( wheelGeo, { p: [ w.x, w.y, w.z ], s: [ w.side, 1, 1 ] } );
	for ( const e of extras.farParts || [] ) far.addBuilt( e.geo, e.t );
	const farGeo = far.build();
	const glassGeo = glass.parts.length ? glass.build() : null;
	const steering = P.steer && P.steerStyle !== 'none' ? steeringKit( P.steer.r, P.steerStyle ).build() : null;
	near.computeBoundingBox();
	const bb = near.boundingBox.clone();
	return {
		P, near, far: farGeo, glass: glassGeo, wheelGeo, wheels, steering, bounds: bb,
		parts: extras.parts || [], // [ { name, geo, pos: [x,y,z], axis } ] spinning / moving parts
	};
}
