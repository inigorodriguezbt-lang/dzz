// In-page check that game.roads.dispose() frees its GPU geometry and physics boxes (destructive: run last).
( () => {
	const g = window.__game || window.__app?.game, R = g.roads, gl = window.__app?.renderer?.gl;
	let owned = 0;
	for ( const b of g.physics.boxes.values() ) if ( b.owner === R || b.owner?.wreck ) owned ++;
	const geo0 = gl?.info.memory.geometries;
	let meshes = 0;
	R.group.traverse( o => { if ( o.isMesh || o.isLine ) meshes ++; } );
	R.dispose();
	let left = 0;
	for ( const b of g.physics.boxes.values() ) if ( b.owner === R || b.owner?.wreck ) left ++;
	return { boxesBefore: owned, boxesAfter: left, meshes, inScene: !! R.group.parent, geometriesBefore: geo0, geometriesAfter: gl?.info.memory.geometries, cells: R.cells.size };
} )()
