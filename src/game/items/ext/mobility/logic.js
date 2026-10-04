// The mobility equipment's numbers and pure steps (Node-safe: no three.js, no DOM). The movement modes
// (modes.js) feed these with what the world says (the ground, the wind, the water) and apply what comes back.
//
//   GLIDE, CHUTE        a paraglider's polar (airspeed -> sink), its brakes, speed bar, turns and flare; a round reserve
//   glideStep( s, input, env, dt, P )   one step of the wing in the air (airspeed, heading, bank, vertical speed)
//   RIDE[ kind ]        boards, a scooter, inline skates and a hōlua sled: push, top speed, rolling resistance per
//                       surface, when you bail; rideAccel( … ) the along-track acceleration
//   PADDLE              a paddleboard (standing, kneeling) and a surfboard / bodyboard paddled prone; waveKnock( … )
//   HAUL[ id ]          carts, a barrow, a beach wagon and a hand truck: capacity, speed per surface, noise
//   ZIP                 a zipline: cable length, sag, friction, braking; zipShape( a, b, s ) a point on the cable
//   CLIMB[ kind ]       ropes, ladders and rope ladders: climbing rates and effort, with what you wear and carry
//   bailHurt( v, pads, helmet ), landHurt( vy, vh ), lift( … ) ridge lift and thermals
export const G = 9.81; // real gravity: slopes, glides, cables
export const FALL_G = 20; // the player's gravity (Player.js): hops, drops and fall heights
export const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
export const lerp = ( a, b, t ) => a + ( b - a ) * t;
export const approach = ( v, t, k ) => v + ( t - v ) * Math.min( 1, k );
// angle difference wrapped to -PI..PI
export const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

// ---- surfaces (hf.flagsNear bits) -----------------------------------------------------------------------------------
export const FLAG = { ROAD: 1, DIRT: 2, STREET: 4, RUNWAY: 8, BUILDING: 16, CITY: 32, FIELD: 64 };
// what the wheels roll on: 'paved' | 'wood' | 'rough' | 'grass' | 'sand'
//   box: the physics box underfoot (a floor, a sidewalk, a roof), flags: hf.flagsNear, lot: on a parking lot,
//   beach / rock: the terrain's own read (World.isBeach, lava and steep ground)
export function surfaceKind( { box = null, flags = 0, lot = false, beach = false, rock = false, lift = 0 } = {} ) {
	if ( box ) return box.mat === 'wood' ? 'wood' : box.mat === 'dirt' || box.mat === 'foliage' || box.mat === 'rock' ? 'rough' : 'paved';
	if ( flags & ( FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY ) || lot || lift > 0 ) return 'paved';
	if ( flags & FLAG.DIRT ) return 'rough';
	if ( beach ) return 'sand';
	if ( rock ) return 'rough';
	return 'grass';
}

// =====================================================================================================================
// paragliding
// =====================================================================================================================

// A beginner wing (EN-A): trim 9.6 m/s (35 km/h), min sink 1.05 m/s at 8.2 m/s, best glide about 8:1, speed bar to
// 12.4 m/s at the cost of sink, deep brakes slow it to 6.8 and below 5.8 it stalls. Turns cost height (1 / cos bank).
export const GLIDE = {
	trim: 9.6, bar: 12.4, brake: 6.8, stall: 5.8, vMin: 8.2, minSink: 1.05, polar: 0.045, stallSink: 3.4,
	bank: 0.5, // rad at full turn input (about 29°)
	inflate: 1.3, // s from pulling the wing open until it flies
	minAGL: 6, // m above the ground to open it from a fall
	accel: 0.8, decel: 1.9, // 1/s: the wing takes time to speed up, brakes bite faster
	vyK: 2.4, // 1/s: the pendulum under the wing (vertical speed eases)
	freeFall: 32, // m/s: terminal speed of a body in free fall (opening at more than this rips the wing)
	hurtV: 4.6, hurtH: 7.5, // landing: vertical m/s and ground speed that start to hurt
	wearMin: 0.0025, // condition per minute of flight
	torn: 0.3, // below this the wing is torn: more sink, less control
};
export const CHUTE = {
	sink: 5.2, fwd: 1.1, turn: 0.28, inflate: 1.7, minAGL: 12, vyK: 2.2, hurtV: 6.5, hurtH: 7.5,
};

// sink rate (m/s, positive down) at airspeed V
export function sinkAt( V, P = GLIDE ) {
	let s = P.minSink + P.polar * ( V - P.vMin ) ** 2;
	if ( V < P.stall ) s += ( P.stall - V ) * P.stallSink;
	return s;
}

// the airspeed the pilot's hands and feet ask for: brakes (0..1) slow it, the bar (0..1) speeds it up; a heavier pilot
// flies a little faster on the same wing
export function glideTarget( input, P = GLIDE, loadK = 1 ) {
	const k = Math.sqrt( clamp( loadK, 0.8, 1.4 ) );
	let V = P.trim;
	if ( input.brake > 0 ) V = lerp( P.trim, P.brake - 1.4 * clamp( input.brakeT || 0, 0, 1 ), input.brake );
	else if ( input.bar > 0 ) V = lerp( P.trim, P.bar, input.bar );
	return V * k;
}

// One step of the wing. s: { heading, V, vy, bank, open (0..1), turnRate } (position is the mode's: it adds the ground
// velocity this returns). input: { bar, brake, brakeT (s the brakes have been deep), turn (-1..1) }. env: { wind: { x, z }
// m/s, lift m/s (air going up), loadK, cond }. Returns { vx, vz } the ground velocity.
export function glideStep( s, input, env, dt, P = GLIDE ) {
	const torn = ( env.cond ?? 1 ) < P.torn;
	s.open = Math.min( 1, ( s.open ?? 1 ) + dt / P.inflate );
	const k = s.open;
	// airspeed: towards the target, faster when slowing (the brakes bite)
	const Vt = glideTarget( input, P, env.loadK ) * ( 0.35 + 0.65 * k );
	const prevV = s.V;
	s.V = approach( s.V, Vt, dt * ( Vt < s.V ? P.decel : P.accel ) );
	// bank and turn rate: g tan(bank) / V, slower and sloppier on a torn wing
	const bankT = clamp( input.turn || 0, - 1, 1 ) * P.bank * ( torn ? 0.6 : 1 ) * k;
	s.bank = approach( s.bank || 0, bankT, dt * 2.2 );
	s.turnRate = G * Math.tan( s.bank ) / Math.max( 4, s.V );
	s.heading -= s.turnRate * dt; // turn right (+input) = yaw decreasing (three.js: forward is -z, right is +x)
	// sink: the polar, more in a turn, more on a torn wing; while it opens the canopy only slows the fall
	let sink = sinkAt( s.V, P ) / Math.pow( Math.cos( s.bank ), 1.5 ) * ( torn ? 1.4 : 1 );
	// a flare trades speed for height: the energy given up lifts the pilot (about half of it: the swing under the wing
	// and the drag of the brakes take the rest)
	const dV = s.V - prevV;
	const flare = dV < 0 ? - s.V * dV / G / Math.max( dt, 1e-4 ) * 0.55 : 0;
	const vyT = k >= 1 ? - sink + ( env.lift || 0 ) + flare : lerp( Math.min( s.vy, - 2 ), - sink, k * k );
	s.vy = approach( s.vy, vyT, dt * ( k >= 1 ? P.vyK : 1.6 ) );
	const fx = - Math.sin( s.heading ), fz = - Math.cos( s.heading );
	return { vx: fx * s.V + ( env.wind?.x || 0 ) * k, vz: fz * s.V + ( env.wind?.z || 0 ) * k };
}

// the round reserve: it comes down at ~5 m/s whatever you do, drifting with the wind; the toggles turn it a little
export function chuteStep( s, input, env, dt, P = CHUTE ) {
	s.open = Math.min( 1, ( s.open ?? 0 ) + dt / P.inflate );
	const k = s.open * s.open;
	s.heading -= clamp( input.turn || 0, - 1, 1 ) * P.turn * dt * s.open;
	const vyT = - P.sink;
	// it snatches open: the fall speed drops hard as the canopy fills
	s.vy = k > 0.05 ? approach( s.vy, vyT, dt * P.vyK * ( 1 + 4 * k ) ) : s.vy - FALL_G * dt;
	const fx = - Math.sin( s.heading ), fz = - Math.cos( s.heading );
	const fwd = P.fwd * s.open * ( 1 + ( input.bar || 0 ) * 0.4 - ( input.brake || 0 ) * 0.8 );
	return { vx: fx * fwd + ( env.wind?.x || 0 ) * s.open, vz: fz * fwd + ( env.wind?.z || 0 ) * s.open };
}

// air going up at a point: ridge lift where the wind meets a rising slope (strong in front of the crest, fading with
// height above it), and weak thermals over sunny land by day. ground( x, z ) -> height; wind: { x, z } m/s.
export function lift( x, y, z, ground, wind, opts = {} ) {
	const U = Math.hypot( wind.x, wind.z );
	let up = 0;
	if ( U > 0.5 ) {
		const dx = wind.x / U, dz = wind.z / U;
		// the slope the wind climbs, just upwind of the pilot and here
		const h0 = ground( x - dx * 40, z - dz * 40 ), h1 = ground( x, z ), h2 = ground( x + dx * 30, z + dz * 30 );
		const slope = Math.max( ( h1 - h0 ) / 40, ( h2 - h1 ) / 30 * 0.8 );
		if ( slope > 0.05 ) {
			const top = Math.max( h1, h2, ground( x + dx * 80, z + dz * 80 ) );
			const agl = y - top;
			// the band reaches about the ridge's own height above its foot
			const band = Math.max( 30, ( top - Math.min( h0, ground( x - dx * 120, z - dz * 120 ) ) ) * 0.9 );
			up += U * clamp( slope, 0, 1.2 ) * 0.45 * Math.exp( - Math.max( 0, agl ) / band );
		}
	}
	// thermals: sun on land, a few hundred metres apart, drifting with the wind
	const sun = opts.sun ?? 0, overLand = ground( x, z ) > 0.5;
	if ( sun > 0.2 && overLand ) {
		const t = opts.time || 0;
		const tx = ( x - wind.x * t * 0.5 ) / 260, tz = ( z - wind.z * t * 0.5 ) / 260;
		const n = cellNoise( tx, tz );
		up += Math.max( 0, n - 0.55 ) * 4.2 * sun * ( 1 - ( opts.cover ?? 0.5 ) * 0.6 );
	}
	return up;
}

// smooth 0..1 value noise
function hash2( i, j ) { let h = ( i * 374761393 + j * 668265263 ) | 0; h = ( h ^ ( h >>> 13 ) ) * 1274126177 | 0; return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296; }
export function cellNoise( x, y ) {
	const i = Math.floor( x ), j = Math.floor( y ), fx = x - i, fy = y - j;
	const sx = fx * fx * ( 3 - 2 * fx ), sy = fy * fy * ( 3 - 2 * fy );
	const a = hash2( i, j ), b = hash2( i + 1, j ), c = hash2( i, j + 1 ), d = hash2( i + 1, j + 1 );
	return lerp( lerp( a, b, sx ), lerp( c, d, sx ), sy );
}

// a landing: what it does to you. vy (m/s, negative down) and the ground speed. -> { fall (m, Survival.fallDamage), hurt }
export function landHurt( vy, vh, P = GLIDE ) {
	const down = Math.max( 0, - vy );
	const fall = down > P.hurtV ? down * down / ( 2 * FALL_G ) + 3.2 - P.hurtV * P.hurtV / ( 2 * FALL_G ) : 0;
	const hurt = vh > P.hurtH ? ( vh - P.hurtH ) * 2.6 : 0;
	return { fall, hurt };
}

// =====================================================================================================================
// boards, skates, a scooter and a sled
// =====================================================================================================================

// roll: rolling resistance (fraction of g) per surface; bail: the speed (m/s) above which that surface throws you, hit:
// running into something, curb: rolling up a step without a hop, drop: m fallen that you can't ride away from;
// push: m/s² of kicking, pushMax: how fast kicking gets you; brake: m/s²; ollie: the hop's m/s up (0 = none);
// turn: rad/s at walking pace; grip: m/s² of sideways grip in a carve; eye: m from the ground to the eye
export const RIDE = {
	skateboard: { name: 'Skateboard', push: 1.7, pushMax: 5.6, brake: 2.6, top: 15, ollie: 4.2, turn: 2.4, grip: 5.5, eye: 1.76, deck: 0.1,
		roll: { paved: 0.014, wood: 0.013, rough: 0.09, grass: 0.32, sand: 0.5 }, bail: { rough: 4.6, grass: 3.0, sand: 2.2, hit: 3.4, curb: 3.0, drop: 1.6 },
		stamina: 5, noise: 1, wear: 0.00002 },
	longboard: { name: 'Longboard', push: 1.5, pushMax: 6.2, brake: 2.4, top: 17, ollie: 2.8, turn: 1.8, grip: 6.5, eye: 1.78, deck: 0.12,
		roll: { paved: 0.01, wood: 0.011, rough: 0.06, grass: 0.26, sand: 0.45 }, bail: { rough: 5.6, grass: 3.5, sand: 2.4, hit: 3.8, curb: 3.6, drop: 1.4 },
		stamina: 4.5, noise: 0.8, wear: 0.000016 },
	kick_scooter: { name: 'Kick scooter', push: 1.6, pushMax: 5.0, brake: 4.6, top: 12, ollie: 3.2, turn: 2.6, grip: 6, eye: 1.8, deck: 0.12,
		roll: { paved: 0.016, wood: 0.015, rough: 0.08, grass: 0.25, sand: 0.45 }, bail: { rough: 5.2, grass: 3.4, sand: 2.4, hit: 3.6, curb: 3.4, drop: 1.4 },
		stamina: 4.5, noise: 0.9, wear: 0.00002 },
	inline_skates: { name: 'Inline skates', push: 2.2, pushMax: 6.4, brake: 3.0, top: 14, ollie: 4.6, turn: 3.0, grip: 7, eye: 1.74, deck: 0.08,
		roll: { paved: 0.009, wood: 0.01, rough: 0.12, grass: 0.6, sand: 0.8 }, bail: { rough: 5.0, grass: 2.6, sand: 2.0, hit: 4.0, curb: 3.8, drop: 1.8 },
		stamina: 5, noise: 0.7, wear: 0.00002, auto: true },
	// a hōlua sled runs on grass and dirt (and lava rock laid with grass, the old way); on pavement it grinds to a halt
	holua_sled: { name: 'Hōlua sled', push: 0.7, pushMax: 1.6, brake: 1.5, top: 22, ollie: 0, turn: 0.7, grip: 3.2, eye: 0.62, deck: 0.18, prone: true,
		roll: { paved: 0.42, wood: 0.3, rough: 0.13, grass: 0.065, sand: 0.38 }, bail: { rough: 99, grass: 99, sand: 99, hit: 5.5, curb: 99, drop: 2.6 },
		stamina: 6, noise: 0.5, wear: 0.00004, slope: true },
};

// along-track acceleration (m/s²) for speed v on a slope `grade` (dh/ds, + uphill) and a surface; ctrl: { push, brake,
// tuck } (0/1); worn wheels roll harder
export function rideAccel( P, v, grade, surface, ctrl = {}, cond = 1 ) {
	const roll = ( P.roll[ surface ] ?? P.roll.grass ) * ( cond < 0.4 ? 1.4 : 1 );
	const drag = ( ctrl.tuck ? 0.0018 : 0.0035 ) * v * v; // ½ρCdA / m for a rider of ~80 kg
	let a = - G * grade / Math.sqrt( 1 + grade * grade ) - Math.sign( v || 1 ) * roll * G * ( v > 0.02 ? 1 : 0 ) - drag;
	if ( ctrl.push && v < P.pushMax ) a += P.push * ( 1 - v / P.pushMax * 0.5 );
	if ( ctrl.brake ) a -= P.brake;
	return a;
}

// a fall off a board: hurt grows with speed; pads take most of it, a helmet some
export function bailHurt( v, pads = false, helmet = false ) {
	const base = Math.max( 0, v - 2.4 ) * 2.3;
	return base * ( pads ? 0.55 : 1 ) * ( helmet ? 0.85 : 1 );
}

// the steepest the camera may turn a board per second at speed v: grip / v, never more than its turn rate
export const turnLimit = ( P, v, tuck = false ) => Math.min( P.turn, P.grip / Math.max( 0.8, v ) ) * ( tuck ? 0.7 : 1 );

// =====================================================================================================================
// paddling
// =====================================================================================================================

// stand: a paddleboard with a paddle; kneel: crouched on it (slower, steadier); prone: lying on a surfboard or bodyboard
// (or a paddleboard without a paddle), arms in the water. v: cruise, sprint: with stamina; turn rad/s; knock: how
// readily waves throw you off (x the sea state)
export const PADDLE = {
	stand: { accel: 1.8, v: 2.8, sprint: 3.5, back: 0.9, turn: 0.75, knock: 1, eye: 1.86, stamina: 2, sprintStamina: 7 },
	kneel: { accel: 1.6, v: 2.3, sprint: 2.8, back: 0.8, turn: 0.8, knock: 0.3, eye: 1.0, stamina: 2, sprintStamina: 7 },
	prone: { accel: 1.5, v: 2.2, sprint: 2.8, back: 0.5, turn: 0.9, knock: 0.45, eye: 0.42, stamina: 3, sprintStamina: 8 },
	drag: 0.02, // per (m/s)², on top of a little linear water drag
	draft: 0.12, // m the board sits in the water
	beach: 0.18, // m of water under it below which it grounds
};
// what floats and paddles: a paddleboard you stand on; a surfboard and a bodyboard (the leisure domain's) paddled prone.
// deck: m from the water to the top of it
export const BOARDS = { paddleboard: { deck: 0.14 }, surfboard: { prone: true, deck: 0.08 }, bodyboard: { prone: true, deck: 0.06 } };
export const boardOf = ( d ) => d ? d.board || BOARDS[ d.id ] || null : null;
// chance per second that the sea throws you off: breaking surf in shallow water, chop out deep, wind gusts in a storm
export function waveKnock( mode, sea, depth, wind = 0, speed = 0 ) {
	const P = PADDLE[ mode ] || PADDLE.stand;
	let c = 0;
	if ( depth < 2.6 ) c += Math.max( 0, sea - 0.35 ) * 0.16 * clamp( ( 2.6 - depth ) / 1.6, 0, 1 );
	c += Math.max( 0, sea - 0.55 ) * 0.2;
	c += Math.max( 0, wind - 0.8 ) * 0.12;
	// moving keeps a board steady
	c *= 1 - clamp( speed / 3, 0, 0.4 );
	return c * P.knock;
}

// =====================================================================================================================
// hauling
// =====================================================================================================================

// cap: volume it holds; speed: walking pace multiplier per surface; noise: m heard at a walk; at: m from the player to
// its centre (negative: pulled behind); turn: rad/s; step: highest step its wheels roll over; fold: carried folded
export const HAUL = {
	shopping_cart: { cap: 60, speed: { paved: 0.9, wood: 0.85, rough: 0.45, grass: 0.32, sand: 0.18 }, noise: 18, at: 0.95, turn: 1.7, step: 0.12, rideable: true,
		roll: { paved: 0.02, wood: 0.022, rough: 0.12, grass: 0.35, sand: 0.6 } },
	wheelbarrow: { cap: 45, speed: { paved: 0.8, wood: 0.78, rough: 0.68, grass: 0.62, sand: 0.45 }, noise: 7, at: 1.05, turn: 2.1, step: 0.2 },
	beach_wagon: { cap: 40, speed: { paved: 0.82, wood: 0.8, rough: 0.6, grass: 0.62, sand: 0.72 }, noise: 6, at: - 1.45, turn: 2.4, step: 0.18, fold: true },
	hand_truck: { cap: 24, speed: { paved: 0.85, wood: 0.82, rough: 0.5, grass: 0.45, sand: 0.3 }, noise: 8, at: 0.75, turn: 2.4, step: 0.2, carry: true, loads: true },
};
// how a load slows you: an empty cart rolls at its pace, 120 kg in it halves that
export const loadK = ( kg ) => 1 - clamp( kg / 240, 0, 0.5 );
// placed things a hand truck can move (their kind) and what they're called on the prompt
export const TRUCKABLE = new Set( [ 'generator', 'collector', 'stash', 'noise', 'light', 'solar', 'leisure_decor', 'mob_hauler' ] );

// =====================================================================================================================
// zipline
// =====================================================================================================================

export const ZIP = {
	max: 82, min: 8, // m of cable between the anchors
	minDrop: 0.035, // the far end must be at least this much lower per metre to ride
	sag: 0.02, // m of sag at the middle per metre of span (loaded)
	lead: 0.3, // m the trolley runs ahead of the rider's head
	mu: 0.035, // trolley rolling friction (fraction of g)
	drag: 0.0035, // air: ½ρCdA/m
	brake: 3.2, // m/s² with the brake held (a glove on the cable)
	hand: 0.6, // m/s hand over hand without a trolley
	handStamina: 9, // per second hand over hand
	hang: 1.95, // m from the cable to your feet hanging from the trolley
	slam: 6.5, // m/s at the end that hurts
	anchorH: 2.3, // m above the ground a strap goes round a tree or a post
};
// a point on the cable at s (0..1) from a (higher) to b: a straight line pulled down into a parabola by the load
export function zipShape( a, b, s, sag, out = {} ) {
	const L = Math.hypot( b.x - a.x, b.y - a.y, b.z - a.z );
	out.x = a.x + ( b.x - a.x ) * s;
	out.z = a.z + ( b.z - a.z ) * s;
	out.y = a.y + ( b.y - a.y ) * s - ( sag ?? ZIP.sag ) * L * 4 * s * ( 1 - s );
	return out;
}
// the slope of the cable (dy/ds per metre of cable) at s
export function zipGrade( a, b, s, sag ) {
	const L = Math.max( 1e-3, Math.hypot( b.x - a.x, b.y - a.y, b.z - a.z ) );
	return ( ( b.y - a.y ) - ( sag ?? ZIP.sag ) * L * 4 * ( 1 - 2 * s ) ) / L;
}
// acceleration along the cable (m/s², + towards b) at speed v ≥ 0
export function zipAccel( grade, v, brake = false ) {
	const sinA = grade / Math.sqrt( 1 + grade * grade ), cosA = 1 / Math.sqrt( 1 + grade * grade );
	let a = - G * sinA - ( v > 0.02 ? ZIP.mu * G * cosA : 0 ) - ZIP.drag * v * v;
	if ( brake ) a -= ZIP.brake;
	return a;
}
// can a cable go from a to b: { ok, reason }
export function zipCheck( a, b ) {
	const L = Math.hypot( b.x - a.x, b.y - a.y, b.z - a.z );
	if ( L > ZIP.max ) return { ok: false, reason: 'Too far' };
	if ( L < ZIP.min ) return { ok: false, reason: 'Too close' };
	const drop = Math.abs( a.y - b.y ) / Math.max( 1, Math.hypot( b.x - a.x, b.z - a.z ) );
	if ( drop < ZIP.minDrop ) return { ok: false, reason: 'Needs more drop' };
	return { ok: true, L };
}

// =====================================================================================================================
// climbing
// =====================================================================================================================

// up / down: m/s; stamina: per second climbing up (down costs a third); slide: m/s letting it run (a rope)
export const CLIMB = {
	rope: { up: 0.5, down: 0.9, slide: 3.2, stamina: 8, name: 'rope' },
	ladder: { up: 1.05, down: 1.25, slide: 0, stamina: 2.2, name: 'ladder' },
	rope_ladder: { up: 0.75, down: 0.95, slide: 0, stamina: 4.5, name: 'rope ladder' },
};
// what you wear and carry: { harness, gloves, ascender, descender, chalk } -> rates and effort for that kind
export function climbRates( kind, gear = {} ) {
	const C = CLIMB[ kind ] || CLIMB.rope;
	let up = C.up, down = C.down, st = C.stamina;
	if ( kind === 'rope' ) {
		if ( gear.ascender ) { up *= 1.6; st *= 0.55; }
		if ( gear.harness ) { up *= 1.15; st *= 0.8; }
		if ( gear.descender && gear.harness ) down = 2.4; // rappelling
		else if ( gear.harness ) down *= 1.4;
	}
	if ( gear.gloves ) { up *= 1.08; st *= 0.9; }
	if ( gear.chalk ) st *= 0.7;
	return { up, down, stamina: st, slide: C.slide };
}
// letting a rope run through bare hands burns them (damage per second at slide speed)
export const ROPE_BURN = 2.5;
// reach of each rope when hung from a ledge, and of a thrown grappling hook
export const ROPES = { rope: 9, paracord: 0, climbing_rope: 28 };
export const GRAPPLE = { range: 17, minRise: 2.2, maxRise: 13, chance: 0.68, skillK: 0.03, wind: 0.3 };
// ladders: reach (m of wall they climb), lean (rad from upright)
export const LADDERS = {
	folding_ladder: { reach: 3.6, rungs: 0.3, lean: 0.27, w: 0.42 },
	extension_ladder: { reach: 6.6, rungs: 0.3, lean: 0.25, w: 0.44 },
	rope_ladder: { reach: 7.5, rungs: 0.32, w: 0.36 },
};
