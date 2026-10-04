// The numbers behind the senses, hazards and diving equipment (docs/ITEMS_PLAN.md style domain "senses"), as pure
// functions (Node-tested in test/ext-senses.mjs): what each device is and drains, how a night-vision tube or a
// thermal core turns into the grade's uniforms, where Kīlauea's vog and the ocean-entry laze hang and how much a mask
// keeps out, how a scuba tank empties with depth, a rebreather's oxygen limit, nitrogen loading and the bends, what
// ear protection does to the mix, and the small readout helpers.
import { getItem } from '../../ItemDB.js';

export const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const smooth = ( e0, e1, x ) => { const t = clamp( ( x - e0 ) / ( e1 - e0 ), 0, 1 ); return t * t * ( 3 - 2 * t ); };

// ---- devices ------------------------------------------------------------------------------------------------------------

// def.senses: { kind, view?, ... } on every device of this domain; the helpers read it
export const sensesOf = ( d ) => d?.senses || null;
export const isDevice = ( d, kind ) => sensesOf( d )?.kind === kind;
// battery hours (game hours) and charge; a device the system hasn't seen yet starts at 60 %
export const capOf = ( d ) => d?.tool?.battery || 0;
export function chargeOf( s, d = getItem( s?.id ) ) {
	const cap = capOf( d );
	if ( ! cap ) return 1;
	return s.data?.charge ?? cap;
}
export const fracOf = ( s, d = getItem( s?.id ) ) => capOf( d ) ? clamp( chargeOf( s, d ) / capOf( d ), 0, 1 ) : 1;
// drain game hours of charge; returns the charge left (0 = dead)
export function drain( s, dh, rate = 1, d = getItem( s.id ) ) {
	if ( ! capOf( d ) || ! ( dh > 0 ) ) return chargeOf( s, d );
	s.data.charge = Math.max( 0, chargeOf( s, d ) - dh * rate );
	return s.data.charge;
}
export const pct = ( k ) => `${Math.round( clamp( k, 0, 1 ) * 100 )}%`;

// ---- vision: night vision and thermal -----------------------------------------------------------------------------------

// tubes. gain: the most the tube amplifies (the frame's mean luminance is brought up to `target`, at most by `gain`);
// noise: scintillation at full gain; halo: how far bright lights bloom; tube: the image circle (screen heights, 0 =
// none); zoom: magnification when aimed (handhelds); whine: the Gen-1's audible inverter
export const TUBES = {
	gen3: { gain: 900, floor: 10, target: 0.24, noise: 0.35, halo: 1.2, tube: 0.5, tint: [ 0.22, 1.0, 0.32 ], whine: 0 },
	gen1: { gain: 160, floor: 8, target: 0.17, noise: 0.7, halo: 2, tube: 0.4, tint: [ 0.3, 1.0, 0.22 ], whine: 1, warp: 1 },
	scope: { gain: 500, floor: 10, target: 0.22, noise: 0.4, halo: 1.4, tube: 0, tint: [ 0.22, 1.0, 0.32 ], whine: 0 },
};
// thermal cores: palette 0 white hot, 1 black hot, 2 ironbow; res: the sensor's coarse pixels (screen px)
export const CORES = {
	goggles: { res: 2, noise: 0.05, frame: 'circle', tube: 0.52 },
	handheld: { res: 3, noise: 0.08, frame: 'circle', tube: 0.44 },
	scope: { res: 2, noise: 0.06, frame: 'none', tube: 0 },
};
export const PALETTES = [ 'White hot', 'Black hot', 'Ironbow' ];
// infrared illuminator: a beam only a night-vision tube sees (the infected don't notice it)
export const IR = { range: 70, angle: 0.36, intensity: 55 };

// the scene's own light level the warm bodies have to stand above (CPU side, from the sun and the sky): a white
// surface in full light reflects at most about this much, so an emissive heat term several times it reads as hot
export function sceneLight( sunLum, skyLum, night ) {
	return Math.max( 0.004, sunLum / Math.PI + skyLum ) * ( 1 + night * 2 );
}
// the emissive a warm body is given while thermal is on, and the level the grade calls hot
export const HEAT = { body: 4, ref: 2.2, cold: 0.035 };

// the grade's uniforms for a view: mode 1 night vision, 2 thermal (Renderer.js GRADE: nv*, th*, mask*)
export function viewGrade( v, out = {} ) {
	out.nv = 0; out.thermal = 0;
	if ( ! v || ! v.mode ) return out;
	if ( v.mode === 1 ) {
		const T = TUBES[ v.tube ] || TUBES.gen3;
		out.nv = v.k ?? 1;
		out.nvGain = T.gain * ( v.low ? 0.45 : 1 );
		out.nvFloor = T.floor;
		out.nvTarget = T.target;
		out.nvNoise = T.noise;
		out.nvHalo = T.halo;
		out.nvWarp = T.warp || 0;
		out.nvTint = T.tint;
	} else {
		out.thermal = v.k ?? 1;
		out.thPalette = v.palette || 0;
		out.thRes = ( CORES[ v.core ] || CORES.goggles ).res;
		out.thNoise = ( CORES[ v.core ] || CORES.goggles ).noise;
	}
	return out;
}

// ---- masks and air ---------------------------------------------------------------------------------------------------------

// what a face covering keeps out of the vog (k), whether it covers the eyes, and the filter it takes
export const MASKS = {
	gas_mask: { k: 0.98, eyes: true, filter: 'gas_filter', kind: 'gas' },
	gas_mask_civil: { k: 0.95, eyes: true, filter: 'gas_filter', kind: 'gas' },
	respirator: { k: 0.9, eyes: false, filter: 'respirator_cartridges', kind: 'half' },
	n95_mask: { k: 0.3, eyes: false },
	surgical_mask: { k: 0.12, eyes: false },
	bandana: { k: 0.08, eyes: false }, bandana_blue: { k: 0.08, eyes: false }, balaclava: { k: 0.05, eyes: false },
};
// a filter mask without a working filter only keeps the eyes clear
export const NO_FILTER = 0.15;
// filter life: real seconds of breathing heavy vog (concentration 1); thinner air wears it slower
export const FILTERS = { gas_filter: 2400, respirator_cartridges: 1500 };
// a mask's fitted filter: { id, life 0..1 } in stack.data.filter (a found mask carries a part-used one)
export const filterOf = ( s ) => s?.data?.filter || null;
export function maskProtection( face, back, vest ) {
	// breathing from a cylinder: the scuba set, the SCBA or the rebreather (the face is sealed by a mask or a mouthpiece)
	if ( airSupply( back, vest ) && sealed( face, back, vest ) ) return { k: 1, eyes: !! MASKS[ face?.id ]?.eyes || isScba( back ), air: true };
	const m = face && face.cond > 0 ? MASKS[ face.id ] : null;
	if ( ! m ) return { k: 0, eyes: false };
	if ( ! m.filter ) return { k: m.k * clamp( face.cond * 1.4, 0, 1 ), eyes: m.eyes };
	const f = filterOf( face );
	return { k: f && f.life > 0 ? m.k : NO_FILTER, eyes: m.eyes, filter: f };
}
const isScba = ( s ) => s?.id === 'scba_pack';
// a cylinder or a rebreather you breathe from on land: the SCBA with any face seal, a scuba set or a rebreather
export function airSupply( back, vest ) {
	if ( back && ( back.id === 'scuba_set' || back.id === 'scba_pack' ) && ( back.data?.air ?? 0 ) > 0 ) return back;
	if ( vest?.id === 'rebreather' && ( vest.data?.scrub ?? 0 ) > 0 && ( vest.data?.o2 ?? 0 ) > 0 ) return vest;
	return null;
}
// the SCBA comes with its own face piece; the others need a mouthpiece (always there) — sealed unless a half mask is in the way
const sealed = ( face, back ) => isScba( back ) || ! face || MASKS[ face.id ]?.kind !== 'half';
// a filter wears down by the vog it stops
export function wearFilter( f, conc, dt ) {
	if ( ! f || ! ( conc > 0.01 ) ) return f?.life ?? 0;
	f.life = Math.max( 0, f.life - dt * conc / ( FILTERS[ f.id ] || 1800 ) );
	return f.life;
}

// ---- Kīlauea: vog and laze ----------------------------------------------------------------------------------------------------

// the vents (world metres): the summit crater, the Sulphur Banks steam vents, Puʻu ʻŌʻō and fissure 8 on the East Rift,
// and the Kamokuna ocean entry where lava meets the sea (laze: hydrochloric acid steam). r: the core round the vent,
// plume: how far the haze trails downwind (with the trades, towards Kaʻū and Kona), k: strength
export const VENTS = [
	{ id: 'halemaumau', name: 'Halemaʻumaʻu', x: 29202, z: 16250, r: 150, plume: 1100, k: 1, rise: 150, puffs: 3 },
	{ id: 'sulphur_banks', name: 'Sulphur Banks', x: 29507, z: 15891, r: 38, plume: 150, k: 0.55, rise: 8, puffs: 0.8 },
	{ id: 'puu_oo', name: 'Puʻu ʻŌʻō', x: 31520, z: 16509, r: 120, plume: 820, k: 0.9, rise: 110, puffs: 2.4 },
	{ id: 'fissure8', name: 'Fissure 8', x: 33767, z: 15459, r: 90, plume: 600, k: 0.8, rise: 80, puffs: 1.8 },
	{ id: 'kamokuna', name: 'Kamokuna', x: 32262, z: 17528, r: 70, plume: 260, k: 0.9, rise: 12, puffs: 2, laze: true },
];
// the trade winds blow the haze this way (Materials G.uWind: west-south-west)
export const TRADES = { x: - 0.88, z: 0.47 };
// concentration 0..1 at a point: { vog, laze }. wind: 0..1 strength (Weather.wind); a stronger wind carries it further
export function vogAt( x, z, wx = TRADES.x, wz = TRADES.z, wind = 0.45, out = { vog: 0, laze: 0 } ) {
	out.vog = 0; out.laze = 0;
	const wl = Math.hypot( wx, wz ) || 1;
	wx /= wl; wz /= wl;
	for ( const v of VENTS ) {
		const dx = x - v.x, dz = z - v.z, reach = v.r * 1.6 + v.plume * 2.6;
		if ( dx * dx + dz * dz > reach * reach ) continue;
		const d = Math.sqrt( dx * dx + dz * dz );
		// the core round the vent
		let k = v.k * smooth( v.r * 1.6, v.r * 0.45, d );
		// the plume downwind: thinning with distance, widening as it goes
		const along = dx * wx + dz * wz, across = Math.abs( - dx * wz + dz * wx );
		if ( along > 0 ) {
			const L = v.plume * ( 0.6 + 0.8 * clamp( wind, 0, 1 ) ), w = v.r * 0.8 + along * 0.22;
			k = Math.max( k, v.k * 0.78 * Math.exp( - along / L ) * Math.exp( - ( across * across ) / ( w * w ) ) );
		}
		if ( v.laze ) out.laze = Math.max( out.laze, k ); else out.vog = Math.max( out.vog, k );
	}
	return out;
}
export const nearestVent = ( x, z ) => { let best = null, bd = Infinity; for ( const v of VENTS ) { const d = Math.hypot( x - v.x, z - v.z ); if ( d < bd ) { bd = d; best = v; } } return { vent: best, d: bd }; };
// SO2 as a detector reads it (ppm): the summit plume reaches tens of ppm
export const ppm = ( c ) => c * 18;
// the detector: silent below `low`, beeping faster up to `high`, a steady alarm above
export const DETECTOR = { low: 0.1, high: 5, every: [ 2.4, 0.18 ] };
export function beepEvery( p ) {
	if ( p < DETECTOR.low ) return 0;
	const t = clamp( Math.log( p / DETECTOR.low ) / Math.log( DETECTOR.high / DETECTOR.low ), 0, 1 );
	return DETECTOR.every[ 0 ] + ( DETECTOR.every[ 1 ] - DETECTOR.every[ 0 ] ) * t;
}

// the 'vog' condition (Survival.vog 0..1): it builds while you breathe the haze unprotected and clears in clean air
export const VOG = { rise: 1 / 80, fall: 1 / 420, cough: 0.15, hurt: 0.5, drain: 0.09, eye: 0.03, lazeEye: 0.08, lazeBurn: 0.004, stamina: 30 };
// a step of the condition: severity, dose (what reaches the lungs: concentration × what the mask lets through)
export function vogStep( vog, conc, k, dt, breathe = false ) {
	const dose = conc * ( 1 - k );
	if ( dose > 0.025 ) return clamp( vog + dt * dose * VOG.rise, 0, 1 );
	return Math.max( 0, vog - dt * VOG.fall * ( breathe ? 2.5 : 1 ) );
}

// ---- diving -----------------------------------------------------------------------------------------------------------------

// a scuba tank: 11 L at 200 bar (2200 surface litres); a diver breathes `sac` L/min at the surface, times the ambient
// pressure (1 + depth / 10 bar), more when swimming hard; `reserve`: the low-air warning
export const DIVE = { bar: 200, vol: 11, sac: 55, work: 1.5, reserve: 50, low: 25 };
export function airUse( depth, dt, work = 1 ) { return DIVE.sac / 60 * ( 1 + Math.max( 0, depth ) / 10 ) * work * dt; }
// bar used over dt seconds at a depth
export const barUse = ( depth, dt, work = 1 ) => airUse( depth, dt, work ) / DIVE.vol;
// how long the tank lasts at a depth (minutes)
export const minutesLeft = ( bar, depth, work = 1 ) => Math.max( 0, bar - 0 ) * DIVE.vol / ( DIVE.sac * ( 1 + Math.max( 0, depth ) / 10 ) * work );
// an SCBA bottle: 6.8 L at 300 bar, about 30 min of hard work on land
export const SCBA = { bar: 300, vol: 6.8, sac: 65 };
export const scbaUse = ( dt, work = 1 ) => SCBA.sac / 60 * work * dt / SCBA.vol;
// a closed-circuit oxygen rebreather (chest-worn, no bubbles): the oxygen bottle and the CO2 scrubber last the same
// whatever the depth (real seconds); pure oxygen is toxic below `maxDepth`
export const REBREATHER = { o2: 2700, scrub: 3600, maxDepth: 7, tox: 0.06 };
// nitrogen: loads below `from` m, comes off above `off` m; ascending faster than `ascent` m/s while loaded forms bubbles
// that become the bends at the surface. bends: 0..1 condition (Survival.bends), cleared by rest or by going back down
export const BENDS = { from: 10, load: 1 / 4000, off: 6, unload: 1 / 120, ascent: 1.8, form: 0.9, at: 0.25, fall: 1 / 500, recompress: 4, pain: 0.6, drain: 0.04 };
export function nitrogen( n, depth, dt ) {
	if ( depth > BENDS.from ) return clamp( n + dt * ( depth - BENDS.from ) * BENDS.load, 0, 2 );
	if ( depth < BENDS.off ) return Math.max( 0, n - dt * BENDS.unload );
	return n;
}
// bubbles from an ascent this step (rate m/s, positive going up)
export const bubbleStep = ( rate, n, dt ) => rate > BENDS.ascent && n > 0.3 ? dt * ( rate - BENDS.ascent ) * n * BENDS.form : 0;
// no-decompression time left at a depth (minutes), or 0 when already loaded past it
export function ndl( n, depth ) {
	if ( depth <= BENDS.from ) return 99;
	if ( n >= 1 ) return 0;
	return Math.min( 99, Math.floor( ( 1 - n ) / ( ( depth - BENDS.from ) * BENDS.load ) / 60 ) );
}
// what you breathe underwater: { kind: 'scuba'|'rebreather', stack } or null
export function underwaterAir( back, vest ) {
	if ( back?.id === 'scuba_set' && ( back.data?.air ?? 0 ) > 0 ) return { kind: 'scuba', stack: back };
	if ( vest?.id === 'rebreather' && ( vest.data?.o2 ?? 0 ) > 0 && ( vest.data?.scrub ?? 0 ) > 0 ) return { kind: 'rebreather', stack: vest };
	return null;
}
// lights and electronics that drown: everything with a battery that isn't marked waterproof
export const waterproof = ( d ) => !! d?.senses?.waterproof || !! d?.waterproof;

// ---- hearing -------------------------------------------------------------------------------------------------------------------

// the sfx bus through the ears. dry: the plain signal's gain; lp: a low-pass (Hz); comp: the electronic defenders'
// limiter (a fast compressor and make-up gain: gunshots cut, footsteps and groans lifted). protect: how much of a
// gunshot's ringing they stop
export const EARS = {
	open: { dry: 1, wet: 0, lp: 20000, protect: 0 },
	plugs: { dry: 0.34, wet: 0, lp: 2600, protect: 0.85 },
	muffs: { dry: 0.26, wet: 0, lp: 1900, protect: 0.9 },
	active: { dry: 0, wet: 1, lp: 9000, protect: 1, threshold: - 34, knee: 6, ratio: 16, attack: 0.002, release: 0.16, makeup: 3.4 },
};
// ringing after gunfire: radius (the shot's noise radius, m), distance, indoors doubles it; 0..1 added
export const RING = { per: 1 / 1400, indoor: 2.2, fade: 0.07, lp: 1100, from: 0.18 };
export function ringFrom( radius, dist, indoors, protect ) {
	if ( ! ( radius > 0 ) ) return 0;
	const k = radius * RING.per * ( indoors ? RING.indoor : 1 ) / ( 1 + Math.max( 0, dist - 2 ) / 6 );
	return clamp( k * ( 1 - protect ), 0, 0.6 );
}
// what the ears hear now: the mode's numbers with the ringing on top (lower low-pass, quieter)
export function earMix( mode, ring = 0, out = {} ) {
	const m = EARS[ mode ] || EARS.open;
	Object.assign( out, m );
	if ( ring > RING.from ) {
		const r = clamp( ( ring - RING.from ) / ( 1 - RING.from ), 0, 1 );
		out.lp = Math.min( out.lp, m.lp * ( 1 - r ) + RING.lp * r );
		out.dry *= 1 - r * 0.6; out.wet *= 1 - r * 0.6;
	}
	return out;
}

// ---- the other gadgets ------------------------------------------------------------------------------------------------------------

// a laser dot: the infected within `lure` m of it who can see it go and look (night, or close by day)
export const LASER = { range: 120, lure: 24, day: 9, every: 0.5, drain: 1 };
// the parabolic microphone: groans within `range` m inside a cone (cos) in front of the dish
export const MIC = { range: 180, cos: 0.88, every: 0.7, ref: 30 };
// a motion sensor: anything bigger than a cat within r m; the receiver chimes from up to `warn` m
export const SENSOR = { r: 9, warn: 500, quiet: 8, battery: 96 };
// the spotting scope on its tripod
export const SCOPE = { zoom: 22, leave: 1.4 };
// smartwatch: buzzes when the heart races or blood oxygen drops
export const WATCH = { hr: 150, spo2: 92, every: 25 };
// a compressor: a tank a minute and a bit, loud, on gasoline
export const COMPRESSOR = { tank: 6, perTank: 0.45, fillS: 40, noise: 50, every: 3 };

export const cardinal = ( dx, dz ) => [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][ Math.round( ( ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360 ) / 45 ) % 8 ];
export const fmtDist = ( d ) => d >= 1000 ? `${( d / 1000 ).toFixed( 1 )} km` : `${Math.max( 5, Math.round( d / 5 ) * 5 )} m`;
export const mmss = ( s ) => { s = Math.max( 0, Math.floor( s ) ); return `${Math.floor( s / 60 )}:${String( s % 60 ).padStart( 2, '0' )}`; };

// ---- the weather radio's forecast ----------------------------------------------------------------------------------------------

// a weather service bulletin: what it is doing, what comes next and when, the wind, the surf and the vog advisory
const WX_NAME = { clear: 'Clear', fair: 'Fair', cloudy: 'Cloudy', showers: 'Showers', overcast: 'Overcast', storm: 'Kona storm' };
export const wxName = ( s ) => WX_NAME[ s ] || s;
export function nextWeather( r = Math.random() ) {
	return r < 0.2 ? 'clear' : r < 0.55 ? 'fair' : r < 0.72 ? 'cloudy' : r < 0.87 ? 'showers' : r < 0.95 ? 'overcast' : 'storm';
}
export function surfFt( sea ) { return Math.round( 1 + sea * 9 ); }
export function vogAdvisory( conc ) { return conc > 0.25 ? 'Vog: heavy' : conc > 0.04 ? 'Vog: moderate' : conc > 0.004 ? 'Vog: light' : null; }
