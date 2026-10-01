// The numbers behind the placeable kinds, as pure functions (Node-tested in test/placeables.mjs).

const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;

// ---- snares ---------------------------------------------------------------------------------------------------

// how wild a spot is from its distance (m) to the edge of the nearest town: a snare in a back yard rarely
// catches anything, one a few kilometres out in the forest often does
export function wildness( townEdge ) {
	if ( townEdge <= 0 ) return 0.12;
	if ( townEdge < 800 ) return 0.12 + 0.88 * townEdge / 800;
	return Math.min( 1.4, 1 + ( townEdge - 800 ) / 5500 );
}

// chance per game hour that a set snare catches something
//   townEdge (m), moist (0..1 ground moisture: forest and grass hold more game), lava (0..1), beach (bool),
//   bait (bool), hour (0..24), skill (survival level 0..10), watched (player within ~20 m: nothing comes)
export function snareChance( { townEdge = 2000, moist = 0.5, lava = 0, beach = false, bait = false, hour = 12, skill = 0, watched = false } = {} ) {
	if ( watched ) return 0;
	let c = 0.035 * wildness( townEdge );
	c *= 0.5 + clamp( moist, 0, 1 ) * 0.8;
	c *= 1 - clamp( lava, 0, 1 ) * 0.8;
	if ( beach ) c *= 0.4;
	if ( bait ) c *= 2.2;
	// game moves at dawn and dusk
	const h = ( ( hour % 24 ) + 24 ) % 24;
	c *= ( h >= 5 && h < 8 ) || ( h >= 17 && h < 20 ) ? 1.5 : h >= 20 || h < 5 ? 1.15 : 0.8;
	c *= 1 + clamp( skill, 0, 10 ) * 0.08;
	return Math.min( 0.4, c );
}

// the chance of at least one catch over `hours` at `perHour`
export const chanceOver = ( perHour, hours ) => hours > 0 ? 1 - Math.pow( 1 - clamp( perHour, 0, 1 ), hours ) : 0;

// what walks into a snare in Hawaiʻi: feral chickens (Kauaʻi is overrun), mongooses (everywhere but Kauaʻi),
// rats (near people)
export function catchWeights( { kauai = false, townEdge = 2000 } = {} ) {
	return { chicken: kauai ? 3 : 0.9, mongoose: kauai ? 0 : 2, rat: 1.5 + ( townEdge < 600 ? 2 : 0 ) };
}

export function pickCatch( rnd, opts = {} ) {
	const w = catchWeights( opts );
	let tot = 0;
	for ( const k in w ) tot += w[ k ];
	let r = rnd() * tot;
	for ( const k in w ) { r -= w[ k ]; if ( r <= 0 && w[ k ] > 0 ) return k; }
	return 'rat';
}

// [ id, min, max ] per catch
export const CATCH = {
	chicken: { name: 'Feral chicken', yields: [ [ 'raw_chicken', 1, 1 ], [ 'feathers', 2, 4 ] ] },
	mongoose: { name: 'Mongoose', yields: [ [ 'raw_small_game', 1, 2 ], [ 'bone', 1, 1 ] ] },
	rat: { name: 'Rat', yields: [ [ 'raw_small_game', 1, 1 ] ] },
};

export function rollYields( kind, rnd ) {
	const out = [];
	for ( const [ id, a, b ] of CATCH[ kind ]?.yields || [] ) out.push( [ id, a + Math.floor( rnd() * ( b - a + 1 ) ) ] );
	return out;
}

// ---- rain collectors --------------------------------------------------------------------------------------------

// litres a collector gains over `hours` of rain at `rain` (0..1), for a catchment `area` (1 = a barrel's open top,
// about 8 L an hour in a downpour)
export function rainFill( litres, cap, rain, hours, area = 1 ) {
	if ( ! ( rain > 0.05 ) || ! ( hours > 0 ) ) return litres;
	return Math.min( cap, litres + rain * area * 8 * hours );
}

// rainwater that has sat for three days is no longer safe to drink
export const STALE_H = 72;
export const collectedLiquid = ( hoursSinceRain ) => hoursSinceRain > STALE_H ? 'dirty' : 'water';

// ---- noise makers -----------------------------------------------------------------------------------------------

// an alarm clock's state: { left: s until it rings (0 = not set), ring: s of ringing left, pulse: s to the next noise }
// tick returns what happened this step: { start, emit, stop }
export function alarmTick( s, dt, { ring = 45, every = 2 } = {} ) {
	const out = { start: false, emit: false, stop: false };
	if ( s.left > 0 ) {
		s.left -= dt;
		// it starts with a pulse and rings from the next step
		if ( s.left <= 0 ) { s.left = 0; s.ring = ring; s.pulse = every; out.start = out.emit = true; }
		return out;
	}
	if ( s.ring > 0 ) {
		s.pulse -= dt;
		if ( s.pulse <= 0 ) { s.pulse += every; if ( s.pulse <= 0 ) s.pulse = every; out.emit = true; }
		s.ring -= dt;
		if ( s.ring <= 0 ) { s.ring = 0; out.stop = true; }
	}
	return out;
}

// a running device (a radio): a noise every `every` s while on with charge; charge drains in game hours
export function deviceTick( s, dt, dh, { every = 4, drain = 1 } = {} ) {
	const out = { emit: false, died: false };
	if ( ! s.on ) return out;
	if ( dh > 0 && s.charge != null ) {
		s.charge = Math.max( 0, s.charge - dh * drain );
		if ( s.charge <= 0 ) { s.on = false; out.died = true; return out; }
	}
	s.pulse = ( s.pulse ?? 0 ) - dt;
	if ( s.pulse <= 0 ) { s.pulse = every; out.emit = true; }
	return out;
}

// ---- lights -----------------------------------------------------------------------------------------------------

// hours of light left after `dh` game hours lit
export const burnDown = ( charge, dh ) => Math.max( 0, ( charge ?? 0 ) - Math.max( 0, dh ) );

// ---- spring traps -----------------------------------------------------------------------------------------------

export const JAW = {
	zombie: { dmg: 45, hold: 25 }, // leg damage; seconds held before it tears free
	animal: { dmg: 70 },
	player: { dmg: 28, fracture: 0.35, hold: true },
	radius: 0.42, // m from the trap's centre that sets it off
	noise: 22,
};

// ---- barricades ---------------------------------------------------------------------------------------------------

export const PLANK_HP = 90;
export const MAX_PLANKS = 4;
// planks still nailed on for a barricade's hp
export const planksLeft = ( hp ) => Math.max( 0, Math.ceil( hp / PLANK_HP - 1e-6 ) );
