// In-game helpers for interior screenshots (dev only): loaded by a buildings-game.mjs step with
//   ( await import( '/test/preview/buildings-tour.js' ) ).install( a )
// then T.room( bi, si, kind, k, [ fx, fz ], [ tx, ty, tz ] ) stands in room `kind` (k-th of that kind on storey si)
// at room fractions (fx, fz), looking at room fractions (tx, tz) and height ty over the floor.
import { makePlan } from '/src/city/buildings/plan.js';

export function install( a ) {
	const g = a.game, C = g.city;
	const T = window.T = {};
	const plans = new Map();
	T.plan = ( bi ) => plans.get( bi ) || plans.set( bi, makePlan( C.rec( bi ), C.cities ) ).get( bi );
	T.place = ( x, z, y ) => {
		g.player.flying = false; g.player.noclip = false;
		g.player.pos.set( x, y, z ); g.player.vel?.set?.( 0, 0, 0 );
		C.relocate?.( g.player.pos );
	};
	T.look = ( tx, ty, tz ) => {
		const p = g.player.pos, ey = p.y + 1.62;
		const dx = tx - p.x, dz = tz - p.z, dy = ty - ey;
		g.player.yaw = Math.atan2( - dx, - dz );
		g.player.pitch = Math.atan2( dy, Math.hypot( dx, dz ) );
	};
	T.rooms = ( bi, si = 0 ) => T.plan( bi ).storeys[ si ].rooms.map( r => `${r.k}${r.shop ? '/' + r.shop : ''} ${( r.x1 - r.x0 ).toFixed( 1 )}x${( r.z1 - r.z0 ).toFixed( 1 )}` );
	T.room = ( bi, si, kind, k = 0, from = [ 0.5, 0.5 ], to = [ 0.5, 1.2, 1 ] ) => {
		const P = T.plan( bi ), st = P.storeys[ si ];
		const rm = st.rooms.filter( r => r.k === kind )[ k ];
		if ( ! rm ) return 'no ' + kind;
		const r = C.rec( bi );
		const at = ( fx, fz ) => C.toWorld( r, rm.x0 + ( rm.x1 - rm.x0 ) * fx, rm.z0 + ( rm.z1 - rm.z0 ) * fz );
		// a free spot near the asked one (nothing solid between the ankles and the head)
		const clear = ( x, z ) => ! g.physics.near( x, z, 0.45 ).some( b => b.maxY > st.y + 0.25 && b.minY < st.y + 1.9 && g.physics.constructor.inside?.( b, x, z, 0.35 ) );
		let [ x, z ] = at( from[ 0 ], from[ 1 ] );
		if ( ! clear( x, z ) ) {
			found: for ( let r = 0.15; r < 2.5; r += 0.15 ) for ( let k = 0; k < 12; k ++ ) {
				const fx = from[ 0 ] + Math.cos( k / 12 * 6.283 ) * r / ( rm.x1 - rm.x0 ), fz = from[ 1 ] + Math.sin( k / 12 * 6.283 ) * r / ( rm.z1 - rm.z0 );
				if ( fx < 0.03 || fx > 0.97 || fz < 0.03 || fz > 0.97 ) continue;
				const [ px, pz ] = at( fx, fz );
				if ( clear( px, pz ) ) { x = px; z = pz; break found; }
			}
		}
		T.place( x, z, st.y + 0.02 );
		const [ tx, tz ] = at( to[ 0 ], to[ 2 ] );
		T.look( tx, st.y + to[ 1 ], tz );
		T.bi = bi; T.si = si;
		return `${kind} ${( rm.x1 - rm.x0 ).toFixed( 1 )}x${( rm.z1 - rm.z0 ).toFixed( 1 )}`;
	};
	// the interior of building bi is in (its storey si and the ground storey)
	T.ready = ( bi = T.bi, si = T.si ) => { const I = C.interiors.get( bi ); return !! ( I && I.groundReady && I.storeys.get( si )?.ready ); };
	// GPU bytes and triangles of the loaded interiors (all, or building bi), by kind of mesh
	T.mem = ( bi = null ) => {
		const out = { storeys: 0, main: [ 0, 0 ], fine: [ 0, 0 ], decal: [ 0, 0 ], glass: [ 0, 0 ], beam: [ 0, 0 ], boxes: 0 };
		for ( const I of C.interiors.values() ) {
			if ( bi !== null && I.bi !== bi ) continue;
			for ( const st of I.storeys.values() ) {
				if ( ! st.ready ) continue;
				out.storeys ++; out.boxes += st.boxes.length;
				for ( const m of st.meshes ) {
					const k = m.userData.fine ? 'fine' : m.material === C.mats.interior ? 'main' : m.material === C.mats.decal ? 'decal' : m.material === C.mats.glass ? 'glass' : 'beam';
					const geo = m.geometry;
					let b = 0;
					for ( const a of Object.values( geo.attributes ) ) b += a.count * a.itemSize * a.array.BYTES_PER_ELEMENT;
					if ( geo.index ) b += geo.index.count * geo.index.array.BYTES_PER_ELEMENT;
					out[ k ][ 0 ] += b; out[ k ][ 1 ] += ( geo.index ? geo.index.count : 0 ) / 3;
				}
			}
		}
		for ( const k of [ 'main', 'fine', 'decal', 'glass', 'beam' ] ) out[ k ] = `${( out[ k ][ 0 ] / 1048576 ).toFixed( 2 )} MB ${Math.round( out[ k ][ 1 ] / 1000 )}k tris`;
		return out;
	};
	T.hour = ( h ) => { g.time.hours = Math.floor( g.time.hours / 24 ) * 24 + h; };
	T.find = ( type, near = g.player.pos ) => C.locate( type, near );
	T.fov = ( f ) => { g.settings.set?.( 'fov', f ); };
	return 'ok';
}
