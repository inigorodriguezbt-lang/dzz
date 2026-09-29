// Procedural item models. Builders are registered per model type; an ItemDef's `model` spec picks one:
//   registerModelBuilder( 'gun', ( spec, def ) => THREE.Object3D )
//   buildItemModel( def ) -> THREE.Object3D (cached template; clone() it for instances)
// Convention: the model's origin is at the centre of its bottom face (it rests on the ground at y = 0),
// its long axis along +x, metres, meshes may share materials.
//
// Also here: modelInfo( def ) (bounds of the template, cached) and instanceParts( def ) (the template's meshes
// merged per material, transforms baked in — what the world item instancer draws).
// The builders for food, clothing and gear live in src/game/items/models/*.js; weapon builders are registered
// by the weapons module ('gun', 'melee', 'mag', 'ammo_box', 'attachment', 'throwable').
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerFoodModels } from '../game/items/models/food.js';
import { registerClothingModels } from '../game/items/models/clothing.js';
import { registerGearModels } from '../game/items/models/gear.js';

const builders = new Map();
const cache = new Map();
const infoCache = new Map();
const partsCache = new Map();

export function registerModelBuilder( type, fn ) {
	builders.set( type, fn );
	// a late registration (the weapons module loads after this one) replaces placeholder models built earlier
	for ( const [ id, obj ] of cache ) if ( obj.userData.fallback && obj.userData.type === type ) { cache.delete( id ); infoCache.delete( id ); partsCache.delete( id ); }
}
export const hasModelBuilder = ( type ) => builders.has( type );

export function buildItemModel( def ) {
	if ( cache.has( def.id ) ) return cache.get( def.id );
	const spec = def.model || { type: 'box' };
	let fn = builders.get( spec.type ), fallback = false;
	if ( ! fn ) { fn = builders.get( 'box' ); fallback = true; }
	let obj;
	try { obj = fn( spec, def ); } catch ( e ) { console.error( 'model', def.id, e ); obj = builders.get( 'box' )( { type: 'box' }, def ); fallback = true; }
	obj.name = def.id;
	obj.userData.type = spec.type;
	obj.userData.fallback = fallback;
	obj.updateMatrixWorld( true );
	cache.set( def.id, obj );
	return obj;
}

// { box: Box3, size: Vector3, centre: Vector3, radius } of the template in its own frame
export function modelInfo( def ) {
	let info = infoCache.get( def.id );
	if ( info ) return info;
	const obj = buildItemModel( def );
	obj.updateMatrixWorld( true );
	const box = new THREE.Box3();
	obj.traverse( ( o ) => {
		if ( ! o.isMesh ) return;
		if ( ! o.geometry.boundingBox ) o.geometry.computeBoundingBox();
		box.union( o.geometry.boundingBox.clone().applyMatrix4( o.matrixWorld ) );
	} );
	if ( box.isEmpty() ) box.set( new THREE.Vector3( - 0.1, 0, - 0.1 ), new THREE.Vector3( 0.1, 0.1, 0.1 ) );
	const size = box.getSize( new THREE.Vector3() ), centre = box.getCenter( new THREE.Vector3() );
	info = { box, size, centre, radius: size.length() / 2 };
	infoCache.set( def.id, info );
	return info;
}

// the template's meshes merged per material: [ { geometry, material, layer, castShadow } ]
export function instanceParts( def ) {
	let parts = partsCache.get( def.id );
	if ( parts ) return parts;
	const obj = buildItemModel( def );
	obj.updateMatrixWorld( true );
	const groups = new Map();
	obj.traverse( ( o ) => {
		if ( ! o.isMesh || ! o.geometry ) return;
		const mats = Array.isArray( o.material ) ? o.material : [ o.material ];
		const key = mats[ 0 ];
		let g = groups.get( key );
		if ( ! g ) { g = { material: key, geos: [], layer: o.layers.mask & 2 ? 1 : 0 }; groups.set( key, g ); }
		let geo = o.geometry.clone();
		// keep only what every part has, so they merge
		for ( const name of Object.keys( geo.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( name ) ) geo.deleteAttribute( name );
		if ( ! geo.attributes.uv ) geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( geo.attributes.position.count * 2 ), 2 ) );
		if ( ! geo.attributes.normal ) geo.computeVertexNormals();
		if ( geo.index ) geo = geo.toNonIndexed();
		geo.clearGroups();
		geo.applyMatrix4( o.matrixWorld );
		g.geos.push( geo );
	} );
	parts = [];
	for ( const g of groups.values() ) {
		const geometry = g.geos.length === 1 ? g.geos[ 0 ] : mergeGeometries( g.geos, false );
		if ( ! geometry ) continue;
		geometry.computeBoundingSphere();
		parts.push( { geometry, material: g.material, layer: g.layer, castShadow: ! g.material.transparent } );
	}
	partsCache.set( def.id, parts );
	return parts;
}

// ---- builders ------------------------------------------------------------------------------------------

registerFoodModels( registerModelBuilder );
registerClothingModels( registerModelBuilder );
registerGearModels( registerModelBuilder );
