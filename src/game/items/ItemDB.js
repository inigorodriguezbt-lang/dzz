// Item definitions and item stacks.
//
// ItemDef (static, registered with defineItems):
//   id           unique snake_case id, used by /give and saves
//   name, desc   display strings
//   cat          'firearm' | 'ammo' | 'magazine' | 'attachment' | 'melee' | 'clothing' | 'backpack' | 'food' | 'drink'
//                | 'medical' | 'tool' | 'throwable' | 'material' | 'fuel' | 'vehicle' | 'misc' | 'key' | 'book'
//   weight       kg per unit
//   size         volume units per unit (a can of beans is 1, a rifle 10-16, a backpack 8)
//   stack        max units per stack (1 for non-stackables)
//   rarity       'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' (loot weighting, border colour)
//   model        procedural model spec (see render/ItemModels.js)
//   tags         [ 'medical', 'military', 'police', 'kitchen', ... ] used by the loot tables
//   + one object named after the category with its specific properties:
//   firearm:    { cls: 'pistol'|'smg'|'rifle'|'shotgun'|'sniper'|'lmg'|'bow'|'launcher', caliber, feed: 'mag'|'internal',
//                 mags: [ magazine ids ] (feed mag), capacity (feed internal), rpm, modes: [ 'semi'|'burst'|'auto'|'bolt'|'pump'|'single' ],
//                 damage (per projectile, torso, at the muzzle), pellets, velocity (m/s), range (effective m), spread (rad, hip 0),
//                 recoil (1 = 5.56 carbine), ads (fov multiplier), noise (m heard), reload (s), boltTime (s),
//                 rails: [ 'optic', 'muzzle', 'light' ], muzzles: [ attachment ids ], handling (0..1 ads speed), slot: 'primary'|'sidearm' }
//   ammo:       { caliber, damage (multiplier), pellets?, tracer? }
//   magazine:   { caliber, capacity }
//   attachment: { slot: 'optic'|'muzzle'|'light', zoom (optics), reticle: 'dot'|'holo'|'acog'|'scope', noise (muzzle multiplier),
//                 flash (bool), fits: [ firearm classes or ids ] }
//   melee:      { damage, speed (swings/s), reach (m), stamina, kind: 'blade'|'blunt'|'axe'|'spear'|'fist', twoHanded,
//                 wear (condition lost per hit), tools: [ 'cut', 'chop', 'pry', 'dig', 'open_can', 'skin' ] }
//   clothing:   { slot: 'head'|'face'|'eyes'|'torso'|'vest'|'hands'|'legs'|'feet'|'belt'|'back', capacity (volume),
//                 insulation (0..1), armor: { bite, bullet } (0..1), waterproof (0..1), visibility (0..1), color }
//   backpack:   same as clothing with slot 'back'
//   food:       { kcal, water, spoil (game hours, 0 never), opener (needs a tool to open), raw (needs cooking),
//                 sick (chance of food poisoning), cooked: id when cooked, portions }
//   drink:      { water, kcal, alcohol, caffeine, container: liquid container id left when empty, sick }
//   medical:    { use (s), heal, blood, bleed (stops n wounds), infection (cure 0..1), pain, splint, sick (cure), rad, energy }
//   tool:       { kind: 'flashlight'|'headlamp'|'lighter'|'matches'|'canopener'|'compass'|'map'|'binoculars'|'watch'|'gps'
//                 |'fishingrod'|'toolbox'|'lockpick'|'crowbar'|'radio'|'sewing'|'pot'|'canteen'|'bottle'|'jerrycan'|'tent'
//                 |'sleepingbag'|'battery'|'rangefinder'|'nvg'|'flare', battery (hours), liquid (litres capacity), light: { range, angle, color } }
//   throwable:  { kind: 'frag'|'smoke'|'molotov'|'flashbang'|'flare', fuse (s), radius (m), damage }
//   fuel:       { litres, kind: 'gasoline'|'diesel'|'propane' }
//   vehicle:    { part: 'battery'|'sparkplug'|'tire'|'radiator'|'key', fits? }
//
// ItemStack (plain JSON, saved as is): { uid, id, qty, cond (0..1), data: {} }
//   firearm data: { mag: ItemStack|null, chamber: 0|1, rounds (internal feed), mode (index), att: { optic, muzzle, light } }
//   magazine data: { rounds }      liquid containers: { liquid: 'water'|'dirty'|'fuel'|'...' , amount (litres) }
//   food data: { age (game hours since found; spoil at def.food.spoil) }    lights: { charge (hours), on }

export const ITEMS = new Map();
export const CATEGORY_LABEL = {
	firearm: 'Firearm', ammo: 'Ammunition', magazine: 'Magazine', attachment: 'Attachment', melee: 'Melee weapon', clothing: 'Clothing',
	backpack: 'Backpack', food: 'Food', drink: 'Drink', medical: 'Medical', tool: 'Tool', throwable: 'Throwable', material: 'Material',
	fuel: 'Fuel', vehicle: 'Vehicle part', misc: 'Miscellaneous', key: 'Key', book: 'Book',
};
export const RARITY_WEIGHT = { common: 1, uncommon: 0.45, rare: 0.16, epic: 0.05, legendary: 0.015 };

export function defineItems( list ) {
	for ( const d of list ) {
		if ( ITEMS.has( d.id ) ) console.warn( 'duplicate item', d.id );
		const def = Object.assign( { weight: 0.2, size: 1, stack: 1, rarity: 'common', tags: [], desc: '', model: { type: 'box' } }, d );
		ITEMS.set( def.id, def );
	}
}

export const getItem = ( id ) => ITEMS.get( id );
export const allItems = () => [ ...ITEMS.values() ];

let UID = Date.now() % 1e9;
export const newUid = () => ( ++ UID ).toString( 36 );

// a new stack; `loot` fills magazines / guns partially the way a found item would be
export function makeStack( id, qty = 1, opts = {} ) {
	const def = ITEMS.get( id );
	if ( ! def ) return null;
	const s = { uid: newUid(), id, qty: Math.max( 1, Math.min( qty, def.stack ) ), cond: opts.cond ?? 1, data: {} };
	const rnd = opts.rnd || Math.random;
	switch ( def.cat ) {
		case 'magazine': s.data.rounds = opts.full ? def.magazine.capacity : opts.loot ? Math.floor( rnd() * rnd() * def.magazine.capacity ) : 0; break;
		case 'firearm': {
			const f = def.firearm;
			s.data = { mag: null, chamber: 0, rounds: 0, mode: 0, att: {} };
			if ( opts.full ) {
				if ( f.feed === 'mag' && f.mags?.length ) { s.data.mag = makeStack( f.mags[ 0 ], 1, { full: true } ); s.data.chamber = 1; }
				else { s.data.rounds = f.capacity; s.data.chamber = f.modes.includes( 'single' ) ? 0 : 1; }
			} else if ( opts.loot ) {
				if ( f.feed === 'mag' && f.mags?.length && rnd() < 0.35 ) s.data.mag = makeStack( f.mags[ 0 ], 1, { loot: true, rnd } );
				else if ( f.feed === 'internal' && rnd() < 0.3 ) s.data.rounds = Math.floor( rnd() * f.capacity );
			}
			break;
		}
		case 'tool':
			if ( def.tool.battery ) s.data.charge = opts.loot ? def.tool.battery * ( 0.2 + rnd() * 0.8 ) : def.tool.battery;
			if ( def.tool.liquid ) { s.data.liquid = opts.liquid || ( opts.loot && rnd() < 0.4 ? 'water' : null ); s.data.amount = s.data.liquid ? def.tool.liquid * ( opts.loot ? rnd() : 1 ) : 0; }
			break;
		case 'fuel': s.data.amount = opts.loot ? def.fuel.litres * ( 0.1 + rnd() * 0.9 ) : def.fuel.litres; break;
		case 'food': s.data.age = opts.loot && def.food.spoil ? rnd() * def.food.spoil * 0.6 : 0; break;
	}
	if ( opts.loot ) s.cond = Math.min( 1, 0.35 + rnd() * 0.75 );
	return s;
}

export function cloneStack( s ) { return s ? JSON.parse( JSON.stringify( s ) ) : null; }

export function stackWeight( s ) {
	const def = ITEMS.get( s.id );
	if ( ! def ) return 0;
	let w = def.weight * s.qty;
	if ( def.cat === 'firearm' && s.data.mag ) w += stackWeight( s.data.mag );
	if ( def.cat === 'magazine' ) w += ( s.data.rounds || 0 ) * 0.012;
	if ( s.data?.amount && ( def.tool?.liquid || def.fuel ) ) w += s.data.amount * ( s.data.liquid === 'fuel' || def.fuel ? 0.75 : 1 );
	if ( s.data?.att ) for ( const k in s.data.att ) if ( s.data.att[ k ] ) w += stackWeight( s.data.att[ k ] );
	return w;
}

export function stackVolume( s ) {
	const def = ITEMS.get( s.id );
	return def ? def.size * ( def.stack > 1 ? Math.ceil( s.qty / Math.max( 1, def.stackPerSlot || def.stack ) ) : s.qty ) : 1;
}

const unitState = ( s ) => !! ( s.data?.open || s.data?.left != null || s.data?.on );

export function canMerge( a, b ) {
	if ( a.id !== b.id ) return false;
	const def = ITEMS.get( a.id );
	if ( ! def || def.stack <= 1 ) return false;
	if ( def.cat === 'food' && Math.abs( ( a.data.age || 0 ) - ( b.data.age || 0 ) ) > 24 ) return false;
	// a unit with its own state (an open can, a half-eaten bar, a lit chemlight) stays its own stack
	if ( unitState( a ) || unitState( b ) ) return false;
	return true;
}

export function condLabel( c ) {
	return c > 0.85 ? 'Pristine' : c > 0.6 ? 'Worn' : c > 0.35 ? 'Damaged' : c > 0.1 ? 'Badly damaged' : 'Ruined';
}
export function condColor( c ) {
	return c > 0.85 ? '#8ee07a' : c > 0.6 ? '#c8e07a' : c > 0.35 ? '#ffb86b' : c > 0.1 ? '#ff8a6b' : '#ff5a65';
}

// food freshness 0 (spoiled) .. 1 (fresh)
export function freshness( s ) {
	const def = ITEMS.get( s.id );
	if ( ! def?.food?.spoil ) return 1;
	return Math.max( 0, 1 - ( s.data.age || 0 ) / def.food.spoil );
}

export function displayName( s ) {
	const def = ITEMS.get( s.id );
	if ( ! def ) return s.id;
	// a stack may carry its own name (an evolved dish: "Stew (taro, Spam, onion)")
	let n = typeof s.data?.name === 'string' && s.data.name ? s.data.name : def.name;
	if ( def.cat === 'food' && def.food.spoil && freshness( s ) <= 0 ) n = 'Rotten ' + n;
	return n;
}

// the ammo count to show for a stack (guns, magazines)
export function ammoOf( s ) {
	const def = ITEMS.get( s.id );
	if ( ! def ) return null;
	if ( def.cat === 'magazine' ) return s.data.rounds || 0;
	if ( def.cat === 'firearm' ) {
		if ( def.firearm.feed === 'mag' ) return ( s.data.mag ? s.data.mag.data.rounds : 0 ) + ( s.data.chamber || 0 );
		return ( s.data.rounds || 0 ) + ( s.data.chamber || 0 );
	}
	return null;
}
