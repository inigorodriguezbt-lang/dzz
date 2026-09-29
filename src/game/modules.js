// Content modules. Each exports install( game ) (sync or async) and registers its systems on the game:
// game.register( system ) for per-frame updates, game.interact.addProvider(...) for F-interactions,
// and sets its handle on the game (game.vegetation, game.city, game.items3d, game.hands, ...).
export const MODULES = [
	() => import( '../world/Vegetation.js' ),
	() => import( '../city/Roads.js' ),
	() => import( '../city/Buildings.js' ),
	() => import( './items/WorldItems.js' ),
	() => import( '../weapons/Hands.js' ),
	() => import( '../ai/Creatures.js' ),
	() => import( '../vehicles/Vehicles.js' ),
	() => import( './Commands.js' ),
];
