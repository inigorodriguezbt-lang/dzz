// Road vehicle model parameters (proportions from real vehicles of each class, metres).
// f is forward (= -z); key lists are [ f, value ] pairs interpolated smoothly along the length.
import { buildCar } from './car.js';
import { MAT, mat } from '../kit.js';
import { ATLAS } from '../materials.js';
import { lightbar, pushBar, spotLamp, roofRails, flares, rockRails, spareWheel, spoiler, wellWall, sideDecal, turretRing, busDetails, canvasCover } from './extras.js';

export const CARS = {};

// ---- mid-size sedan (Camry / Accord class): 4.88 x 1.84 x 1.44 m, wheelbase 2.82 m ------------------------------
CARS.sedan = () => ( {
	L: 4.88, W: 1.84, H: 1.44, front: 2.44, rear: - 2.44,
	wheelR: 0.335, wheelW: 0.225, track: 1.58, axleF: 1.42, axleR: - 1.4, archR: 0.39, archLift: 0.025,
	body: {
		width: [ [ 2.44, 0.7 ], [ 2.38, 0.84 ], [ 2.22, 0.895 ], [ 1.9, 0.912 ], [ 0.5, 0.92 ], [ - 1.6, 0.918 ], [ - 2.1, 0.9 ], [ - 2.34, 0.86 ], [ - 2.44, 0.76 ] ],
		bottom: [ [ 2.44, 0.33 ], [ 2.25, 0.25 ], [ 1.95, 0.2 ], [ 0, 0.185 ], [ - 1.95, 0.2 ], [ - 2.25, 0.27 ], [ - 2.44, 0.38 ] ],
		edge: [ [ 2.44, 0.7 ], [ 2.38, 0.76 ], [ 2.2, 0.8 ], [ 1.4, 0.84 ], [ 0.85, 0.88 ], [ 0.3, 0.93 ], [ - 0.6, 0.96 ], [ - 1.4, 0.99 ], [ - 1.7, 1.0 ], [ - 2.2, 0.99 ], [ - 2.38, 0.95 ], [ - 2.44, 0.88 ] ],
		top: [ [ 2.44, 0.7 ], [ 2.38, 0.77 ], [ 2.2, 0.815 ], [ 1.4, 0.86 ], [ 0.85, 0.9 ], [ - 1.5, 1.0 ], [ - 1.7, 1.01 ], [ - 2.2, 1.0 ], [ - 2.38, 0.96 ], [ - 2.44, 0.89 ] ],
		shoulder: [ [ 2.44, 0.08 ], [ 2.2, 0.1 ], [ 0, 0.12 ], [ - 2.2, 0.1 ], [ - 2.44, 0.09 ] ],
		tumble: 0.032, tuck: 0.038, rb: 0.05, re: 0.03, crownPow: 2, nose: 0.1, tail: 0.08, bumperLow: 0.3,
	},
	wells: [ { f0: 0.64, f1: - 1.86, floor: 0.3, wall: 0.075, ramp: 0.12 } ],
	gh: {
		belt: [ 0.9, - 1.98 ], roof: [ - 0.1, - 1.34 ],
		w: [ [ - 0.1, 0.63 ], [ - 1.34, 0.6 ] ], y: [ [ - 0.1, 1.38 ], [ - 0.6, 1.395 ], [ - 1.34, 1.37 ] ],
		cr: 0.055, crR: 0.075, crown: 0.035, edgeRise: 0.012,
		side: [ { to: [ - 0.36, - 0.42 ], kind: 'glass' }, { to: [ - 0.45, - 0.5 ], kind: 'black' }, { to: [ - 1.26, - 0.98 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.07, 0.94 ], frame: 0.022, bulge: 0.02, wsBulge: 0.05, rwBulge: 0.03, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 0.88, - 0.4 ], [ - 0.42, - 1.3 ] ],
	hood: [ 2.36, 0.94, 0.72 ], deck: [ - 2.02, - 2.38, 0.7 ],
	lamps: {
		head: { x: 0.55, y: 0.675, w: 0.42, h: 0.125, slant: 0.05 },
		tail: { x: 0.56, y: 0.86, w: 0.42, h: 0.13, round: 0.25 },
		third: true,
	},
	grille: { y: 0.58, w: 0.7, h: 0.12, frame: 'chrome', badge: true, lower: { y: 0.37, w: 1.0, h: 0.12 }, fog: { x: 0.66, y: 0.38 } },
	plates: { front: 0.45, rear: 0.76 },
	mirror: { f: 0.76, y: 0.99 },
	fuel: { f: - 1.78, y: 0.86, side: - 1 },
	driver: { x: - 0.37, hipY: 0.5, f: - 0.28 },
	seatRows: [ { f: - 0.28, xs: [ - 0.37, 0.37 ] }, { f: - 1.2, bench: 1.34, dy: 0.05, heads: [ - 0.4, 0, 0.4 ] } ],
	interior: { shelf: [ - 1.66, 0.36, 0.66, 1.0 ], seat: 'seatTan' },
	wheel: { style: 'alloy', spokes: 5, split: true },
	exhaustX: - 0.6,
	build: buildCar,
} );

// ---- double-cab pickup (Tacoma class): 5.39 x 1.91 x 1.79 m, wheelbase 3.24 m ------------------------------------------
CARS.pickup = () => ( {
	L: 5.39, W: 1.91, H: 1.79, front: 2.7, rear: - 2.69,
	wheelR: 0.39, wheelW: 0.265, track: 1.6, axleF: 1.78, axleR: - 1.46, archR: 0.45, archLift: 0.03,
	body: {
		width: [ [ 2.7, 0.78 ], [ 2.64, 0.88 ], [ 2.45, 0.93 ], [ 2.0, 0.945 ], [ 0, 0.95 ], [ - 2.55, 0.95 ], [ - 2.69, 0.93 ] ],
		bottom: [ [ 2.7, 0.52 ], [ 2.45, 0.45 ], [ 2.1, 0.43 ], [ 0, 0.43 ], [ - 2.2, 0.48 ], [ - 2.69, 0.56 ] ],
		edge: [ [ 2.7, 1.02 ], [ 2.63, 1.1 ], [ 2.3, 1.14 ], [ 1.3, 1.17 ], [ 1.05, 1.19 ], [ 0, 1.22 ], [ - 1.0, 1.24 ], [ - 2.69, 1.24 ] ],
		top: [ [ 2.7, 1.03 ], [ 2.63, 1.12 ], [ 2.3, 1.16 ], [ 1.3, 1.18 ], [ 1.05, 1.19 ], [ - 1.0, 1.23 ], [ - 2.69, 1.23 ] ],
		shoulder: 0.14, tumble: 0.025, tuck: 0.03, rb: 0.06, re: 0.035, crownPow: 3, nose: 0.08, tail: 0.03,
	},
	wells: [
		{ f0: 0.9, f1: - 0.95, floor: 0.62, wall: 0.08, ramp: 0.1 },
		{ f0: - 1.08, f1: - 2.6, floor: 0.9, wall: 0.055, ramp: 0.03, inner: 'paint', floorMat: 'trim', sill: 'paint' },
	],
	gh: {
		belt: [ 1.1, - 0.99 ], roof: [ 0.22, - 0.93 ],
		w: [ [ 0.22, 0.7 ], [ - 0.93, 0.7 ] ], y: [ [ 0.22, 1.745 ], [ - 0.4, 1.76 ], [ - 0.93, 1.75 ] ],
		cr: 0.06, crR: 0.08, crown: 0.03, edgeRise: 0.01,
		side: [ { to: [ - 0.08, - 0.1 ], kind: 'glass' }, { to: [ - 0.16, - 0.18 ], kind: 'black' }, { to: [ - 0.8, - 0.78 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.06, 0.93 ], frame: 0.024, bulge: 0.015, wsBulge: 0.05, rwBulge: 0.0, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 1.02, - 0.12 ], [ - 0.14, - 0.94 ] ],
	hood: [ 2.62, 1.14, 0.78 ],
	lamps: {
		head: { x: 0.66, y: 1.0, w: 0.34, h: 0.17 },
		tail: { x: 0.87, y: 0.98, w: 0.1, h: 0.36, round: 0.2, rev: true, ind: false },
		third: true,
	},
	grille: { y: 0.97, w: 0.92, h: 0.28, style: 'bars', bars: 3, frame: 'chrome', badge: true },
	bumpers: { front: { y: 0.66, h: 0.22, d: 0.16, mat: 'chrome', w: 1.86 }, rear: { y: 0.66, h: 0.2, d: 0.18, mat: 'chrome', step: true, w: 1.86 } },
	plates: { front: 0.66, rear: 0.66 },
	mirror: { f: 1.0, y: 1.3, big: 1.25, mat: 'trim' },
	fuel: { f: - 1.95, y: 1.06, side: - 1 },
	driver: { x: - 0.4, hipY: 0.9, f: - 0.02 },
	seatRows: [ { f: - 0.02, xs: [ - 0.4, 0.4 ] }, { f: - 0.76, bench: 1.36, dy: 0.02, heads: [ - 0.42, 0.42 ] } ],
	wheel: { style: 'alloy', spokes: 6 },
	exhaustX: 0.7,
	extra: ( b ) => {
		wellWall( b, - 0.965, { well: 0, y0: 0.62 } );
		wellWall( b, - 1.065, { well: 1, y0: 0.9 } );
		// tailgate handle and bed rail caps
		const h = b.hitRear( 0, 1.12 );
		if ( h ) b.k.box( 0.22, 0.05, 0.03, MAT.trim, { p: [ 0, 1.12, h.point[ 2 ] + 0.012 ] }, 0.012 );
	},
	build: buildCar,
} );

// ---- mid-size SUV (4Runner class): 4.83 x 1.93 x 1.82 m, wheelbase 2.79 m --------------------------------------------
CARS.suv = () => ( {
	L: 4.83, W: 1.93, H: 1.82, front: 2.42, rear: - 2.41,
	wheelR: 0.385, wheelW: 0.265, track: 1.62, axleF: 1.46, axleR: - 1.33, archR: 0.44, archLift: 0.03,
	body: {
		width: [ [ 2.42, 0.76 ], [ 2.36, 0.88 ], [ 2.15, 0.94 ], [ 1.8, 0.955 ], [ 0, 0.96 ], [ - 2.1, 0.955 ], [ - 2.32, 0.93 ], [ - 2.41, 0.87 ] ],
		bottom: [ [ 2.42, 0.48 ], [ 2.2, 0.4 ], [ 1.9, 0.36 ], [ 0, 0.35 ], [ - 1.9, 0.37 ], [ - 2.2, 0.42 ], [ - 2.41, 0.5 ] ],
		edge: [ [ 2.42, 0.98 ], [ 2.34, 1.06 ], [ 2.1, 1.1 ], [ 1.4, 1.13 ], [ 1.0, 1.16 ], [ 0, 1.2 ], [ - 1.5, 1.22 ], [ - 2.3, 1.22 ], [ - 2.41, 1.16 ] ],
		top: [ [ 2.42, 0.99 ], [ 2.34, 1.07 ], [ 2.1, 1.12 ], [ 1.4, 1.14 ], [ 1.0, 1.17 ], [ - 2.3, 1.22 ], [ - 2.41, 1.16 ] ],
		shoulder: 0.12, tumble: 0.03, tuck: 0.035, rb: 0.06, re: 0.035, crownPow: 2.5, nose: 0.09, tail: 0.05,
	},
	cladY: 0.52,
	wells: [ { f0: 0.86, f1: - 2.28, floor: 0.56, wall: 0.08, ramp: 0.1 } ],
	gh: {
		belt: [ 1.02, - 2.34 ], roof: [ 0.12, - 2.28 ],
		w: [ [ 0.12, 0.72 ], [ - 2.28, 0.7 ] ], y: [ [ 0.12, 1.77 ], [ - 1.0, 1.79 ], [ - 2.28, 1.77 ] ],
		cr: 0.06, crR: 0.08, crown: 0.03, edgeRise: 0.01,
		side: [ { to: [ - 0.28, - 0.3 ], kind: 'glass' }, { to: [ - 0.36, - 0.38 ], kind: 'black' }, { to: [ - 1.3, - 1.28 ], kind: 'glass' }, { to: [ - 1.4, - 1.38 ], kind: 'black' }, { to: [ - 2.02, - 1.98 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.06, 0.93 ], frame: 0.024, bulge: 0.015, wsBulge: 0.05, rwBulge: 0.02, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 0.98, - 0.34 ], [ - 0.36, - 1.32 ] ],
	hood: [ 2.34, 1.06, 0.78 ],
	lamps: {
		head: { x: 0.62, y: 0.98, w: 0.46, h: 0.16, slant: 0.06 },
		tail: { x: 0.8, y: 1.13, w: 0.17, h: 0.3, round: 0.25 },
		third: true,
	},
	grille: { y: 0.95, w: 0.9, h: 0.24, style: 'bars', bars: 2, frame: 'chrome', badge: true, lower: { y: 0.62, w: 1.1, h: 0.14 }, fog: { x: 0.72, y: 0.62 } },
	plates: { front: 0.64, rear: 0.92 },
	mirror: { f: 0.95, y: 1.28, big: 1.15 },
	fuel: { f: - 1.9, y: 1.1, side: - 1 },
	driver: { x: - 0.4, hipY: 0.86, f: - 0.22 },
	seatRows: [ { f: - 0.22, xs: [ - 0.4, 0.4 ] }, { f: - 1.1, bench: 1.42, dy: 0.04, heads: [ - 0.44, 0, 0.44 ] } ],
	interior: { seat: 'seatGrey' },
	wheel: { style: 'alloy', spokes: 6, split: true },
	exhaustX: 0.6,
	extra: ( b ) => { roofRails( b, { x: 0.56, bars: [ - 0.5, - 1.6 ] } ); },
	build: buildCar,
} );

// ---- police cruiser (Crown Victoria Police Interceptor): 5.39 x 1.99 x 1.46 m, wheelbase 2.91 m --------------------------
CARS.police_car = () => ( {
	L: 5.39, W: 1.99, H: 1.6, front: 2.7, rear: - 2.69,
	wheelR: 0.345, wheelW: 0.235, track: 1.63, axleF: 1.56, axleR: - 1.35, archR: 0.4, archLift: 0.02,
	body: {
		width: [ [ 2.7, 0.8 ], [ 2.64, 0.9 ], [ 2.45, 0.96 ], [ 2.0, 0.985 ], [ 0, 0.995 ], [ - 2.2, 0.985 ], [ - 2.55, 0.96 ], [ - 2.69, 0.88 ] ],
		bottom: [ [ 2.7, 0.36 ], [ 2.45, 0.27 ], [ 2.1, 0.22 ], [ 0, 0.21 ], [ - 2.1, 0.22 ], [ - 2.45, 0.28 ], [ - 2.69, 0.38 ] ],
		edge: [ [ 2.7, 0.76 ], [ 2.64, 0.81 ], [ 2.4, 0.84 ], [ 1.2, 0.86 ], [ 0.9, 0.88 ], [ 0, 0.9 ], [ - 1.5, 0.92 ], [ - 1.9, 0.93 ], [ - 2.55, 0.92 ], [ - 2.69, 0.87 ] ],
		top: [ [ 2.7, 0.77 ], [ 2.64, 0.82 ], [ 2.4, 0.85 ], [ 1.2, 0.87 ], [ 0.9, 0.89 ], [ - 1.9, 0.94 ], [ - 2.55, 0.93 ], [ - 2.69, 0.88 ] ],
		shoulder: 0.1, tumble: 0.03, tuck: 0.035, rb: 0.05, re: 0.03, crownPow: 3, nose: 0.06, tail: 0.05,
	},
	wells: [ { f0: 0.74, f1: - 1.95, floor: 0.32, wall: 0.075, ramp: 0.12 } ],
	// black-and-white: white doors and roof
	livery: ( c ) => ( Math.abs( c[ 0 ] ) > 0.7 && - c[ 2 ] < 0.95 && - c[ 2 ] > - 1.4 && c[ 1 ] > 0.33 ? 'paint2' : null ),
	gh: {
		belt: [ 0.96, - 1.98 ], roof: [ - 0.05, - 1.3 ],
		w: [ [ - 0.05, 0.68 ], [ - 1.3, 0.66 ] ], y: [ [ - 0.05, 1.415 ], [ - 0.6, 1.425 ], [ - 1.3, 1.405 ] ],
		cr: 0.06, crR: 0.08, crown: 0.025, edgeRise: 0.01, roofMat: 'paint2', railMat: 'paint2',
		side: [ { to: [ - 0.4, - 0.44 ], kind: 'glass' }, { to: [ - 0.48, - 0.52 ], kind: 'black' }, { to: [ - 1.3, - 1.02 ], kind: 'glass' }, { to: 'end', kind: 'paint2' } ],
		band: [ 0.07, 0.94 ], frame: 0.022, bulge: 0.015, wsBulge: 0.05, rwBulge: 0.03, aPillar: 'paint2', cPillar: 'paint2',
	},
	doors: [ [ 0.94, - 0.46 ], [ - 0.48, - 1.38 ] ], handleMat: 'chrome',
	hood: [ 2.62, 0.98, 0.8 ], deck: [ - 2.02, - 2.62, 0.78 ],
	lamps: {
		head: { x: 0.62, y: 0.71, w: 0.36, h: 0.14, round: 0.2 },
		tail: { x: 0.62, y: 0.79, w: 0.4, h: 0.15, round: 0.15 },
	},
	grille: { y: 0.67, w: 0.64, h: 0.13, style: 'mesh', frame: 'chrome' },
	bumpers: { front: { y: 0.47, h: 0.18, d: 0.12, mat: 'trim', w: 1.9 }, rear: { y: 0.5, h: 0.18, d: 0.12, mat: 'trim', w: 1.9 } },
	plates: { front: 0.47, rear: 0.78 },
	mirror: { f: 0.84, y: 0.95, mat: 'trim' },
	fuel: { f: - 1.85, y: 0.8, side: - 1 },
	driver: { x: - 0.4, hipY: 0.52, f: - 0.3 },
	seatRows: [ { f: - 0.3, xs: [ - 0.4, 0.4 ] }, { f: - 1.25, bench: 1.4, dy: 0.04 } ],
	wheel: { style: 'steel', holes: 5, rimColor: 0x1c1c1e },
	exhaustX: 0.6,
	antenna: [ - 0.3, - 1.9 ],
	extra: ( b ) => {
		lightbar( b, { f: - 0.35 } );
		pushBar( b, { y: 0.6, w: 0.95, y0: 0.32, y1: 0.86 } );
		spotLamp( b, - 1 );
		sideDecal( b, 0.24, 0.62, 0.95, 0.28, ATLAS.police, { nu: 8, nv: 2 } );
		// prisoner partition behind the front seats
		b.k.with( 'near', () => b.k.box( 1.5, 0.55, 0.02, mat( 'glassDark', { c: 0x20262c, r: 0.3 } ), { p: [ 0, 1.08, 0.72 ] }, 0.01 ) );
	},
	build: buildCar,
} );

// ---- passenger van (Transit class): 5.53 x 2.03 x 2.35 m, wheelbase 3.3 m ----------------------------------------------
CARS.van = () => ( {
	L: 5.53, W: 2.03, H: 2.35, front: 2.77, rear: - 2.76,
	wheelR: 0.36, wheelW: 0.235, track: 1.72, axleF: 1.95, axleR: - 1.35, archR: 0.42, archLift: 0.03,
	body: {
		width: [ [ 2.77, 0.8 ], [ 2.7, 0.92 ], [ 2.5, 0.98 ], [ 2.1, 1.0 ], [ 0, 1.01 ], [ - 2.6, 1.01 ], [ - 2.76, 0.98 ] ],
		bottom: [ [ 2.77, 0.44 ], [ 2.5, 0.35 ], [ 2.2, 0.32 ], [ 0, 0.32 ], [ - 2.3, 0.34 ], [ - 2.76, 0.42 ] ],
		edge: [ [ 2.77, 1.06 ], [ 2.72, 1.12 ], [ 2.45, 1.17 ], [ 2.05, 1.2 ], [ 1.8, 1.22 ], [ 0, 1.22 ], [ - 2.7, 1.22 ], [ - 2.76, 1.18 ] ],
		top: [ [ 2.77, 1.07 ], [ 2.72, 1.13 ], [ 2.45, 1.18 ], [ 2.05, 1.21 ], [ 1.8, 1.23 ], [ - 2.7, 1.23 ], [ - 2.76, 1.19 ] ],
		shoulder: 0.1, tumble: 0.03, tuck: 0.03, rb: 0.06, re: 0.04, crownPow: 3, nose: 0.08, tail: 0.03,
	},
	cladY: 0.45,
	wells: [ { f0: 1.66, f1: - 2.68, floor: 0.52, wall: 0.07, ramp: 0.1 } ],
	gh: {
		belt: [ 1.82, - 2.74 ], roof: [ 0.95, - 2.73 ],
		w: [ [ 0.95, 0.83 ], [ - 2.73, 0.85 ] ], y: [ [ 0.95, 2.27 ], [ 0, 2.3 ], [ - 2.73, 2.28 ] ],
		cr: 0.08, crR: 0.12, crown: 0.04, edgeRise: 0.02,
		side: [ { to: [ 0.92, 0.8 ], kind: 'glass' }, { to: [ 0.84, 0.72 ], kind: 'black' }, { to: [ - 0.25, - 0.25 ], kind: 'glass' }, { to: [ - 0.33, - 0.33 ], kind: 'black' }, { to: [ - 2.35, - 2.35 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.05, 0.84 ], frame: 0.028, bulge: 0.01, wsBulge: 0.06, rwBulge: 0.0, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 1.76, 0.86 ], [ 0.8, - 0.32 ] ],
	hood: [ 2.7, 1.82, 0.8 ],
	lamps: {
		head: { x: 0.7, y: 0.97, w: 0.3, h: 0.18, slant: - 0.12, round: 0.4 },
		tail: { x: 0.93, y: 1.32, w: 0.1, h: 0.46, round: 0.2 },
		third: true,
	},
	grille: { y: 0.8, w: 0.96, h: 0.24, style: 'bars', bars: 3, frame: 'trim' },
	bumpers: { front: { y: 0.5, h: 0.24, d: 0.12, mat: 'trim', w: 1.96 }, rear: { y: 0.5, h: 0.2, d: 0.16, mat: 'trim', step: true, w: 1.96 } },
	plates: { front: 0.5, rear: 0.9 },
	mirror: { f: 1.64, y: 1.34, big: 1.4, tall: 1.6, mat: 'trim' },
	fuel: { f: 1.25, y: 1.0, side: - 1 },
	driver: { x: - 0.45, hipY: 0.98, f: 0.95 },
	seatRows: [ { f: 0.95, xs: [ - 0.45, 0.45 ] }, { f: 0.1, bench: 1.62, dy: 0.02 }, { f: - 0.8, bench: 1.62, dy: 0.02 }, { f: - 1.7, bench: 1.62, dy: 0.02 } ],
	interior: { dashTop: 1.28 },
	wheel: { style: 'steel', holes: 5 },
	exhaustX: - 0.7,
	extra: ( b ) => {
		// the rear doors' centre seam and handle
		const h = b.hitRear( 0, 1.2 );
		if ( h ) {
			b.k.box( 0.008, 1.8, 0.01, mat( 'gloss', { c: 0x050505 } ), { p: [ 0, 1.32, h.point[ 2 ] + 0.004 ] } );
			b.k.box( 0.03, 0.14, 0.03, MAT.trim, { p: [ 0.08, 1.2, h.point[ 2 ] + 0.012 ] }, 0.01 );
		}
	},
	build: buildCar,
} );

// ---- sports coupe (370Z / Cayman class): 4.25 x 1.85 x 1.31 m, wheelbase 2.55 m ------------------------------------------
CARS.sports_car = () => ( {
	L: 4.25, W: 1.87, H: 1.31, front: 2.13, rear: - 2.12,
	wheelR: 0.33, wheelW: 0.265, track: 1.6, axleF: 1.3, axleR: - 1.25, archR: 0.35, archLift: 0,
	body: {
		width: [ [ 2.13, 0.6 ], [ 2.06, 0.8 ], [ 1.85, 0.9 ], [ 1.4, 0.925 ], [ 0.5, 0.915 ], [ - 0.9, 0.925 ], [ - 1.3, 0.94 ], [ - 1.8, 0.92 ], [ - 2.05, 0.86 ], [ - 2.12, 0.74 ] ],
		bottom: [ [ 2.13, 0.2 ], [ 1.9, 0.13 ], [ 0, 0.12 ], [ - 1.9, 0.15 ], [ - 2.12, 0.26 ] ],
		edge: [ [ 2.13, 0.52 ], [ 2.05, 0.6 ], [ 1.8, 0.68 ], [ 1.3, 0.74 ], [ 0.7, 0.755 ], [ 0, 0.775 ], [ - 1.2, 0.84 ], [ - 1.8, 0.86 ], [ - 2.05, 0.83 ], [ - 2.12, 0.76 ] ],
		top: [ [ 2.13, 0.52 ], [ 2.05, 0.59 ], [ 1.8, 0.645 ], [ 1.3, 0.69 ], [ 0.72, 0.735 ], [ - 1.9, 0.84 ], [ - 2.05, 0.83 ], [ - 2.12, 0.77 ] ],
		shoulder: [ [ 2.1, 0.06 ], [ 1.3, 0.09 ], [ 0, 0.1 ], [ - 1.3, 0.15 ], [ - 2.1, 0.1 ] ],
		tumble: 0.05, tuck: 0.05, rb: 0.025, re: 0.03, crownPow: 2.2, nose: 0.12, tail: 0.06, archGap: 0.01, edgeGap: 0.005,
	},
	wells: [ { f0: 0.52, f1: - 1.3, floor: 0.2, wall: 0.075, ramp: 0.12 } ],
	gh: {
		belt: [ 0.74, - 1.95 ], roof: [ - 0.3, - 0.95 ],
		w: [ [ - 0.3, 0.58 ], [ - 0.95, 0.52 ] ], y: [ [ - 0.3, 1.265 ], [ - 0.6, 1.275 ], [ - 0.95, 1.24 ] ],
		cr: 0.05, crR: 0.08, crown: 0.03, edgeRise: 0.01,
		side: [ { to: [ - 0.92, - 0.84 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.06, 0.93 ], frame: 0.018, bulge: 0.02, wsBulge: 0.06, rwBulge: 0.05, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 0.62, - 0.74 ] ],
	hood: [ 2.06, 0.76, 0.62 ],
	lamps: {
		head: { x: 0.6, y: 0.56, w: 0.32, h: 0.085, slant: 0.14, round: 0.45, projectors: 0 },
		tail: { x: 0.6, y: 0.74, w: 0.4, h: 0.075, round: 0.6 },
		third: false,
	},
	grille: { y: 0.33, w: 0.82, h: 0.15, style: 'mesh', frame: 'none', round: 0.5, fog: { x: 0.68, y: 0.3 } },
	plates: { front: 0.3, rear: 0.52 },
	mirror: { f: 0.62, y: 0.82 },
	fuel: { f: - 1.62, y: 0.74, side: 1 },
	driver: { x: - 0.37, hipY: 0.34, f: - 0.45 },
	seatRows: [ { f: - 0.45, xs: [ - 0.37, 0.37 ], w: 0.5 } ],
	interior: { dashDepth: 0.6 },
	steerStyle: 'sport',
	wheel: { style: 'black', spokes: 10, caliper: 0xc81d1d },
	exhaustX: 0.4,
	extra: ( b ) => {
		spoiler( b, { f: - 1.98, h: 0.05, w: 1.42 } );
		const h = b.hitRear( - 0.4 * 0.935, 0.24 );
		if ( h ) b.k.cyl( 0.045, 0.045, 0.2, MAT.chrome, { p: [ - 0.37, 0.22, h.point[ 2 ] - 0.02 ], r: [ Math.PI / 2, 0, 0 ] }, 12, true );
	},
	build: buildCar,
} );

// ---- off-roader (Wrangler Unlimited): 4.88 x 1.89 x 1.85 m, wheelbase 3.01 m -------------------------------------------
CARS.jeep = () => ( {
	L: 4.88, W: 1.89, H: 1.85, front: 2.44, rear: - 2.44,
	wheelR: 0.4, wheelW: 0.285, track: 1.6, axleF: 1.55, axleR: - 1.46, archR: 0.48, archLift: 0.05,
	body: {
		width: [ [ 2.44, 0.8 ], [ 2.4, 0.84 ], [ 2.2, 0.85 ], [ 0, 0.87 ], [ - 2.3, 0.87 ], [ - 2.44, 0.85 ] ],
		bottom: [ [ 2.44, 0.62 ], [ 2.3, 0.55 ], [ 2.0, 0.5 ], [ 0, 0.5 ], [ - 2.0, 0.52 ], [ - 2.44, 0.6 ] ],
		edge: [ [ 2.44, 1.12 ], [ 2.4, 1.16 ], [ 2.1, 1.18 ], [ 1.2, 1.18 ], [ 1.0, 1.2 ], [ 0, 1.18 ], [ - 2.44, 1.2 ] ],
		top: [ [ 2.44, 1.12 ], [ 2.4, 1.17 ], [ 2.1, 1.18 ], [ 1.2, 1.17 ], [ 1.0, 1.19 ], [ - 2.44, 1.2 ] ],
		shoulder: 0.06, tumble: 0.012, tuck: 0.01, rb: 0.04, re: 0.03, crownPow: 4, nose: 0.03, tail: 0.03, crease: 0.4,
	},
	wells: [ { f0: 0.9, f1: - 2.32, floor: 0.66, wall: 0.07, ramp: 0.08, sill: 'paint' } ],
	gh: {
		belt: [ 1.0, - 2.4 ], roof: [ 0.84, - 2.38 ],
		w: [ [ 0.84, 0.74 ], [ - 2.38, 0.74 ] ], y: [ [ 0.84, 1.83 ], [ - 2.38, 1.83 ] ],
		cr: 0.03, crR: 0.05, crown: 0.015, edgeRise: 0.006, roofMat: 'trim', railMat: 'trim',
		side: [ { to: [ 0.05, 0.02 ], kind: 'glass' }, { to: [ - 0.02, - 0.05 ], kind: 'trim' }, { to: [ - 0.95, - 0.95 ], kind: 'glass' }, { to: [ - 1.02, - 1.02 ], kind: 'trim' }, { to: [ - 2.2, - 2.2 ], kind: 'glass' }, { to: 'end', kind: 'trim' } ],
		band: [ 0.04, 0.93 ], frame: 0.022, bulge: 0, wsBulge: 0, rwBulge: 0, aPillar: 'paint', cPillar: 'trim',
	},
	doors: [ [ 0.98, 0.0 ], [ - 0.03, - 0.98 ] ], handleMat: 'trim',
	hood: [ 2.4, 1.02, 0.72 ],
	lamps: {
		head: { x: 0.6, y: 0.99, w: 0.2, h: 0.19, style: 'round', bezel: 'paint', ind: false },
		tail: { x: 0.8, y: 0.96, w: 0.12, h: 0.28, round: 0.2 },
		repeater: false,
	},
	grille: { y: 0.96, w: 0.74, h: 0.32, style: 'slots', slots: 7 },
	bumpers: { front: { y: 0.67, h: 0.22, d: 0.2, mat: 'darksteel', w: 1.94, wrap: false }, rear: { y: 0.69, h: 0.2, d: 0.14, mat: 'darksteel', w: 1.72, wrap: false } },
	plates: { rear: 0.69 },
	mirror: { f: 0.88, y: 1.26, mat: 'trim' },
	fuel: { f: - 1.95, y: 1.05, side: - 1 },
	driver: { x: - 0.4, hipY: 0.96, f: 0.0 },
	seatRows: [ { f: 0.0, xs: [ - 0.4, 0.4 ] }, { f: - 0.95, bench: 1.34, dy: 0.04 } ],
	wheel: { style: 'offroad', holes: 5, rimColor: 0x2a2b2d },
	exhaustX: 0.6,
	noArches: false,
	extra: ( b ) => {
		flares( b, { width: 0.11, out: 0.1 } );
		spareWheel( b, { y: 1.18 } );
		rockRails( b, { y: 0.46 } );
	},
	build: buildCar,
} );

// ---- city bus (TheBus, 40 ft low floor): 12.2 x 2.59 x 3.2 m ---------------------------------------------------------------
CARS.bus = () => ( {
	L: 12.2, W: 2.59, H: 3.2, front: 6.1, rear: - 6.1,
	wheelR: 0.5, wheelW: 0.3, track: 2.1, axleF: 3.75, axleR: - 3.45, archR: 0.58, archLift: 0.03,
	body: {
		width: [ [ 6.1, 1.2 ], [ 6.05, 1.26 ], [ 5.9, 1.285 ], [ 0, 1.295 ], [ - 5.9, 1.29 ], [ - 6.1, 1.24 ] ],
		bottom: [ [ 6.1, 0.42 ], [ 5.8, 0.32 ], [ 0, 0.3 ], [ - 5.6, 0.32 ], [ - 6.1, 0.46 ] ],
		edge: [ [ 6.1, 0.96 ], [ 5.85, 1.0 ], [ 5.3, 1.18 ], [ 4.9, 1.22 ], [ 0, 1.22 ], [ - 6.1, 1.22 ] ],
		top: [ [ 6.1, 0.96 ], [ 5.85, 1.0 ], [ 5.3, 1.18 ], [ - 6.1, 1.22 ] ],
		shoulder: 0.08, tumble: 0.01, tuck: 0.01, rb: 0.05, re: 0.05, crownPow: 4, nose: 0.05, tail: 0.05, crease: 0.45,
	},
	wells: [ { f0: 5.45, f1: - 5.9, floor: 0.38, wall: 0.06, ramp: 0.2 } ],
	gh: {
		belt: [ 5.96, - 6.0 ], roof: [ 5.86, - 5.95 ],
		w: [ [ 5.86, 1.24 ], [ - 5.95, 1.24 ] ], y: [ [ 5.86, 3.0 ], [ 0, 3.02 ], [ - 5.95, 3.0 ] ],
		cr: 0.15, crR: 0.2, crown: 0.06, edgeRise: 0.04,
		side: [
			{ to: [ 4.0, 4.0 ], kind: 'glass' }, { to: [ 3.9, 3.9 ], kind: 'black' }, { to: [ 2.3, 2.3 ], kind: 'glass' }, { to: [ 2.2, 2.2 ], kind: 'black' },
			{ to: [ 0.6, 0.6 ], kind: 'glass' }, { to: [ 0.5, 0.5 ], kind: 'black' }, { to: [ - 1.1, - 1.1 ], kind: 'glass' }, { to: [ - 1.2, - 1.2 ], kind: 'black' },
			{ to: [ - 2.8, - 2.8 ], kind: 'glass' }, { to: [ - 2.9, - 2.9 ], kind: 'black' }, { to: [ - 4.5, - 4.5 ], kind: 'glass' }, { to: 'end', kind: 'paint' },
		],
		band: [ 0.02, 0.8 ], frame: 0.03, bulge: 0, wsBulge: 0.08, rwBulge: 0.02, aPillar: 'black', cPillar: 'paint',
	},
	doors: [],
	lamps: {
		head: { x: 0.95, y: 0.72, w: 0.34, h: 0.14, style: 'twin_round', bezel: 'chrome' },
		tail: { x: 1.05, y: 0.8, w: 0.14, h: 0.34, round: 0.4 },
		repeater: false,
	},
	bumpers: { front: { y: 0.46, h: 0.3, d: 0.1, mat: 'trim', w: 2.52, wrap: false }, rear: { y: 0.46, h: 0.3, d: 0.1, mat: 'trim', w: 2.52, wrap: false } },
	plates: { front: 0.46, rear: 0.46 },
	driver: { x: - 0.75, hipY: 1.0, f: 4.95 },
	seatRows: [ { f: 4.95, xs: [ - 0.75 ] } ],
	steerStyle: 'bus', steer: { r: 0.25, tilt: 0.95 },
	interior: { dashTop: 1.3, dashDepth: 0.6, noConsole: true },
	wheel: { style: 'steel', holes: 10, brakes: false },
	noWipers: false, wiperX: [ - 0.9, 0.1 ], wiperLen: 0.8,
	exhaustX: 0.8,
	extra: ( b ) => {
		busDetails( b );
		// passenger seats: pairs along both sides facing forward
		b.k.with( 'near', () => {
			for ( let f = 3.2; f > - 5.2; f -= 0.82 ) for ( const x of [ - 0.95, - 0.5, 0.5, 0.95 ] ) seatPair( b.k, x, f );
		} );
	},
	build: buildCar,
} );

// ---- Humvee (M1151): 4.93 x 2.3 x 1.9 m, wheelbase 3.3 m ----------------------------------------------------------------
CARS.humvee = () => ( {
	L: 4.93, W: 2.3, H: 1.9, front: 2.47, rear: - 2.46,
	wheelR: 0.47, wheelW: 0.32, track: 1.82, axleF: 1.65, axleR: - 1.65, archR: 0.55, archLift: 0.04,
	body: {
		width: [ [ 2.47, 1.0 ], [ 2.4, 1.1 ], [ 2.2, 1.14 ], [ 0, 1.15 ], [ - 2.3, 1.15 ], [ - 2.46, 1.12 ] ],
		bottom: [ [ 2.47, 0.62 ], [ 2.2, 0.52 ], [ 0, 0.47 ], [ - 2.2, 0.52 ], [ - 2.46, 0.6 ] ],
		edge: [ [ 2.47, 0.98 ], [ 2.2, 1.05 ], [ 1.4, 1.15 ], [ 0.9, 1.2 ], [ 0, 1.22 ], [ - 2.46, 1.22 ] ],
		top: [ [ 2.47, 0.98 ], [ 2.2, 1.06 ], [ 1.4, 1.18 ], [ 0.9, 1.22 ], [ - 1.1, 1.22 ], [ - 2.46, 1.22 ] ],
		shoulder: 0.04, tumble: 0.0, tuck: 0.0, rb: 0.03, re: 0.02, crownPow: 6, nose: 0.02, tail: 0.02, crease: 0.3,
	},
	wells: [
		{ f0: 0.82, f1: - 0.95, floor: 0.72, wall: 0.08, ramp: 0.06 },
		{ f0: - 1.02, f1: - 2.36, floor: 0.92, wall: 0.06, ramp: 0.04, inner: 'paint', floorMat: 'paint', sill: 'paint' },
	],
	gh: {
		belt: [ 0.94, - 1.0 ], roof: [ 0.7, - 0.98 ],
		w: [ [ 0.7, 0.98 ], [ - 0.98, 0.98 ] ], y: [ [ 0.7, 1.9 ], [ - 0.98, 1.9 ] ],
		cr: 0.03, crR: 0.04, crown: 0.01, edgeRise: 0.005,
		side: [ { to: [ 0.25, 0.2 ], kind: 'glass' }, { to: [ 0.02, 0.0 ], kind: 'paint' }, { to: [ - 0.7, - 0.72 ], kind: 'glass' }, { to: 'end', kind: 'paint' } ],
		band: [ 0.14, 0.74 ], frame: 0.04, bulge: 0, wsBulge: 0, rwBulge: 0, aPillar: 'paint', cPillar: 'paint',
	},
	doors: [ [ 0.92, 0.0 ], [ - 0.02, - 0.94 ] ], handleMat: 'darksteel',
	hood: [ 2.4, 0.98, 1.0 ],
	lamps: {
		head: { x: 0.74, y: 0.93, w: 0.15, h: 0.15, style: 'round', bezel: 'paint', ind: false },
		tail: { x: 1.0, y: 0.95, w: 0.12, h: 0.2, round: 0.1 },
		repeater: false,
	},
	grille: { y: 0.84, w: 0.9, h: 0.24, style: 'slots', slots: 9 },
	bumpers: { front: { y: 0.63, h: 0.2, d: 0.14, mat: 'paint', w: 2.2, wrap: false }, rear: { y: 0.67, h: 0.18, d: 0.12, mat: 'paint', w: 2.2, wrap: false } },
	mirror: { f: 0.86, y: 1.3, mat: 'paint', big: 1.1 },
	fuel: { f: - 1.9, y: 1.08, side: 1 },
	driver: { x: - 0.45, hipY: 1.06, f: 0.05 },
	seatRows: [ { f: 0.05, xs: [ - 0.45, 0.45 ] }, { f: - 0.82, xs: [ - 0.45, 0.45 ] } ],
	interior: { dash: 'plastic', seat: 'canvas' },
	wheel: { style: 'offroad', holes: 8, rimColor: 0x3d4030 },
	exhaustX: 0.8,
	noWipers: false,
	extra: ( b ) => {
		canvasCover( b, - 1.02, - 2.4, 1.72, 1.03, { y0: 1.22, mat: 'canvasTan' } );
		turretRing( b, { f: - 0.3 } );
		// split windshield: a centre post
		const G = b.P.gh;
		b.k.beam( [ 0, 1.25, - G.belt[ 0 ] + 0.01 ], [ 0, 1.86, - G.roof[ 0 ] + 0.01 ], 0.06, 0.04, MAT.paint, [ 0, 0, - 1 ], 0.005 );
		sideDecal( b, 0.46, 0.93, 0.44, 0.44, ATLAS.star, { mat: 'paint', nu: 6, nv: 6 } );
	},
	build: buildCar,
} );

// a forward-facing pair of bus seats (plastic shells on a frame)
function seatPair( k, x, f ) {
	const y = 0.8;
	const m = mat( 'seat', { c: 0x2a4a6a, r: 0.8 } );
	k.box( 0.42, 0.06, 0.42, m, { p: [ x, y, - f ] }, 0.02 );
	k.box( 0.42, 0.5, 0.05, m, { p: [ x, y + 0.28, - f + 0.22 ], r: [ - 0.12, 0, 0 ] }, 0.02 );
	k.box( 0.04, 0.42, 0.04, MAT.steel, { p: [ x, y - 0.22, - f ] }, 0.01 );
	k.rod( [ x + ( x > 0 ? - 0.2 : 0.2 ), y + 0.5, - f + 0.24 ], [ x + ( x > 0 ? - 0.2 : 0.2 ), y + 0.62, - f + 0.24 ], 0.015, MAT.chrome, 6 );
}
