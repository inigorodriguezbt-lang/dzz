// In-page checks of the roads API (run in the roads preview or the game via test/roads-probe.mjs / test/probe.mjs):
// wreck interaction + loot container + persistence, nearestRoad, spawnPoints, physics colliders.
( () => {
	const g = window.__game || window.__app?.game;
	const R = g.roads;
	const out = {};
	const V = g.camera.position.constructor;
	const w = R.lootable.slice().sort( ( a, b ) => ( ( a.x - g.camera.position.x ) ** 2 + ( a.z - g.camera.position.z ) ** 2 ) - ( ( b.x - g.camera.position.x ) ** 2 + ( b.z - g.camera.position.z ) ** 2 ) )[ 0 ];
	out.lootable = R.lootable.length;
	if ( w ) {
		const fwd = new V( - Math.sin( w.yaw ), 0, - Math.cos( w.yaw ) );
		const res = [];
		for ( const along of [ 1.8, - 0.3 ] ) {
			// stand beside the car, look at a point on its side
			const target = new V( w.x - fwd.x * along, w.y + 0.9, w.z - fwd.z * along );
			const side = new V( fwd.z, 0, - fwd.x );
			const eye = target.clone().addScaledVector( side, 2.6 ).setY( w.y + 1.6 );
			g.player.pos.set( eye.x, eye.y - 1.6, eye.z );
			const dir = target.clone().sub( eye ).normalize();
			const provs = g._prov ? [ g._prov ] : g.interact.providers;
			let cand = null;
			for ( const p of provs ) { const l = p( { origin: eye, dir }, 4.1 ); if ( l && l.length && l[ 0 ].id?.startsWith( 'car:' ) ) cand = l[ 0 ]; }
			res.push( cand ? { label: cand.label, sub: cand.sub, t: + cand.t.toFixed( 2 ), id: cand.id } : null );
			if ( cand ) {
				const c = R.container( w, cand.id.endsWith( ':t' ) ? 'trunk' : 'glovebox', cand.id );
				c.fresh = false;
				res.push( { container: c.label, cap: c.capacity, items: c.items.map( s => s.id ) } );
			}
		}
		out.wreck = { type: w.type, res };
		const save = { world: {} };
		R.serialize( save );
		out.saved = Object.keys( save.world.wrecks );
		R.load( save );
		out.reloadedSame = out.saved.every( k => JSON.stringify( save.world.wrecks[ k ] ) === JSON.stringify( R.saved[ k ] ) );
	}
	const nr = R.nearestRoad( g.camera.position, 60 );
	out.nearestRoad = nr && { kind: nr.kind, name: nr.name, lanes: nr.lanes, width: nr.width, dist: + nr.dist.toFixed( 2 ), dir: [ + nr.dir.x.toFixed( 2 ), + nr.dir.z.toFixed( 2 ) ] };
	const sp = R.spawnPoints( g.camera.position, 120, 6 );
	out.spawn = sp.map( s => [ Math.round( s.pos.x ), Math.round( s.pos.z ), + s.yaw.toFixed( 2 ) ] );
	// parking lots: the nearest one, a point inside it, the vegetation's obstacle list
	const L = R.lots.slice().sort( ( a, b ) => ( ( a.x - g.camera.position.x ) ** 2 + ( a.z - g.camera.position.z ) ** 2 ) - ( ( b.x - g.camera.position.x ) ** 2 + ( b.z - g.camera.position.z ) ** 2 ) )[ 0 ];
	out.lots = R.lots.length;
	out.lotAt = !! L && R.lotAt( L.x, L.z ) === L && R.lotAt( L.x + L.bx * ( L.lb / 2 + 3 ), L.z + L.bz * ( L.lb / 2 + 3 ) ) !== L;
	out.lotObstacles = R.lotObstacles().length === R.lots.length * 5;
	out.boxes = g.physics.boxes.size;
	// street furniture stands in a collider: every loaded streetlight / pole / signal / hydrant has a box at its foot
	{
		let n = 0, hit = 0;
		for ( const c of R.cells.values() ) {
			if ( ! c.inst ) continue;
			for ( const key of [ 'streetlight', 'streetlight2', 'pole', 'poleT', 'signal', 'hydrant' ] ) {
				const s = c.inst.get( key );
				if ( ! s ) continue;
				for ( let k = 0; k < s.n; k ++ ) {
					const x = s.p[ k * 2 ], z = s.p[ k * 2 + 1 ];
					n ++;
					if ( g.physics.near( x, z, 0.25 ).some( b => b.owner === R && Math.abs( b.x - x ) < 0.3 && Math.abs( b.z - z ) < 0.3 ) ) hit ++;
				}
			}
		}
		out.furnitureColliders = n + ' / ' + hit;
	}
	out.cells = [ ...R.cells.values() ].reduce( ( a, c ) => { a[ 'lod' + c.lod ] = ( a[ 'lod' + c.lod ] || 0 ) + 1; return a; }, {} );
	const inst = {};
	for ( const b of R.batches ) if ( b.n ) inst[ b.name ] = b.n;
	out.instances = inst;
	return out;
} )()
