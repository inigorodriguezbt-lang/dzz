// Procedural item models. Builders are registered per model type; an ItemDef's `model` spec picks one:
//   registerModelBuilder( 'gun', ( spec, def ) => THREE.Object3D )
//   buildItemModel( def ) -> THREE.Object3D (cached template; clone() it for instances)
// Convention: the model's origin is at the centre of its bottom face (it rests on the ground at y = 0),
// its long axis along +x, metres, meshes may share materials. Placeholder builder: a small box.
import * as THREE from 'three';

const builders = new Map();
const cache = new Map();

export function registerModelBuilder( type, fn ) { builders.set( type, fn ); }

export function buildItemModel( def ) {
	if ( cache.has( def.id ) ) return cache.get( def.id );
	const spec = def.model || { type: 'box' };
	const fn = builders.get( spec.type ) || builders.get( 'box' );
	let obj;
	try { obj = fn( spec, def ); } catch ( e ) { console.error( 'model', def.id, e ); obj = builders.get( 'box' )( { type: 'box' }, def ); }
	obj.name = def.id;
	cache.set( def.id, obj );
	return obj;
}

registerModelBuilder( 'box', ( spec ) => {
	const s = spec.size || [ 0.2, 0.1, 0.12 ];
	const m = new THREE.Mesh( new THREE.BoxGeometry( s[ 0 ], s[ 1 ], s[ 2 ] ), new THREE.MeshStandardMaterial( { color: spec.color || 0x8a8f96, roughness: 0.7 } ) );
	m.position.y = s[ 1 ] / 2;
	const g = new THREE.Group(); g.add( m );
	return g;
} );
