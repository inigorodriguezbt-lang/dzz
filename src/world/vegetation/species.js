// Plant species shared by the scatter worker (placement) and the renderer (models, LOD, colliders).
// Plain data, no three.js import: the world worker loads this file too.
//
// Scatter output: per cell and per species a run of instances, STRIDE floats each:
//   [ x, y, z, s, yaw, rank, a, b ]
//   s     palms: trunk height (m); everything else: uniform scale of the model
//   rank  0..1 random, stable per plant: density thinning keeps rank < density, far thinning too
//   a, b  per species, see the table (`params`)

export const STRIDE = 8;

export const SP = {
	PALM: 0, MONKEYPOD: 1, KUKUI: 2, OHIA: 3, PINE: 4, IRONWOOD: 5, KIAWE: 6, TREEFERN: 7, BANANA: 8, TI: 9,
	SHRUB: 10, NAUPAKA: 11, TALLGRASS: 12, PINEAPPLE: 13, CANE: 14, ROCK: 15, FERN: 16, GRASS: 17,
};
export const NSP = 18;

// Which streamed layer a species lives in: 0 canopy (64 m cells out to the render distance), 1 detail
// (64 m cells near the camera: understory, crops, rocks), 2 grass (32 m cells right around the player)
export const LAYER = { CANOPY: 0, DETAIL: 1, GRASS: 2 };
export const LAYER_CELL = [ 64, 64, 32 ];

// name, layer, collider (trunk radius / height at scale 1, physics material), whether it takes an F action
//   params: meaning of the a, b instance fields
export const SPECIES = [
	{ id: SP.PALM, name: 'coconut palm', layer: 0, collider: { r: 0.21, h: 3.2, mat: 'wood' }, params: 'a lean (top offset / H), b lean azimuth (+8 when curved)' },
	{ id: SP.MONKEYPOD, name: 'monkeypod tree', layer: 0, collider: { r: 0.45, h: 3.5, mat: 'wood' }, params: 'a vertical stretch, b tint' },
	{ id: SP.KUKUI, name: 'kukui tree', layer: 0, collider: { r: 0.3, h: 4, mat: 'wood' }, params: 'a vertical stretch, b tint' },
	{ id: SP.OHIA, name: 'ʻōhiʻa lehua', layer: 0, collider: { r: 0.26, h: 4, mat: 'wood' }, params: 'a vertical stretch, b tint' },
	{ id: SP.PINE, name: 'Cook pine', layer: 0, collider: { r: 0.32, h: 5, mat: 'wood' }, params: 'a lean, b lean azimuth' },
	{ id: SP.IRONWOOD, name: 'ironwood', layer: 0, collider: { r: 0.24, h: 4, mat: 'wood' }, params: 'a vertical stretch, b tint' },
	{ id: SP.KIAWE, name: 'kiawe', layer: 0, collider: { r: 0.2, h: 2.2, mat: 'wood' }, params: 'a vertical stretch, b tint' },
	{ id: SP.TREEFERN, name: 'hāpuʻu tree fern', layer: 1, collider: { r: 0.17, h: 2.5, mat: 'wood' }, params: 'a trunk stretch, b tint' },
	{ id: SP.BANANA, name: 'banana', layer: 1, collider: { r: 0.14, h: 2, mat: 'foliage' }, params: 'a -, b fruiting (> 0.5)' },
	{ id: SP.TI, name: 'ti plant', layer: 1, collider: null, params: 'a -, b colour (red > 0.72)' },
	{ id: SP.SHRUB, name: 'shrub', layer: 1, collider: null, params: 'a flowering, b tint' },
	{ id: SP.NAUPAKA, name: 'naupaka', layer: 1, collider: null, params: 'a -, b tint' },
	{ id: SP.TALLGRASS, name: 'guinea grass', layer: 1, collider: null, params: 'a dryness, b -' },
	{ id: SP.PINEAPPLE, name: 'pineapple', layer: 1, collider: null, params: 'a -, b fruit' },
	{ id: SP.CANE, name: 'sugar cane', layer: 1, collider: null, params: 'a -, b tint' },
	{ id: SP.ROCK, name: 'rock', layer: 1, collider: { r: 0.8, h: 1.1, mat: 'rock' }, params: 'a squash, b lava (0 grey .. 1 black)' },
	{ id: SP.FERN, name: 'fern', layer: 1, collider: null, params: 'a -, b tint' },
	{ id: SP.GRASS, name: 'grass', layer: 2, collider: null, params: 'a dryness, b lawn (short)' },
];

export const SPECIES_OF_LAYER = [ 0, 1, 2 ].map( l => SPECIES.filter( s => s.layer === l ).map( s => s.id ) );

// palms: model trunk height; the vertex shader stretches the trunk to the instance height
export const PALM_H = 10;
