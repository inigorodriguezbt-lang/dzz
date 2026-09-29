// Road vehicle model parameters for body.js (proportions from real cars of each class, metres).
import { MAT, mat } from '../kit.js';
import { ATLAS } from '../materials.js';
import { sideX, spanAt, topAt } from './body.js';

export const CARS = {};

// ---- mid-size sedan (Camry / Accord class): 4.86 x 1.84 x 1.44 m, wheelbase 2.80 m -----------------
CARS.sedan = () => ( {
	L: 4.86, W: 1.84, H: 1.44, wheelR: 0.335, wheelW: 0.225, track: 1.58, axleF: 1.40, axleR: - 1.40,
	front: 2.47, rear: - 2.47, bottomY: 0.19, archR: 0.385, floorY: 0.33, shoulder: 0.74, tumble: 0.05,
	planF: [ 0.55, 0.16 ], planR: [ 0.4, 0.1 ], crown: 0.035, bevel: 0.05,
	top: [
		[ 2.36, 0.2, 0 ], [ 2.44, 0.3, 0.05 ], [ 2.48, 0.5, 0.1 ], [ 2.43, 0.66, 0.08 ], [ 2.27, 0.76, 0.14 ],
		[ 1.6, 0.855, 0.45 ], [ 0.84, 0.905, 0.04 ],
		[ 0.8, 0.33, 0 ], [ - 0.95, 0.33, 0.02 ], [ - 1.0, 0.73, 0.02 ], [ - 1.42, 0.75, 0 ],
		[ - 1.46, 0.955, 0.02 ], [ - 2.05, 1.0, 0.3 ], [ - 2.42, 0.97, 0.08 ], [ - 2.5, 0.78, 0.1 ],
		[ - 2.49, 0.5, 0.08 ], [ - 2.43, 0.3, 0.05 ], [ - 2.34, 0.2, 0 ],
	],
	gh: { beltY: 0.925, roofY: 1.435, wBelt: 0.79, wRoof: 0.65, ws: [ 0.82, - 0.1 ], rw: [ - 1.5, - 0.98 ], sideEnd: [ - 1.2, - 0.88 ], posts: [ [ - 0.3, - 0.4 ] ], wsBulge: 0.07 },
	doorF: [ [ 0.8, - 0.3 ], [ - 0.3, - 1.2 ] ], quarters: [ [ - 1.2, - 1.46, 0.7 ] ],
	cabinF: 0.8, cabinR: - 1.46,
	lamps: { head: { y: 0.69, x: 0.66, w: 0.4, h: 0.13, wrap: 0.42 }, tail: { y: 0.84, x: 0.66, w: 0.34, h: 0.12, wrap: 0.35 } },
	grille: { y: 0.55, w: 0.72, h: 0.16, chrome: true, lower: { y: 0.33, w: 1.0, h: 0.12 } },
	bumperTrim: 0.26, plateY: [ 0.47, 0.72 ], exhaustX: 0.6,
	seatF: - 0.22, hipY: 0.53, driverX: - 0.36,
	seatRows: [ { f: - 0.22, xs: [ - 0.36, 0.36 ] }, { f: - 1.12, xs: [], bench: 1.3, dy: 0.08 } ],
	interior: { shelf: [ - 1.42, 0.3, 0.96 ] },
	wheel: { style: 'alloy', spokes: 5, split: true },
} );
