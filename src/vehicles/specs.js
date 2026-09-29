// Vehicle types: handling, engine, seats, storage and the looks each spawns with.
// Masses, power and dimensions follow the real vehicle each type is modelled on (kg, N·m, m).
//
//   kind       'car' | 'bike' | 'boat' | 'heli' | 'plane'
//   model      geometry key in models/
//   engine     torque (N·m peak), redline / idle (rpm), gears (ratios), final drive, drive: 'fwd'|'rwd'|'awd'
//   susp       spring k (N/m per wheel), damper c, rest length, travel (m)
//   com        centre of mass in model coordinates [ x, y, z ]
//   seats      [ { pos: [x,y,z] hip, eye: [x,y,z], exit: side (-1 left / 1 right), driver } ]
//   paints     palette the parked ones are painted from
export const PAINTS = {
	civil: [ 0xf2f2f0, 0xf2f2f0, 0xc9ccd1, 0x9ea2a8, 0x55595e, 0x1b1c1e, 0x0e0f10, 0x7a1414, 0x1d3a6b, 0x2d4a3a, 0x6b6b5a, 0xb9b1a0, 0x8a2f1a, 0x3e5f8a, 0xd8d2c0 ],
	bright: [ 0xc81d1d, 0xf2b705, 0x1d5fd1, 0x0f0f10, 0xf2f2f0, 0xe0591b, 0x2e8b57, 0x6a0dad ],
	truck: [ 0xf2f2f0, 0x9ea2a8, 0x1b1c1e, 0x6b1414, 0x2d3f5e, 0x4a4f3a, 0xb9a88a, 0x7a7d80 ],
	jeep: [ 0x2f5f3a, 0x0e0f10, 0xf2f2f0, 0xb8212a, 0xe0b10f, 0x4a90c8, 0x6b6b5a, 0xd06a1a ],
	boat: [ 0x1d4f8a, 0xb01c1c, 0x0e0f10, 0x1f7a6a, 0xd8a01a, 0x2a2a5a ],
	army: [ 0x4b5320, 0x5a5c3a, 0x4b5320, 0xa89a78 ],
};

const car = ( o ) => Object.assign( {
	kind: 'car', mass: 1500, health: 1000, fuel: 55, consumption: 1,
	engine: { torque: 260, redline: 6400, idle: 750, gears: [ 3.3, 2.05, 1.45, 1.1, 0.86, 0.69 ], reverse: 3.2, final: 3.9, drive: 'fwd', sound: 'engine_car', pitch: 1, power: 150 },
	brake: 10500, handbrake: 7000, steer: 0.6, steerSpeed: 2.8,
	susp: { k: 36000, c: 3600, rest: 0.2, travel: 0.17 },
	grip: 1.05, rollInfluence: 0.2, antiRoll: 12000, dragArea: 0.72, downforce: 0,
	containers: { trunk: 40, glovebox: 6 },
	paints: PAINTS.civil, metallic: [ 0, 0.6 ],
	lights: { head: [ 0.62, 0.66, 2.45 ], tail: [ 0.62, 0.84, - 2.45 ] },
}, o );

export const SPECS = {
	sedan: car( {
		name: 'Sedan', model: 'sedan', mass: 1500, com: [ 0, 0.5, - 0.12 ],
		seats: [
			{ pos: [ - 0.36, 0.53, 0.22 ], eye: [ - 0.36, 1.17, 0.32 ], exit: - 1, driver: true },
			{ pos: [ 0.36, 0.53, 0.22 ], eye: [ 0.36, 1.17, 0.32 ], exit: 1 },
			{ pos: [ - 0.36, 0.61, 1.12 ], eye: [ - 0.36, 1.21, 1.2 ], exit: - 1 },
			{ pos: [ 0.36, 0.61, 1.12 ], eye: [ 0.36, 1.21, 1.2 ], exit: 1 },
		],
	} ),
};

// every spawnable type, in /summon order
export const TYPES = Object.keys( SPECS );
