// Procedural item models. Builders are registered per model type; an ItemDef's `model` spec picks one:
//   registerModelBuilder( 'gun', ( spec, def ) => THREE.Object3D )
//   buildItemModel( def ) -> THREE.Object3D (cached template; clone() it for instances)
// Convention: the model's origin is at the centre of its bottom face (it rests on the ground at y = 0),
// its long axis along +x, metres, meshes may share materials.
//
// Also here: modelInfo( def ) (bounds of the template, cached) and instanceParts( def ) (the template's meshes
// merged per material, transforms baked in — what the world item instancer draws). Untextured opaque parts (buttons,
// zips, tin lids, trims) merge further into a few shared vertex-coloured materials, so most items are 1-2 draws.
// The builders for food, clothing and gear live in src/game/items/models/*.js; weapon builders are registered
// by the weapons module ('gun', 'melee', 'mag', 'ammo_box', 'attachment', 'throwable').
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from './Materials.js';
import { registerFoodModels } from '../game/items/models/food.js';
import { registerClothingModels } from '../game/items/models/clothing.js';
import { registerGearModels } from '../game/items/models/gear.js';
import { registerDomainModels } from '../game/items/models/ext/index.js';

const builders = new Map();
const cache = new Map();
const infoCache = new Map();
const partsCache = new Map();

const listeners = new Set();

export function registerModelBuilder( type, fn ) {
	builders.set( type, fn );
	sigCache.delete( type );
	// a late registration (the weapons module loads after this one) replaces placeholder models built earlier
	const stale = [];
	for ( const [ id, obj ] of cache ) if ( obj.userData.fallback && obj.userData.type === type ) { cache.delete( id ); infoCache.delete( id ); partsCache.delete( id ); stale.push( id ); }
	for ( const fn2 of listeners ) { try { fn2( type, stale ); } catch ( e ) { console.error( e ); } }
}
export const hasModelBuilder = ( type ) => builders.has( type );

// called with ( type, staleIds ) whenever a builder registers (the world item renderer rebuilds placeholders)
export function onModelBuilder( fn ) { listeners.add( fn ); return () => listeners.delete( fn ); }

// a short hash of a builder's source: cached icons re-render when the code that draws them changes
const sigCache = new Map();
export function builderSignature( type ) {
	let s = sigCache.get( type );
	if ( s !== undefined ) return s;
	const fn = builders.get( type );
	if ( ! fn ) return 'none';
	const src = fn.toString();
	let h = 2166136261;
	for ( let i = 0; i < src.length; i ++ ) { h ^= src.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	s = ( h >>> 0 ).toString( 36 );
	sigCache.set( type, s );
	return s;
}

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

// the shared material an untextured opaque part draws with (its colour moves into the vertices): matte, glossy or
// metal, per side; roughness and metalness snap to the bucket's, which small parts never show
const plainMats = new Map();
function plainBucket( m ) {
	if ( ! m?.isMeshStandardMaterial || m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.alphaMap || m.aoMap || m.emissiveMap
		|| m.transparent || m.alphaTest > 0 || m.vertexColors || m.userData.layer || ( m.emissiveIntensity > 0 && m.emissive.getHex() !== 0 ) ) return null;
	const kind = m.metalness > 0.5 ? 'metal' : m.roughness < 0.45 ? 'gloss' : 'matte';
	const key = kind + ':' + m.side;
	let mat = plainMats.get( key );
	if ( ! mat ) {
		mat = new THREE.MeshStandardMaterial( { color: 0xffffff, vertexColors: true, side: m.side,
			roughness: kind === 'metal' ? 0.35 : kind === 'gloss' ? 0.35 : 0.8, metalness: kind === 'metal' ? 0.85 : 0 } );
		patchMaterial( mat, 'item' );
		mat.name = 'item-plain-' + key;
		plainMats.set( key, mat );
	}
	return mat;
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
		const plain = plainBucket( mats[ 0 ] );
		const key = plain || mats[ 0 ];
		let g = groups.get( key );
		if ( ! g ) { g = { material: key, geos: [], layer: o.layers.mask & 2 ? 1 : 0, colored: !! plain }; groups.set( key, g ); }
		let geo = o.geometry.clone();
		// keep only what every part has, so they merge
		for ( const name of Object.keys( geo.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( name ) ) geo.deleteAttribute( name );
		if ( ! geo.attributes.uv ) geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( geo.attributes.position.count * 2 ), 2 ) );
		if ( ! geo.attributes.normal ) geo.computeVertexNormals();
		if ( geo.index ) geo = geo.toNonIndexed();
		geo.clearGroups();
		geo.applyMatrix4( o.matrixWorld );
		if ( plain ) {
			// the part's own colour (linear), per vertex
			const c = mats[ 0 ].color, n = geo.attributes.position.count, col = new Float32Array( n * 3 );
			for ( let i = 0; i < n; i ++ ) { col[ i * 3 ] = c.r; col[ i * 3 + 1 ] = c.g; col[ i * 3 + 2 ] = c.b; }
			geo.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) );
		}
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
registerDomainModels( registerModelBuilder );
