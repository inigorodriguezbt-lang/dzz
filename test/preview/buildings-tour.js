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
		const [ x, z ] = at( from[ 0 ], from[ 1 ] );
		T.place( x, z, st.y + 0.02 );
		const [ tx, tz ] = at( to[ 0 ], to[ 2 ] );
		T.look( tx, st.y + to[ 1 ], tz );
		T.bi = bi; T.si = si;
		return `${kind} ${( rm.x1 - rm.x0 ).toFixed( 1 )}x${( rm.z1 - rm.z0 ).toFixed( 1 )}`;
	};
	// the interior of building bi is in (its storey si and the ground storey)
	T.ready = ( bi = T.bi, si = T.si ) => { const I = C.interiors.get( bi ); return !! ( I && I.groundReady && I.storeys.get( si )?.ready ); };
	T.hour = ( h ) => { g.time.hours = Math.floor( g.time.hours / 24 ) * 24 + h; };
	T.find = ( type, near = g.player.pos ) => C.locate( type, near );
	T.fov = ( f ) => { g.settings.set?.( 'fov', f ); };
	return 'ok';
}
