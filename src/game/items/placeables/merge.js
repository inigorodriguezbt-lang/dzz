// Fewer draw calls for placed things: a placed shape's meshes merged per material with their transforms baked in
// (a tent of thirteen parts draws in three, a spring trap of fourteen in one). Untextured opaque parts share a few
// vertex-coloured materials, as the world items do (render/ItemModels.js instanceParts). Effects (userData.fx:
// flames, glows) and parts a kind changes later (userData.keep: a water surface) are left as they are.
// Run once per template (models/ext/placeables.js caches them); clones share the merged geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../../../render/Materials.js';

const plainMats = new Map();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

// the shared material an untextured opaque part draws with (its colour moves into the vertices)
function plainBucket( m ) {
	if ( ! m?.isMeshStandardMaterial || m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.alphaMap || m.aoMap || m.emissiveMap
		|| m.transparent || m.alphaTest > 0 || m.vertexColors || m.userData.layer || ( m.emissiveIntensity > 0 && m.emissive.getHex() !== 0 ) ) return null;
	const kind = m.metalness > 0.5 ? 'metal' : m.roughness < 0.45 ? 'gloss' : 'matte';
	const key = kind + ':' + m.side;
	let mat = plainMats.get( key );
	if ( ! mat ) {
		mat = new THREE.MeshStandardMaterial( { color: 0xffffff, vertexColors: true, side: m.side,
			roughness: kind === 'metal' ? 0.35 : kind === 'gloss' ? 0.35 : 0.85, metalness: kind === 'metal' ? 0.85 : 0 } );
		patchMaterial( mat, 'item' );
		mat.name = 'placed-plain-' + key;
		plainMats.set( key, mat );
	}
	return mat;
}

// a part's geometry in the root's frame, reduced to what every part has (position, normal, uv, colour)
function bake( o, colour ) {
	let geo = o.geometry.clone();
	for ( const name of Object.keys( geo.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( name ) ) geo.deleteAttribute( name );
	for ( const name of Object.keys( geo.morphAttributes ) ) delete geo.morphAttributes[ name ];
	if ( ! geo.attributes.normal ) geo.computeVertexNormals();
	if ( ! geo.attributes.uv ) geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( geo.attributes.position.count * 2 ), 2 ) );
	if ( geo.index ) geo = geo.toNonIndexed();
	geo.clearGroups();
	_m.multiplyMatrices( _inv, o.matrixWorld );
	geo.applyMatrix4( _m );
	// a mirrored part would turn inside out once its transform is baked: flip its triangles back
	if ( _m.determinant() < 0 ) {
		for ( const a of [ geo.attributes.position, geo.attributes.normal, geo.attributes.uv ] ) {
			for ( let i = 0; i + 2 < a.count; i += 3 ) for ( let k = 0; k < a.itemSize; k ++ ) {
				const t = a.array[ ( i + 1 ) * a.itemSize + k ];
				a.array[ ( i + 1 ) * a.itemSize + k ] = a.array[ ( i + 2 ) * a.itemSize + k ];
				a.array[ ( i + 2 ) * a.itemSize + k ] = t;
			}
		}
	}
	if ( colour ) {
		const n = geo.attributes.position.count, col = new Float32Array( n * 3 );
		for ( let i = 0; i < n; i ++ ) { col[ i * 3 ] = colour.r; col[ i * 3 + 1 ] = colour.g; col[ i * 3 + 2 ] = colour.b; }
		geo.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) );
	}
	return geo;
}

// merge root's static meshes in place; returns root
export function compact( root ) {
	root.updateMatrixWorld( true );
	_inv.copy( root.matrixWorld ).invert();
	const groups = new Map(), parts = [];
	const walk = ( o ) => {
		if ( o.userData.fx || o.userData.keep || ! o.visible ) return;
		for ( const c of o.children ) walk( c );
		if ( ! o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray( o.material ) || o.children.length || ! o.geometry?.attributes.position ) return;
		const plain = plainBucket( o.material );
		const mat = plain || o.material;
		const key = mat.uuid + '|' + ( o.castShadow ? 1 : 0 ) + '|' + o.layers.mask + '|' + o.renderOrder;
		let g = groups.get( key );
		if ( ! g ) groups.set( key, g = { mat, cast: o.castShadow, layers: o.layers.mask, order: o.renderOrder, geos: [] } );
		g.geos.push( bake( o, plain ? o.material.color : null ) );
		parts.push( o );
	};
	walk( root );
	if ( parts.length < 2 ) return root;
	for ( const o of parts ) o.parent.remove( o );
	// groups left empty go too
	const prune = ( o ) => { for ( const c of [ ...o.children ] ) { prune( c ); if ( c.isGroup && ! c.children.length && ! c.userData.fx && ! c.userData.keep ) o.remove( c ); } };
	prune( root );
	for ( const g of groups.values() ) {
		const geometry = g.geos.length === 1 ? g.geos[ 0 ] : mergeGeometries( g.geos, false );
		if ( ! geometry ) continue;
		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();
		const m = new THREE.Mesh( geometry, g.mat );
		m.castShadow = g.cast;
		m.receiveShadow = true;
		m.layers.mask = g.layers;
		m.renderOrder = g.order;
		root.add( m );
	}
	return root;
}

// meshes drawn by a model (for tests and the draw-call budget)
export function countMeshes( obj ) {
	let n = 0;
	obj.traverse( ( o ) => { if ( ( o.isMesh || o.isSprite ) && o.visible ) n ++; } );
	return n;
}
