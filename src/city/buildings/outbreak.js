// The outbreak in the rooms (worker side): the dead (lying, curled, slumped against a wall, under a sheet or in a
// bag; searchable), bags left behind, windows and doors barricaded from inside, blood, drag marks, bullet holes,
// writing on the walls, broken crockery and spilled pills. Placement uses furniture.js's room context (C).
import { L, DECAL } from './data.js';
import { M } from './plan.js';
import { F_IN } from './geo.js';
import { paint, gloss, cloth, wood, metal, DARK, BLACK, CLOTHES, pickOf, frame } from './kit.js';

const SKIN = [ [ 196, 160, 140 ], [ 150, 110, 86 ], [ 110, 80, 62 ], [ 214, 184, 160 ], [ 170, 130, 104 ] ];
// the dead look grey: skin a little towards green-grey
const deadSkin = ( R ) => paint( pickOf( R, SKIN ).map( ( v, i ) => v * 0.78 + [ 30, 34, 28 ][ i ] ) );

// the table a body is searched with, by building
export function bodyTable( P, rm ) {
	const t = P.S.type;
	if ( t === 'police' ) return 'zombie_police';
	if ( t === 'hospital' || t === 'clinic' ) return 'zombie_medic';
	if ( t === 'barracks' || t === 'mil_hq' || t === 'armory' || t === 'mil_tent' ) return 'zombie_military';
	if ( t === 'hotel' || rm?.k === 'hotelroom' ) return 'zombie_tourist';
	return 'zombie_civilian';
}

// a body on the floor (pose 0 on its back, 1 face down, 2 curled on its side, 3 slumped sitting against a wall at
// local z = 0), head towards local +x. o: { table, clothes: [ shirt, trousers ], sheet, bag }
export function body( F, pose, o = {} ) {
	const R = F.O.R;
	const skin = deadSkin( R ), shirt = paint( o.clothes?.[ 0 ] || pickOf( R, CLOTHES ) ), pants = paint( o.clothes?.[ 1 ] || pickOf( R, [ [ 50, 60, 90 ], [ 40, 40, 44 ], [ 170, 150, 110 ], [ 90, 90, 94 ] ] ) );
	const shoe = paint( pickOf( R, [ [ 30, 30, 30 ], [ 220, 220, 216 ], [ 90, 60, 40 ] ] ) );
	if ( o.bag ) {
		// a zipped body bag
		F.box( - 0.95, 0, - 0.3, 0.95, 0.22, 0.3, gloss( [ 20, 22, 24 ] ) ).cylH( 0.95, 0.11, 0, 0.14, 0.02, 8, gloss( [ 20, 22, 24 ] ), 'x', 0 );
		F.box( - 0.9, 0.22, - 0.01, 0.9, 0.225, 0.01, metal( [ 150, 150, 150 ] ) );
	} else if ( pose === 3 ) {
		// sitting against the wall, head dropped, legs out
		F.rbox( 0, 0.45, 0.2, 0.22, 0.3, 0.12, shirt, 0, - 0.25 );
		F.rbox( 0, 0.24, 0.34, 0.2, 0.1, 0.1, pants );
		F.rbox( 0.02, 0.86, 0.3, 0.1, 0.12, 0.11, skin, 0.3, 0.5 );
		for ( const s of [ - 1, 1 ] ) {
			F.rbox( s * 0.11, 0.1, 0.62, 0.075, 0.075, 0.25, pants, s * 0.1 ).rbox( s * 0.13, 0.08, 1.02, 0.065, 0.065, 0.2, pants, s * 0.1 ).rbox( s * 0.14, 0.07, 1.26, 0.05, 0.07, 0.11, shoe );
			F.rbox( s * 0.28, 0.4, 0.3, 0.05, 0.2, 0.05, shirt, 0, 0.2, s * 0.15 ).rbox( s * 0.32, 0.15, 0.45, 0.045, 0.045, 0.16, skin, s * 0.3 );
		}
		F.O.decalAt( F, 0, 0.45, 1.1, 'blood' );
		F.O.decalWall?.( ...wallPoint( F, 0, 0.7 ), 0.8, 1.0, DECAL.smear[ 0 ] );
	} else {
		// lying (0 on its back, arms flung out; 1 face down, arms up by the head; 2 face down, a knee drawn up)
		const limb = ( x0, z0, dx, dz, len, hy, hw, m, y = hy ) => { F.rbox( x0 + dx * len / 2, y, z0 + dz * len / 2, len / 2, hy, hw, m, Math.atan2( - dz, dx ) ); return [ x0 + dx * len, z0 + dz * len ]; };
		F.rbox( 0.05, 0.1, 0, 0.28, 0.1, 0.2, shirt ).rbox( - 0.33, 0.09, 0, 0.12, 0.09, 0.17, pants );
		F.rbox( 0.47, 0.1, 0, 0.11, 0.1, 0.095, skin, ( R() - 0.5 ) * 0.8 );
		if ( pose === 0 ) F.fine().rbox( 0.47, 0.201, 0, 0.1, 0.004, 0.08, paint( pickOf( R, [ [ 40, 30, 24 ], [ 20, 18, 16 ], [ 150, 110, 60 ], [ 120, 120, 118 ] ] ) ) );
		for ( const s2 of [ - 1, 1 ] ) {
			const th = pose === 1 ? Math.PI - 0.5 - R() * 0.5 : 0.25 + R() * 1.3;
			const [ ex, ez ] = limb( 0.26, s2 * 0.2, - Math.cos( th ), s2 * Math.sin( th ), 0.29, 0.055, 0.055, shirt );
			const th2 = th + ( R() - 0.3 ) * 0.9;
			const [ hx, hz ] = limb( ex, ez, - Math.cos( th2 ), s2 * Math.sin( th2 ), 0.27, 0.045, 0.045, skin );
			F.rbox( hx, 0.03, hz, 0.06, 0.03, 0.045, skin, R() * 3 );
			const ph = 0.04 + R() * 0.25;
			const bent = pose === 2 && s2 > 0;
			const [ kx, kz ] = limb( - 0.42, s2 * 0.1, bent ? - 0.2 : - Math.cos( ph ), s2 * ( bent ? 0.98 : Math.sin( ph ) ), 0.44, 0.075, 0.075, pants, 0.08 );
			const [ fx, fz ] = limb( kx, kz, bent ? - 0.98 : - Math.cos( ph ), bent ? s2 * 0.2 : s2 * Math.sin( ph ), 0.42, 0.065, 0.065, pants, 0.07 );
			F.rbox( fx - 0.04, 0.08, fz, 0.06, 0.08, 0.05, shoe );
		}
		if ( o.sheet ) {
			const sh = cloth( [ 232, 232, 226 ] );
			F.box( - 1.3, 0.21, - 0.46, 0.66, 0.25, 0.46, sh ).box( - 1.3, 0, - 0.48, 0.66, 0.24, - 0.45, sh ).box( - 1.3, 0, 0.45, 0.66, 0.24, 0.48, sh );
			F.O.decalAt( F, 0.1, 0, 1.0, 'blood' );
		} else F.O.decalAt( F, 0.25 + R() * 0.3, ( R() - 0.5 ) * 0.3, 1.2 + R() * 0.8, 'blood' );
	}
	F.container( - 1.1, 0, - 0.35, 0.6, 0.35, 0.35, 'Body', o.table || 'zombie_civilian', 12, { n: 2, empty: 0.35 } );
	return F;
}
// the wall behind a piece's local point (for a smear): x, y, z and the wall normal
function wallPoint( F, lx, ly ) {
	const [ x, z ] = F.T( lx, - 0.02 );
	return [ x, F.y + ly, z, Math.sin( F.rot ), Math.cos( F.rot ) ];
}

// a bag left on the floor: a backpack, a duffel or shopping bags (searchable)
export function bag( F, table = 'house_bedroom' ) {
	const R = F.O.R;
	const u = R();
	const c = paint( pickOf( R, [ [ 40, 60, 40 ], [ 30, 40, 70 ], [ 150, 30, 30 ], [ 40, 40, 44 ], [ 200, 120, 40 ], [ 90, 110, 130 ] ] ) );
	if ( u < 0.45 ) {
		// a backpack, fallen over
		F.rbox( 0, 0.13, 0, 0.17, 0.13, 0.24, c, 0, 0, 0.1 ).rbox( 0, 0.09, 0.27, 0.13, 0.09, 0.04, c ).rbox( 0.1, 0.27, - 0.1, 0.02, 0.02, 0.14, BLACK, 0, 0.5 );
		F.container( - 0.2, 0, - 0.25, 0.2, 0.3, 0.3, 'Backpack', table, 16, { n: 2, empty: 0.3 } );
	} else if ( u < 0.8 ) {
		F.cylH( 0, 0.16, 0, 0.16, 0.6, 10, c, 'x' ).box( - 0.1, 0.3, - 0.02, 0.1, 0.34, 0.02, BLACK );
		F.container( - 0.32, 0, - 0.17, 0.32, 0.32, 0.17, 'Bag', table, 24, { n: 2, empty: 0.3 } );
	} else {
		const f = F.fine();
		for ( let k = 0; k < 2; k ++ ) f.rbox( k * 0.3 - 0.15, 0.14, ( R() - 0.5 ) * 0.2, 0.14, 0.14, 0.09, gloss( [ 236, 236, 232 ] ), R() * 3, k ? 0.3 : 0 );
		F.container( - 0.35, 0, - 0.2, 0.35, 0.3, 0.2, 'Bags', 'grocery', 10, { n: 1, empty: 0.4 } );
	}
	return F;
}

// planks nailed across a window from inside (the room's side of the opening)
export function boardWindow( C, w ) {
	const O = C.O, R = O.R;
	const pm = M( L.oldplanks, [ 190, 165, 130 ], 2.4, F_IN );
	const F = wallFrame( C, w.side, ( w.a0 + w.a1 ) / 2 );
	const ww = w.a1 - w.a0, h = w.y1 - w.y0;
	const n = Math.max( 3, Math.round( h / 0.26 ) );
	for ( let k = 0; k < n; k ++ ) {
		if ( R() < 0.12 ) continue;
		const y = w.y0 - C.st.y + ( k + 0.5 ) * h / n;
		F.rbox( ( R() - 0.5 ) * 0.05, y, 0.03, ww / 2 + 0.14, 0.08, 0.015, pm, 0, 0, ( R() - 0.5 ) * 0.25 );
	}
	// a diagonal brace
	if ( R() < 0.5 ) F.rbox( 0, w.y0 - C.st.y + h / 2, 0.055, Math.hypot( ww, h ) / 2, 0.07, 0.015, pm, 0, 0, Math.atan2( h, ww ) * ( R() < 0.5 ? 1 : - 1 ) );
	F.col( - ww / 2, w.y0 - C.st.y, 0, ww / 2, w.y1 - C.st.y, 0.07, 1 );
	O.barred.add( w.key );
}

// a mattress stood up against a window
export function mattressOverWindow( C, w ) {
	const O = C.O, R = O.R;
	const F = wallFrame( C, w.side, ( w.a0 + w.a1 ) / 2 );
	const ww = Math.min( 1.4, w.a1 - w.a0 + 0.3 );
	F.rbox( 0, 0.95, 0.25, ww / 2, 0.95, 0.1, cloth( pickOf( R, [ [ 220, 214, 200 ], [ 180, 200, 214 ] ] ) ), 0, - 0.12 );
	F.col( - ww / 2, 0, 0, ww / 2, 1.9, 0.4, 1, 2 );
	C.used.push( wallRect( C, w.side, ( w.a0 + w.a1 ) / 2, ww, 0.45 ) );
	O.barred.add( w.key );
}

// a frame against wall `side` of room C at position a along it, facing into the room
export function wallFrame( C, side, a, g ) {
	const y = C.st.y;
	if ( side === 0 ) return frame( C.O, a, y, C.z0, 0, g );
	if ( side === 2 ) return frame( C.O, a, y, C.z1, Math.PI, g );
	if ( side === 3 ) return frame( C.O, C.x0, y, a, Math.PI / 2, g );
	return frame( C.O, C.x1, y, a, - Math.PI / 2, g );
}
export function wallRect( C, side, a, w, d ) {
	if ( side === 0 ) return [ a - w / 2, C.z0, a + w / 2, C.z0 + d ];
	if ( side === 2 ) return [ a - w / 2, C.z1 - d, a + w / 2, C.z1 ];
	if ( side === 3 ) return [ C.x0, a - w / 2, C.x0 + d, a + w / 2 ];
	return [ C.x1 - d, a - w / 2, C.x1, a + w / 2 ];
}

// a pile of furniture pushed against a door: a table on its side, chairs, a dresser
export function doorPile( C, side, a, w = 1.1 ) {
	const O = C.O, R = O.R;
	const F = wallFrame( C, side, a );
	const tm = wood( pickOf( R, [ [ 176, 132, 92 ], [ 130, 90, 60 ], [ 96, 64, 44 ] ] ) );
	F.rbox( 0, 0.45, 0.28, 0.62, 0.45, 0.03, tm, ( R() - 0.5 ) * 0.2 );
	F.rbox( - 0.5, 0.45, 0.6, 0.025, 0.4, 0.025, tm ).rbox( 0.5, 0.45, 0.6, 0.025, 0.4, 0.025, tm );
	F.rbox( ( R() - 0.5 ) * 0.4, 0.95, 0.2, 0.45, 0.4, 0.2, wood( pickOf( R, [ [ 150, 110, 76 ], [ 90, 70, 50 ] ] ) ), ( R() - 0.5 ) * 0.3 );
	F.rbox( 0.3, 1.5, 0.3, 0.2, 0.22, 0.2, wood( [ 130, 90, 60 ] ), 0.4, 0.5, 0.2 );
	F.col( - w / 2 - 0.1, 0, 0, w / 2 + 0.1, 1.7, 0.7, 1, 2 );
	C.used.push( wallRect( C, side, a, w + 0.4, 0.9 ) );
}

// ---- the dressing of a room ---------------------------------------------------------------------------------------------

// blood, smears, hand prints, papers, dirt, footprints, bullet holes, writing, crockery, pills; kind = room kind
export function dressRoom( C, kind, o = {} ) {
	const O = C.O, R = O.R, y = C.st.y + 0.006, P = C.P;
	const px = () => C.x0 + 0.4 + R() * Math.max( 0, C.w - 0.8 ), pz = () => C.z0 + 0.4 + R() * Math.max( 0, C.d - 0.8 );
	const area = C.w * C.d;
	const violent = ( { ward: 2, exam: 1.5, waiting: 1.5, cells: 1.5, lobby: 1.2, corridor: 1.2, bedroom: 1, living: 1, sales: 1, bunk: 1, hotelroom: 1.2, kitchen: 0.9 }[ kind ] || 0.6 ) * ( o.violence ?? 1 );
	if ( R() < 0.14 * violent ) O.decalFloor( px(), y, pz(), 1.2 + R() * 1.2, DECAL.blood[ ( R() * 4 ) | 0 ], R() * 6.3 );
	if ( R() < 0.1 * violent ) O.decalFloor( px(), y, pz(), 2 + R() * 1.5, DECAL.smear[ ( R() * 3 ) | 0 ], R() * 6.3 );
	if ( R() < 0.06 * violent && area > 8 ) {
		// a body dragged across the room
		const len = Math.min( 3.5, Math.max( C.w, C.d ) - 1 );
		const alongX = C.w > C.d;
		const cx = ( C.x0 + C.x1 ) / 2 + ( alongX ? 0 : ( R() - 0.5 ) * ( C.w - 1.5 ) ), cz = ( C.z0 + C.z1 ) / 2 + ( alongX ? ( R() - 0.5 ) * ( C.d - 1.5 ) : 0 );
		for ( let k = 0; k < Math.ceil( len / 1.4 ); k ++ ) {
			const t = ( k + 0.5 ) / Math.ceil( len / 1.4 ) - 0.5;
			O.decalFloor( alongX ? cx + t * len : cx, y + 0.001, alongX ? cz : cz + t * len, 1.4, DECAL.drag, alongX ? 0 : Math.PI / 2 );
		}
	}
	if ( R() < 0.07 * violent && C.w > 1.5 ) {
		// bloody hand prints on a wall
		const side = ( R() * 4 ) | 0;
		const wx = side === 1 ? C.x1 : side === 3 ? C.x0 : C.x0 + 0.5 + R() * ( C.w - 1 ), wz = side === 0 ? C.z0 : side === 2 ? C.z1 : C.z0 + 0.5 + R() * ( C.d - 1 );
		const n = [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ][ side ];
		O.decalWall( wx, C.st.y + 1.1 + R() * 0.3, wz, n[ 0 ], n[ 1 ], 1.0, 1.0, DECAL.hands );
	}
	// bullet holes where someone made a stand, writing on the walls
	const shots = ( o.shots ?? 0.04 ) * ( P.S.type === 'police' || P.S.type === 'gunstore' || P.S.type === 'barracks' ? 4 : 1 );
	for ( let k = 0; k < 2; k ++ ) if ( R() < shots ) { const w = randWall( C ); if ( w ) O.decalWall( w[ 0 ], C.st.y + 0.9 + R() * 1.0, w[ 1 ], w[ 2 ], w[ 3 ], 0.9, 0.9, DECAL.holes ); }
	if ( R() < ( o.writing ?? 0.025 ) ) { const w = randWall( C ); if ( w ) O.decalWall( w[ 0 ], C.st.y + 1.5, w[ 1 ], w[ 2 ], w[ 3 ], 1.3, 1.3, R() < 0.6 ? DECAL.help : DECAL.tally ); }
	const papers = { office: 3, openoffice: 5, classroom: 3, briefing: 2, meeting: 2, lobby: 1, waiting: 2, corridor: 1, sorting: 4, teller: 2, exam: 1 }[ kind ] || 0;
	for ( let i = 0; i < papers; i ++ ) if ( R() < 0.65 ) O.decalFloor( px(), y + 0.001, pz(), 0.9 + R() * 0.6, DECAL.paper[ ( R() * 4 ) | 0 ], R() * 6.3 );
	if ( ( kind === 'kitchen' || kind === 'breakroom' || kind === 'rkitchen' || kind === 'dining' ) && R() < 0.4 ) O.decalFloor( px(), y + 0.002, pz(), 0.9 + R() * 0.5, R() < 0.5 ? DECAL.debris : DECAL.crumbs, R() * 6.3 );
	if ( ( kind === 'bath' || kind === 'hbath' || kind === 'rx' || kind === 'exam' ) && R() < 0.3 ) O.decalFloor( px(), y + 0.002, pz(), 0.8, DECAL.pills, R() * 6.3 );
	if ( R() < 0.18 && area > 6 ) O.decalFloor( px(), y, pz(), 1.5, DECAL.dirt, R() * 6.3 );
	if ( R() < 0.08 && area > 6 ) O.decalFloor( px(), y, pz(), 1.6, DECAL.water, R() * 6.3 );
	if ( R() < 0.1 * violent ) O.decalFloor( px(), y + 0.002, pz(), 1.4, DECAL.steps, R() * 6.3 );
}

// a random stretch of wall in room C with nothing in front of it: [ x, z, nx, nz ]
function randWall( C ) {
	const R = C.O.R;
	for ( let t = 0; t < 6; t ++ ) {
		const side = ( R() * 4 ) | 0;
		const lo = side === 0 || side === 2 ? C.x0 : C.z0, hi = side === 0 || side === 2 ? C.x1 : C.z1;
		if ( hi - lo < 1.4 ) continue;
		const a = lo + 0.6 + R() * ( hi - lo - 1.2 );
		if ( C.blocked[ side ].some( b => b[ 0 ] < a + 0.6 && b[ 1 ] > a - 0.6 ) ) continue;
		const n = [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ][ side ];
		const x = side === 1 ? C.x1 : side === 3 ? C.x0 : a, z = side === 0 ? C.z0 : side === 2 ? C.z1 : a;
		return [ x, z, n[ 0 ], n[ 1 ] ];
	}
	return null;
}

// the dead of a room: a few per building, more where people sheltered or were treated
export function deadOf( C, o = {} ) {
	const O = C.O, R = O.R, P = C.P;
	const p = o.p ?? 0.06;
	const n = R() < p ? 1 + ( R() < 0.25 ? 1 : 0 ) : 0;
	for ( let i = 0; i < n; i ++ ) {
		const pose = R() < 0.18 ? 3 : ( R() * 3 ) | 0;
		let F = null;
		if ( pose === 3 ) {
			const side = ( R() * 4 ) | 0;
			const lo = side === 0 || side === 2 ? C.x0 : C.z0, hi = side === 0 || side === 2 ? C.x1 : C.z1;
			if ( hi - lo < 1.2 ) continue;
			const a = lo + 0.5 + R() * ( hi - lo - 1.0 );
			const r = wallRect( C, side, a, 0.7, 1.4 );
			if ( C.used.some( u => ov( u, r ) ) || C.clear.some( u => ov( u, r ) ) ) continue;
			C.used.push( r );
			F = wallFrame( C, side, a );
		} else {
			for ( let t = 0; t < 12 && ! F; t ++ ) {
				const rot = R() * Math.PI * 2;
				const x = C.x0 + 1.0 + R() * Math.max( 0, C.w - 2 ), z = C.z0 + 1.0 + R() * Math.max( 0, C.d - 2 );
				const r = [ x - 0.9, z - 0.9, x + 0.9, z + 0.9 ];
				if ( C.used.some( u => ov( u, r ) ) || C.clear.some( u => ov( u, r ) ) ) continue;
				C.used.push( [ x - 0.7, z - 0.7, x + 0.7, z + 0.7 ] );
				F = frame( O, x, C.st.y, z, rot );
			}
		}
		if ( F ) body( F, pose, { table: o.table || bodyTable( P, C.rm ), sheet: o.sheet && R() < 0.6, bag: o.bag && R() < 0.5 } );
	}
}
const ov = ( a, b ) => a[ 0 ] < b[ 2 ] && a[ 2 ] > b[ 0 ] && a[ 1 ] < b[ 3 ] && a[ 3 ] > b[ 1 ];
