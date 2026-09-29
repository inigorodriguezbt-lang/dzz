// Pure weapon data operations on ItemStacks (no three.js, no DOM: the Node test imports this).
// Everything that moves rounds between ammo stacks, magazines and guns lives here so the inventory UI,
// the reload animations and the tests all agree on the rules.
//
// Gun stack data (ItemDB): { mag: ItemStack|null, chamber: 0|1, rounds, mode, att: { optic, muzzle, light } }
// plus weapon-module fields: ammo (ammo id loaded in an internal feed), jam (bool).
// Magazine data: { rounds, ammo (ammo id of the rounds inside) }.
//
// Feed models:
//   mag feed:        chamber + magazine (open-bolt guns fire straight from the magazine once the chamber is empty)
//   internal feed:   chamber + tube / box `rounds` (pump, bolt, lever, SKS)
//   rounds only:     revolvers, break actions, bows and crossbows keep everything in `rounds` (no separate chamber)
import { getItem, makeStack, ITEMS } from '../game/items/ItemDB.js';

export const ROUNDS_ONLY = new Set( [ 'revolver', 'break', 'bow', 'crossbow' ] );

export const MODE_LABEL = { semi: 'Semi', burst: 'Burst', auto: 'Auto', bolt: 'Bolt', pump: 'Pump', single: 'Single' };

export const roundsOnly = ( f ) => ROUNDS_ONLY.has( f.action );
// actions that need a manual cycle (bolt, pump, lever) between shots
export const manualCycle = ( f, mode ) => mode === 'bolt' || mode === 'pump' || ( mode !== 'semi' && ( f.action === 'bolt' || f.action === 'lever' || f.action === 'pump' ) );

// ammo ids per calibre, cached
let AMMO_BY_CAL = null;
export function ammoIdsFor( caliber ) {
	if ( ! AMMO_BY_CAL || AMMO_BY_CAL.size === 0 || AMMO_BY_CAL._n !== ITEMS.size ) {
		AMMO_BY_CAL = new Map();
		AMMO_BY_CAL._n = ITEMS.size;
		for ( const d of ITEMS.values() ) if ( d.cat === 'ammo' ) {
			if ( ! AMMO_BY_CAL.has( d.ammo.caliber ) ) AMMO_BY_CAL.set( d.ammo.caliber, [] );
			AMMO_BY_CAL.get( d.ammo.caliber ).push( d.id );
		}
	}
	return AMMO_BY_CAL.get( caliber ) || [];
}

// the ammo id a magazine / gun holds (the first ammo of the calibre when unknown)
export function ammoIdIn( stack, caliber ) {
	return stack?.data?.ammo || ammoIdsFor( caliber )[ 0 ] || null;
}

// normalise a gun stack (old saves, makeStack quirks): every field present, counts in range
export function sanitizeGun( stack ) {
	const def = getItem( stack?.id );
	if ( ! def?.firearm ) return stack;
	const f = def.firearm, d = stack.data || ( stack.data = {} );
	if ( d.mag === undefined ) d.mag = null;
	if ( ! d.att ) d.att = {};
	d.chamber = d.chamber ? 1 : 0;
	d.rounds = Math.max( 0, d.rounds | 0 );
	d.mode = Math.max( 0, Math.min( f.modes.length - 1, d.mode | 0 ) );
	if ( f.feed === 'internal' ) {
		if ( roundsOnly( f ) ) {
			// a revolver / break action has no separate chamber: fold it into the cylinder
			d.rounds = Math.min( f.capacity, d.rounds + d.chamber );
			d.chamber = 0;
		} else d.rounds = Math.min( f.capacity, d.rounds );
	} else if ( d.mag && ! ( f.mags || [] ).includes( d.mag.id ) ) {
		d.mag = null;
	}
	if ( d.mag ) { const md = getItem( d.mag.id ); if ( md ) d.mag.data.rounds = Math.max( 0, Math.min( md.magazine.capacity, d.mag.data.rounds | 0 ) ); }
	return stack;
}

export function roundsIn( stack ) {
	const def = getItem( stack.id );
	if ( def?.cat === 'magazine' ) return stack.data.rounds || 0;
	if ( ! def?.firearm ) return 0;
	const d = stack.data;
	return ( d.chamber || 0 ) + ( def.firearm.feed === 'mag' ? ( d.mag?.data.rounds || 0 ) : ( d.rounds || 0 ) );
}

// room left for loose rounds (internal feeds): the chamber counts for rounds-only guns
export function internalRoom( stack ) {
	const f = getItem( stack.id ).firearm;
	return Math.max( 0, f.capacity - ( stack.data.rounds || 0 ) );
}

export function modeName( stack ) {
	const f = getItem( stack.id )?.firearm;
	if ( ! f ) return '';
	return MODE_LABEL[ f.modes[ stack.data.mode || 0 ] ] || '';
}

// can this magazine go in this gun?
export const magFits = ( gunDef, magId ) => ( gunDef?.firearm?.mags || [] ).includes( magId );

// can this attachment go on this gun? -> { ok, slot, reason }
export function attachmentFits( gunDef, attDef ) {
	const f = gunDef?.firearm, a = attDef?.attachment;
	if ( ! f || ! a ) return { ok: false, reason: 'Not an attachment' };
	const slot = a.slot;
	if ( ! ( f.rails || [] ).includes( slot ) ) return { ok: false, slot, reason: `The ${gunDef.name} has no ${slot === 'optic' ? 'optic rail' : slot === 'muzzle' ? 'threaded muzzle' : 'light rail'}` };
	if ( slot === 'muzzle' && ! ( f.muzzles || [] ).includes( attDef.id ) ) return { ok: false, slot, reason: `${attDef.name} doesn't fit the ${gunDef.name}` };
	const fits = a.fits || [];
	if ( fits.length && ! fits.includes( f.cls ) && ! fits.includes( gunDef.id ) ) return { ok: false, slot, reason: `${attDef.name} doesn't fit the ${gunDef.name}` };
	return { ok: true, slot };
}

// load up to n rounds from an ammo stack into a magazine; returns the number moved
export function loadMagazine( mag, ammo, n = Infinity ) {
	const md = getItem( mag.id )?.magazine, ad = getItem( ammo.id )?.ammo;
	if ( ! md || ! ad || md.caliber !== ad.caliber ) return 0;
	const room = md.capacity - ( mag.data.rounds || 0 );
	const k = Math.max( 0, Math.min( room, ammo.qty, n ) );
	if ( k <= 0 ) return 0;
	// a magazine holds one kind of round: loading slugs over buckshot turns the lot into slugs (close enough)
	mag.data.rounds = ( mag.data.rounds || 0 ) + k;
	mag.data.ammo = ammo.id;
	ammo.qty -= k;
	return k;
}

// empty a magazine: -> { id, qty } of loose rounds (qty 0 when empty)
export function unloadMagazine( mag ) {
	const md = getItem( mag.id )?.magazine;
	if ( ! md ) return { id: null, qty: 0 };
	const qty = mag.data.rounds || 0;
	const id = ammoIdIn( mag, md.caliber );
	mag.data.rounds = 0;
	return { id, qty };
}

// load up to n loose rounds into an internal feed; returns the number moved
export function loadInternal( gun, ammo, n = Infinity ) {
	const f = getItem( gun.id )?.firearm, ad = getItem( ammo.id )?.ammo;
	if ( ! f || ! ad || f.feed !== 'internal' || f.caliber !== ad.caliber ) return 0;
	sanitizeGun( gun );
	const k = Math.max( 0, Math.min( internalRoom( gun ), ammo.qty, n ) );
	if ( k <= 0 ) return 0;
	gun.data.rounds += k;
	gun.data.ammo = ammo.id;
	ammo.qty -= k;
	return k;
}

// take everything out of a gun: -> { mag: ItemStack|null, rounds: [ { id, qty } ] }
export function unloadGun( gun ) {
	const def = getItem( gun.id ), f = def?.firearm;
	const out = { mag: null, rounds: [] };
	if ( ! f ) return out;
	sanitizeGun( gun );
	const d = gun.data;
	const ammoId = f.feed === 'mag' ? ammoIdIn( d.mag, f.caliber ) : ammoIdIn( gun, f.caliber );
	let loose = d.chamber || 0;
	d.chamber = 0; d.jam = false;
	if ( f.feed === 'mag' ) { out.mag = d.mag; d.mag = null; } else { loose += d.rounds || 0; d.rounds = 0; }
	if ( loose > 0 && ammoId ) out.rounds.push( { id: ammoId, qty: loose } );
	return out;
}

// chamber a round from the feed (charging handle, pump, bolt, lever): returns true when a round went in
export function chamberRound( gun ) {
	const f = getItem( gun.id ).firearm, d = gun.data;
	if ( roundsOnly( f ) || d.chamber ) return false;
	if ( f.feed === 'mag' ) {
		if ( f.action === 'open' ) return false;
		if ( d.mag && d.mag.data.rounds > 0 ) { d.mag.data.rounds --; d.chamber = 1; d.chamberAmmo = ammoIdIn( d.mag, f.caliber ); return true; }
		return false;
	}
	if ( d.rounds > 0 ) { d.rounds --; d.chamber = 1; d.chamberAmmo = ammoIdIn( gun, f.caliber ); return true; }
	return false;
}

// is there a round ready to fire right now?
export function readyToFire( gun ) {
	const f = getItem( gun.id ).firearm, d = gun.data;
	if ( roundsOnly( f ) ) return ( d.rounds || 0 ) > 0;
	if ( d.chamber ) return true;
	return f.action === 'open' && ( d.mag?.data.rounds || 0 ) > 0;
}

// could cycling the action chamber a round?
export function canChamber( gun ) {
	const f = getItem( gun.id ).firearm, d = gun.data;
	if ( roundsOnly( f ) || d.chamber || f.action === 'open' ) return false;
	return f.feed === 'mag' ? ( d.mag?.data.rounds || 0 ) > 0 : ( d.rounds || 0 ) > 0;
}

// fire one round: removes it and returns the ammo id fired (null = nothing to fire). Self-loading actions
// feed the next round; bolt / pump / lever guns wait for chamberRound().
export function consumeRound( gun ) {
	const def = getItem( gun.id ), f = def.firearm, d = gun.data;
	const mode = f.modes[ d.mode || 0 ];
	if ( roundsOnly( f ) ) {
		if ( ! ( d.rounds > 0 ) ) return null;
		d.rounds --;
		return ammoIdIn( gun, f.caliber );
	}
	let id = null;
	if ( d.chamber ) {
		id = d.chamberAmmo || ( f.feed === 'mag' ? ammoIdIn( d.mag, f.caliber ) : ammoIdIn( gun, f.caliber ) );
		d.chamber = 0;
	} else if ( f.action === 'open' && d.mag?.data.rounds > 0 ) {
		d.mag.data.rounds --;
		return ammoIdIn( d.mag, f.caliber );
	} else return null;
	// self-loading: the next round goes straight in (open bolts fire from the magazine instead)
	if ( ! manualCycle( f, mode ) && f.action !== 'open' ) chamberRound( gun );
	return id;
}

// ---- inventory helpers ----------------------------------------------------------------------------------------

// spare magazines for this gun in the inventory, fullest first
export function spareMags( inv, gun ) {
	const def = getItem( gun.id );
	return inv.findAll( ( s, d ) => d?.cat === 'magazine' && magFits( def, s.id ) && s !== gun.data.mag )
		.sort( ( a, b ) => ( b.data.rounds || 0 ) - ( a.data.rounds || 0 ) );
}

// the magazine a reload should grab: the fullest spare that beats what's in the gun
export function bestMagazine( inv, gun ) {
	const cur = gun.data.mag?.data.rounds ?? - 1;
	const m = spareMags( inv, gun )[ 0 ];
	return m && ( m.data.rounds || 0 ) > Math.max( 0, cur ) ? m : null;
}

// loose ammo for a calibre in the inventory (prefers `prefer`, then the biggest stack)
export function findAmmo( inv, caliber, prefer = null ) {
	const list = inv.findAll( ( s, d ) => d?.cat === 'ammo' && d.ammo.caliber === caliber && s.qty > 0 );
	if ( ! list.length ) return null;
	return list.find( s => s.id === prefer ) || list.sort( ( a, b ) => b.qty - a.qty )[ 0 ];
}

export function countAmmo( inv, caliber ) {
	let n = 0;
	for ( const s of inv.allStacks() ) { const d = getItem( s.id ); if ( d?.cat === 'ammo' && d.ammo.caliber === caliber ) n += s.qty; }
	return n;
}

// rounds available for this gun outside it: spare magazines + loose rounds
export function reserveFor( inv, gun ) {
	const def = getItem( gun.id ), f = def?.firearm;
	if ( ! f ) return 0;
	let n = countAmmo( inv, f.caliber );
	if ( f.feed === 'mag' ) for ( const m of spareMags( inv, gun ) ) n += m.data.rounds || 0;
	return n;
}

// give loose rounds to the inventory; returns what didn't fit as a stack (or null)
export function giveRounds( inv, id, qty ) {
	if ( ! id || qty <= 0 ) return null;
	const def = getItem( id );
	let left = qty, rest = null;
	while ( left > 0 ) {
		const n = Math.min( left, def.stack );
		const st = makeStack( id, n );
		st.qty = n;
		left -= n;
		const r = inv.add( st, { autoEquip: false } );
		if ( r > 0 ) { st.qty = r; rest = rest ? ( rest.qty += r, rest ) : st; }
	}
	return rest;
}
