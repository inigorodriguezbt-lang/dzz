// Vehicle types: handling, engine, storage and the looks each spawns with. Masses, power and dimensions
// follow the real vehicle each type is modelled on (kg, kW, N·m, m); fuel burn is shortened for play
// (a car's tank lasts roughly 20-35 minutes of driving).
//
//   kind        'car' | 'bike' | 'boat' | 'heli' | 'plane'
//   model       geometry key in models/
//   engine      power (kW), torque (N·m peak), idle / redline (rpm), gears, reverse, final drive, drive: 'fwd'|'rwd'|'awd',
//               sound (loop name), pitch (loop rate at idle)
//   susp        k spring (N/m per wheel), c damper (N·s/m), rest (static length above the wheel centre), travel (±m)
//   fuel        tank (L), burn (L/s at full power), idleBurn (L/s)
//   containers  trunk / glovebox capacity (volume units) and what the rear storage is called
//   seats       derived from the model for road vehicles (driver first); explicit for boats and aircraft:
//               [ { pos: [ x, y, z ] hip, eye: [ x, y, z ], exit: -1 | 1, driver } ]
export const PAINTS = {
	civil: [ 0xf2f2f0, 0xf2f2f0, 0xc9ccd1, 0x9ea2a8, 0x55595e, 0x1b1c1e, 0x0e0f10, 0x7a1414, 0x1d3a6b, 0x2d4a3a, 0x6b6b5a, 0xb9b1a0, 0x8a2f1a, 0x3e5f8a, 0xd8d2c0 ],
	bright: [ 0xc81d1d, 0xf2b705, 0x1d5fd1, 0x0f0f10, 0xf2f2f0, 0xe0591b, 0x2e8b57, 0x6a0dad ],
	truck: [ 0xf2f2f0, 0x9ea2a8, 0x1b1c1e, 0x6b1414, 0x2d3f5e, 0x4a4f3a, 0xb9a88a, 0x7a7d80 ],
	jeep: [ 0x2f5f3a, 0x0e0f10, 0xf2f2f0, 0xb8212a, 0xe0b10f, 0x4a90c8, 0x6b6b5a, 0xd06a1a ],
	van: [ 0xf2f2f0, 0xf2f2f0, 0xe8e6e0, 0xc9ccd1, 0x1d3a6b, 0x2d4a3a ],
	boat: [ 0x1d4f8a, 0xb01c1c, 0x0e0f10, 0x1f7a6a, 0xd8a01a, 0x2a2a5a, 0xf2f2f0 ],
	jetski: [ 0x1d1d20, 0xf2f2f0, 0x1d4f8a ],
	army: [ 0x4b5320, 0x5a5c3a, 0x4b5320, 0xa89a78 ],
	heli: [ 0xf2f2f0, 0xf2f2f0, 0x1b1c1e, 0xb01c1c ],
	plane: [ 0xb01c1c, 0x1d3a6b, 0x1f7a6a, 0xd8a01a ],
};
// second colours paired by type (stripes, two-tone)
export const PAINTS2 = {
	boat: [ 0xf2f2f0, 0xf2f2f0, 0xd8a01a ], jetski: [ 0xe0591b, 0x1d9fd1, 0xc81d1d, 0xf2b705 ], heli: [ 0x0f5f8c, 0xb01c1c, 0x1b1c1e ],
	plane: [ 0x1d3a6b, 0xb01c1c, 0x2a2a2a ],
};

const car = ( o ) => Object.assign( {
	kind: 'car', mass: 1500, health: 1000,
	engine: { power: 150, torque: 250, idle: 750, redline: 6400, gears: [ 3.3, 2.05, 1.45, 1.1, 0.86, 0.69 ], reverse: 3.2, final: 3.9, drive: 'fwd', sound: 'engine_car', pitch: 1 },
	brake: 12000, handbrake: 7500, steer: 0.62, steerSpeed: 2.6,
	susp: { k: 34000, c: 3400, rest: 0.18, travel: 0.13 },
	grip: 1.05, rollInfluence: 0.75, pitchInfluence: 0.9, antiRoll: 8500, dragArea: 0.72, downforce: 0, offroad: 0, assist: 1,
	fuel: { tank: 55, burn: 0.042, idleBurn: 0.0018 },
	containers: { trunk: 40, glovebox: 6, trunkLabel: 'Trunk' },
	paints: PAINTS.civil, metallic: [ 0.1, 0.65 ],
}, o );

export const SPECS = {
	sedan: car( { name: 'Sedan', model: 'sedan', mass: 1500 } ),
	pickup: car( {
		name: 'Pickup', model: 'pickup', mass: 2000,
		engine: { power: 206, torque: 360, idle: 700, redline: 6000, gears: [ 3.5, 2.2, 1.5, 1.1, 0.85, 0.68 ], reverse: 3.4, final: 3.9, drive: 'awd', sound: 'engine_truck', pitch: 1.05 },
		susp: { k: 46000, c: 4400, rest: 0.22, travel: 0.16 }, brake: 15000, antiRoll: 18000, dragArea: 1.05, offroad: 0.6,
		fuel: { tank: 80, burn: 0.055, idleBurn: 0.0022 },
		containers: { trunk: 70, glovebox: 6, trunkLabel: 'Bed' }, paints: PAINTS.truck,
	} ),
	suv: car( {
		name: 'SUV', model: 'suv', mass: 2100,
		engine: { power: 200, torque: 380, idle: 700, redline: 6000, gears: [ 3.5, 2.1, 1.45, 1.1, 0.85, 0.68 ], reverse: 3.3, final: 3.9, drive: 'awd', sound: 'engine_car', pitch: 0.92 },
		susp: { k: 46000, c: 4400, rest: 0.21, travel: 0.15 }, brake: 15000, antiRoll: 20000, dragArea: 1.0, offroad: 0.5,
		fuel: { tank: 87, burn: 0.052, idleBurn: 0.002 },
		containers: { trunk: 60, glovebox: 6, trunkLabel: 'Cargo' },
	} ),
	police_car: car( {
		name: 'Police cruiser', model: 'police_car', mass: 1850,
		engine: { power: 185, torque: 400, idle: 650, redline: 6000, gears: [ 2.84, 1.55, 1.0, 0.7 ], reverse: 2.3, final: 3.55, drive: 'rwd', sound: 'engine_car', pitch: 0.82 },
		susp: { k: 42000, c: 4000, rest: 0.18, travel: 0.13 }, brake: 15000, antiRoll: 18000, dragArea: 0.8, grip: 1.1,
		fuel: { tank: 72, burn: 0.05, idleBurn: 0.002 },
		containers: { trunk: 45, glovebox: 6, trunkLabel: 'Trunk', loot: 'police' },
		paints: [ 0x0e0f10 ], paints2: [ 0xf2f2f0 ], metallic: [ 0.2, 0.35 ], siren: true,
	} ),
	van: car( {
		name: 'Van', model: 'van', mass: 2400,
		engine: { power: 130, torque: 385, idle: 700, redline: 4400, gears: [ 4.7, 2.5, 1.5, 1.0, 0.8, 0.65 ], reverse: 4.2, final: 3.7, drive: 'rwd', sound: 'engine_truck', pitch: 1.0 },
		susp: { k: 55000, c: 5000, rest: 0.2, travel: 0.14 }, brake: 17000, antiRoll: 22000, dragArea: 1.35, steer: 0.6,
		fuel: { tank: 80, burn: 0.05, idleBurn: 0.002 },
		containers: { trunk: 90, glovebox: 8, trunkLabel: 'Cargo' }, paints: PAINTS.van, metallic: [ 0, 0.3 ],
	} ),
	sports_car: car( {
		name: 'Sports car', model: 'sports_car', mass: 1480,
		engine: { power: 245, torque: 370, idle: 800, redline: 7500, gears: [ 3.8, 2.36, 1.69, 1.31, 1.0, 0.79 ], reverse: 3.4, final: 3.7, drive: 'rwd', sound: 'engine_car', pitch: 1.25 },
		susp: { k: 52000, c: 4800, rest: 0.13, travel: 0.08 }, brake: 16000, grip: 1.25, antiRoll: 22000, dragArea: 0.62, downforce: 0.9, steer: 0.58,
		fuel: { tank: 72, burn: 0.06, idleBurn: 0.002 },
		containers: { trunk: 20, glovebox: 4, trunkLabel: 'Trunk' }, paints: PAINTS.bright, metallic: [ 0.4, 0.8 ],
	} ),
	jeep: car( {
		name: 'Jeep', model: 'jeep', mass: 1950,
		engine: { power: 213, torque: 353, idle: 700, redline: 6400, gears: [ 4.7, 2.8, 1.8, 1.4, 1.0, 0.8 ], reverse: 4.0, final: 3.45, drive: 'awd', sound: 'engine_car', pitch: 0.9 },
		susp: { k: 36000, c: 3700, rest: 0.25, travel: 0.2 }, brake: 14000, antiRoll: 12000, dragArea: 1.15, offroad: 1, rollInfluence: 0.3,
		fuel: { tank: 70, burn: 0.052, idleBurn: 0.002 },
		containers: { trunk: 35, glovebox: 5, trunkLabel: 'Cargo' }, paints: PAINTS.jeep, metallic: [ 0, 0.3 ],
	} ),
	bus: car( {
		name: 'Bus', model: 'bus', mass: 13000, health: 3000,
		engine: { power: 210, torque: 1350, idle: 600, redline: 2400, gears: [ 3.5, 1.9, 1.4, 1.0, 0.75 ], reverse: 4.5, final: 5.1, drive: 'rwd', sound: 'engine_truck', pitch: 0.72 },
		susp: { k: 420000, c: 32000, rest: 0.2, travel: 0.12 }, brake: 110000, handbrake: 60000, steer: 0.62, steerSpeed: 1.6, antiRoll: 250000, dragArea: 6.0, rollInfluence: 0.45, pitchInfluence: 0.5,
		fuel: { tank: 300, burn: 0.09, idleBurn: 0.004 },
		containers: { trunk: 40, glovebox: 10, trunkLabel: 'Luggage' }, paints: [ 0xf4f4f0 ], metallic: [ 0, 0.1 ],
	} ),
	humvee: car( {
		name: 'Humvee', model: 'humvee', mass: 3500, health: 2200,
		engine: { power: 140, torque: 520, idle: 650, redline: 3400, gears: [ 2.5, 1.5, 1.0, 0.75 ], reverse: 2.1, final: 4.9, drive: 'awd', sound: 'engine_truck', pitch: 0.82 },
		susp: { k: 85000, c: 8000, rest: 0.26, travel: 0.2 }, brake: 26000, handbrake: 14000, antiRoll: 40000, dragArea: 1.8, offroad: 1, steer: 0.58,
		fuel: { tank: 95, burn: 0.06, idleBurn: 0.0025 },
		containers: { trunk: 80, glovebox: 8, trunkLabel: 'Cargo', loot: 'military' }, paints: PAINTS.army, metallic: [ 0, 0.05 ],
	} ),
	// ---- motorcycle ----
	motorbike: {
		kind: 'bike', name: 'Motorcycle', model: 'motorbike', mass: 290, health: 450, open: true,
		engine: { power: 52, torque: 64, idle: 1300, redline: 9500, gears: [ 2.75, 1.94, 1.55, 1.3, 1.15, 1.04 ], reverse: 30, final: 5.5, drive: 'rwd', sound: 'engine_bike', pitch: 0.9 },
		brake: 5200, handbrake: 1800, steer: 0.5, steerSpeed: 3.2,
		susp: { k: 24000, c: 2000, rest: 0.14, travel: 0.12 },
		grip: 1.15, rollInfluence: 0, antiRoll: 0, dragArea: 0.36, downforce: 0, offroad: 0.2,
		fuel: { tank: 15, burn: 0.02, idleBurn: 0.0008 },
		containers: { trunk: 8, glovebox: 0, trunkLabel: 'Top box' },
		seats: [
			{ pos: [ 0, 0.84, 0.08 ], eye: [ 0, 1.49, 0.06 ], exit: - 1, driver: true },
			{ pos: [ 0, 0.9, 0.46 ], eye: [ 0, 1.6, 0.4 ], exit: 1 },
		],
		paints: [ 0x0e0f10, 0xc81d1d, 0x1d5fd1, 0xf2f2f0, 0x2e8b57, 0xe0591b, 0x55595e ], paints2: [ 0x0e0f10, 0x1b1c1e, 0x9ea2a8 ], metallic: [ 0.3, 0.7 ],
	},
	// ---- boats ----
	speedboat: {
		kind: 'boat', name: 'Speedboat', model: 'speedboat', mass: 1400, health: 900,
		engine: { power: 185, idle: 700, redline: 5800, sound: 'engine_boat', pitch: 1.15 },
		thrust: 11500, reverse: 0.35, steer: 0.6, steerSpeed: 2.2, draft: 0.2, planing: 1, drag: [ 60, 30 ], lateral: 2600,
		fuel: { tank: 150, burn: 0.06, idleBurn: 0.002 },
		containers: { trunk: 40, glovebox: 6, trunkLabel: 'Storage', loot: 'beach' },
		seats: [
			{ pos: [ 0.55, 0.58, 0.05 ], eye: [ 0.55, 1.36, 0.12 ], exit: 1, driver: true },
			{ pos: [ - 0.55, 0.58, 0.05 ], eye: [ - 0.55, 1.36, 0.12 ], exit: - 1 },
			{ pos: [ - 0.5, 0.42, 2.55 ], eye: [ - 0.5, 1.2, 2.6 ], exit: - 1 },
			{ pos: [ 0.5, 0.42, 2.55 ], eye: [ 0.5, 1.2, 2.6 ], exit: 1 },
		],
		paints: PAINTS.boat, paints2: PAINTS2.boat, metallic: [ 0.1, 0.3 ],
	},
	fishing_boat: {
		kind: 'boat', name: 'Fishing boat', model: 'fishing_boat', mass: 6500, health: 2000,
		engine: { power: 250, idle: 650, redline: 2800, sound: 'engine_truck', pitch: 0.62 },
		thrust: 26000, reverse: 0.4, rudder: true, steer: 0.55, steerSpeed: 1.2, draft: 0.5, planing: 0.15, drag: [ 400, 200 ], lateral: 9000,
		fuel: { tank: 600, burn: 0.07, idleBurn: 0.003 },
		containers: { trunk: 90, glovebox: 10, trunkLabel: 'Fish hold', loot: 'beach' },
		seats: [
			{ pos: [ 0.45, 1.0, - 1.25 ], eye: [ 0.45, 1.72, - 1.18 ], exit: 1, driver: true },
			{ pos: [ - 0.5, 1.0, - 1.3 ], eye: [ - 0.5, 1.72, - 1.25 ], exit: - 1 },
			{ pos: [ 0, 0.42, 2.8 ], eye: [ 0, 2.0, 2.8 ], exit: 1, stand: true },
		],
		paints: PAINTS.boat, paints2: [ 0xf2f2f0 ], metallic: [ 0, 0.15 ],
	},
	jetski: {
		kind: 'boat', name: 'Jet ski', model: 'jetski', mass: 400, health: 400, open: true,
		engine: { power: 130, idle: 1200, redline: 7800, sound: 'engine_bike', pitch: 1.1 },
		thrust: 4600, reverse: 0.25, steer: 0.5, steerSpeed: 3.5, draft: 0.12, planing: 1, drag: [ 20, 8 ], lateral: 900, jet: true,
		fuel: { tank: 70, burn: 0.04, idleBurn: 0.002 },
		containers: { trunk: 10, glovebox: 0, trunkLabel: 'Storage', loot: 'beach' },
		seats: [
			{ pos: [ 0, 0.82, 0.45 ], eye: [ 0, 1.52, 0.5 ], exit: 1, driver: true },
			{ pos: [ 0, 0.84, 1.0 ], eye: [ 0, 1.55, 1.05 ], exit: - 1 },
		],
		paints: PAINTS.jetski, paints2: PAINTS2.jetski, metallic: [ 0.2, 0.4 ],
	},
	// ---- aircraft ----
	helicopter: {
		kind: 'heli', name: 'Helicopter', model: 'helicopter', mass: 1950, health: 1100,
		engine: { power: 632, idle: 0, redline: 1, sound: 'rotor', pitch: 1 },
		lift: 2.1, climb: 6, tilt: 0.42, yawRate: 1.3, drag: 1.6, rotorR: 5.35, spool: 4,
		susp: { k: 70000, c: 7000, rest: 0.12, travel: 0.1 }, grip: 1.2,
		fuel: { tank: 540, burn: 0.16, idleBurn: 0.05 },
		containers: { trunk: 30, glovebox: 6, trunkLabel: 'Baggage', loot: 'hangar' },
		seats: [
			{ pos: [ 0.42, 0.98, - 0.55 ], eye: [ 0.42, 1.72, - 0.45 ], exit: 1, driver: true },
			{ pos: [ - 0.42, 0.98, - 0.55 ], eye: [ - 0.42, 1.72, - 0.45 ], exit: - 1 },
			{ pos: [ - 0.5, 0.98, 0.55 ], eye: [ - 0.5, 1.72, 0.62 ], exit: - 1 },
			{ pos: [ 0.5, 0.98, 0.55 ], eye: [ 0.5, 1.72, 0.62 ], exit: 1 },
		],
		paints: PAINTS.heli, paints2: PAINTS2.heli, metallic: [ 0.3, 0.5 ],
	},
	plane: {
		kind: 'plane', name: 'Light aircraft', model: 'plane', mass: 1100, health: 800,
		engine: { power: 134, idle: 700, redline: 2700, sound: 'engine_bike', pitch: 0.55 },
		thrust: 3600, wing: 16.2, cl0: 0.35, cla: 5.0, clMax: 1.55, cd0: 0.032, k: 0.05, stall: 0.28,
		pitchRate: 1.1, rollRate: 1.6, yawRate: 0.5,
		susp: { k: 42000, c: 3000, rest: 0.12, travel: 0.1 }, brake: 5500, steer: 0.45, grip: 0.9,
		fuel: { tank: 200, burn: 0.03, idleBurn: 0.002 },
		containers: { trunk: 25, glovebox: 4, trunkLabel: 'Baggage', loot: 'hangar' },
		seats: [
			{ pos: [ - 0.27, 1.2, - 0.2 ], eye: [ - 0.27, 1.92, - 0.12 ], exit: - 1, driver: true },
			{ pos: [ 0.27, 1.2, - 0.2 ], eye: [ 0.27, 1.92, - 0.12 ], exit: 1 },
			{ pos: [ - 0.25, 1.18, 0.72 ], eye: [ - 0.25, 1.9, 0.8 ], exit: - 1 },
			{ pos: [ 0.25, 1.18, 0.72 ], eye: [ 0.25, 1.9, 0.8 ], exit: 1 },
		],
		paints: PAINTS.plane, paints2: PAINTS2.plane, metallic: [ 0.2, 0.4 ],
	},
};

// every spawnable type, in /summon order
export const TYPES = Object.keys( SPECS );

// seats of a road vehicle from its model: the driver first, then the other front seats, then the rear rows
export function seatsFromModel( P ) {
	const out = [];
	const eye = ( x, hip, f ) => [ x, hip + 0.66, - f + 0.1 ];
	const d = P.driver;
	if ( ! d ) return out;
	out.push( { pos: [ d.x, d.hipY, - d.f ], eye: eye( d.x, d.hipY, d.f ), exit: Math.sign( d.x ) || - 1, driver: true } );
	for ( const row of P.seatRows || [] ) {
		const hip = d.hipY + ( row.dy || 0 );
		const xs = row.bench ? ( row.heads && row.heads.length > 1 ? row.heads.filter( x => Math.abs( x ) > 0.2 ) : [ - 0.4, 0.4 ] ) : ( row.xs || [] );
		for ( const x of xs ) {
			if ( row === P.seatRows[ 0 ] && Math.abs( x - d.x ) < 0.05 ) continue;
			out.push( { pos: [ x, hip, - row.f ], eye: eye( x, hip, row.f ), exit: Math.sign( x ) || 1 } );
		}
	}
	return out;
}
