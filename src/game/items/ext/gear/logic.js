// The gear domain's rules and numbers (docs/ITEMS_PLAN.md "gear"), Node-safe: per-stack looks (dye), tailoring
// bonuses, wet clothes, fragile bags, dragging a suitcase and how much your clothes hide you.
//
// Per-stack state on clothing and bags (stack.data), read by the core through small hooks:
//   look  { dye }                  a dyed garment: render/Icons.js, WorldItems.js, the inventory and the arms draw
//                                  lookDef( lookKey( stack ) ) instead of the plain def (its model spec recoloured)
//   mods  { bite, bullet, ins, wp, cap }   added to the def's armour, insulation, waterproofing and storage
//                                  (Survival.hurt / temperature, Inventory.capacityOf, the inventory tooltip)
//   patches, pouches, pads         how many patches / pouches / pad sets were sewn or strapped on
//   wet   0..1                     soaked clothes: worn ones follow your wetness, carried ones dry out slowly
import { getItem } from '../../ItemDB.js';

export const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );

// ---- colours (hex math, no three.js) ------------------------------------------------------------------------------

const ch = ( c, s ) => ( c >> s ) & 255;
const pack = ( r, g, b ) => ( clamp( Math.round( r ), 0, 255 ) << 16 ) | ( clamp( Math.round( g ), 0, 255 ) << 8 ) | clamp( Math.round( b ), 0, 255 );
// k < 0 darkens towards black, k > 0 lightens towards white
export function tone( c, k ) {
	if ( typeof c !== 'number' ) return c;
	const f = ( v ) => k < 0 ? v * ( 1 + k ) : v + ( 255 - v ) * k;
	return pack( f( ch( c, 16 ) ), f( ch( c, 8 ) ), f( ch( c, 0 ) ) );
}
export function mix( a, b, t ) {
	return pack( ch( a, 16 ) + ( ch( b, 16 ) - ch( a, 16 ) ) * t, ch( a, 8 ) + ( ch( b, 8 ) - ch( a, 8 ) ) * t, ch( a, 0 ) + ( ch( b, 0 ) - ch( a, 0 ) ) * t );
}

// ---- dyes -----------------------------------------------------------------------------------------------------------

// vis: how much the garment stands out once dyed (clothing.visibility, read by camoFactor)
export const DYES = {
	black: { word: 'Black', color: 0x1c1c1f, vis: 0.25 },
	camo: { word: 'Camo', color: 0x56613b, print: 'woodland', color2: 0x3a3525, vis: 0.15 },
	tiedye: { word: 'Tie-dye', color: 0xc86a8a, print: 'tiedye', color2: 0xffffff, vis: 0.9 },
	bleach: { word: 'Bleached', vis: 0.7 },
};

// model types whose builders read colour and print from the spec (helmets and hard shells are painted, not dyed)
const DYE_TYPES = new Set( [ 'shirt', 'pants', 'hat', 'mask', 'gloves', 'backpack', 'vest', 'belt', 'shoes', 'gear_dress', 'gear_smock', 'gear_bag', 'gear_hat', 'gear_vest' ] );
const HARD = /helmet|hardhat/;
export function dyeable( def ) {
	if ( ! def || ( def.cat !== 'clothing' && def.cat !== 'backpack' ) || def.tags.includes( 'nodye' ) ) return false;
	const m = def.model || {};
	if ( ! DYE_TYPES.has( m.type ) ) return false;
	if ( m.type === 'hat' && HARD.test( m.style || '' ) ) return false;
	if ( m.type === 'mask' && ! [ 'bandana', 'balaclava', undefined ].includes( m.style ) ) return false;
	if ( m.type === 'gloves' && m.style === 'latex' ) return false;
	if ( m.type === 'shoes' && [ 'slippers', 'fins' ].includes( m.style ) ) return false;
	return true;
}
// a marker only covers small things: hats, masks, gloves, shoes, belts
const SMALL = new Set( [ 'head', 'face', 'hands', 'feet', 'belt' ] );
export const slotOf = ( def ) => def?.clothing?.slot || def?.backpack?.slot || null;
export const markable = ( def ) => dyeable( def ) && SMALL.has( slotOf( def ) );

// the model spec of a dyed garment
export function dyedSpec( model, dye ) {
	const D = DYES[ dye ], m = { ...model };
	if ( ! D ) return m;
	if ( dye === 'bleach' ) {
		// the colour washes out towards off-white; a print fades with it
		m.color = mix( tone( m.color ?? 0x888888, 0.55 ), 0xeae6dc, 0.35 );
		if ( typeof m.color2 === 'number' ) m.color2 = tone( m.color2, 0.45 );
		if ( typeof m.color3 === 'number' ) m.color3 = tone( m.color3, 0.45 );
		return m;
	}
	m.color = D.color;
	if ( D.print ) { m.print = D.print; m.color2 = D.color2; delete m.color3; }
	else if ( m.print ) {
		// black over a print: the pattern shows through, dark
		if ( typeof m.color2 === 'number' ) m.color2 = tone( m.color2, - 0.72 );
		if ( typeof m.color3 === 'number' ) m.color3 = tone( m.color3, - 0.72 );
	}
	if ( typeof m.sole === 'number' && dye === 'black' ) m.sole = 0x1a1a1a;
	return m;
}

const NAME_COLOUR = /^(white|black|grey|gray|red|blue|green|yellow|olive drab|pink|navy|tan|orange|brown) /i;
export function dyedName( def, dye ) {
	const D = DYES[ dye ];
	if ( ! D ) return def.name;
	const base = def.name.replace( /\s*\([^)]*\)\s*$/, '' ).replace( NAME_COLOUR, '' );
	return `${D.word} ${base.charAt( 0 ).toLowerCase()}${base.slice( 1 )}`;
}

// what draws a stack: its own id, or id~dye for a dyed one (a key render/Icons.js and WorldItems.js cache by)
export function lookKey( stack ) {
	const dye = stack?.data?.look?.dye;
	return dye && DYES[ dye ] ? stack.id + '~' + dye : stack?.id;
}
const LOOKS = new Map();
// the def to draw for a key: the plain def, or a copy with the recoloured model spec (cached, so the model cache,
// the icon store and the world item batches see one stable object per look)
export function lookDef( key ) {
	const plain = getItem( key );
	if ( plain || typeof key !== 'string' ) return plain;
	let d = LOOKS.get( key );
	if ( d ) return d;
	const i = key.indexOf( '~' ), base = i > 0 ? getItem( key.slice( 0, i ) ) : null, dye = key.slice( i + 1 );
	if ( ! base || ! DYES[ dye ] ) return undefined;
	const sec = base.cat === 'backpack' ? 'backpack' : 'clothing';
	const model = dyedSpec( base.model, dye );
	d = { ...base, id: key, name: dyedName( base, dye ), model, [ sec ]: { ...base[ sec ], color: model.color, visibility: DYES[ dye ].vis } };
	LOOKS.set( key, d );
	return d;
}
// the def of a stack as it looks (a dyed shirt's colour for the arms)
export const lookOf = ( stack ) => lookDef( lookKey( stack ) );

// ---- tailoring bonuses (stack.data.mods) ------------------------------------------------------------------------------

export const MAX_PATCHES = 3, MAX_POUCHES = 3;
// what one patch adds, by material
export const PATCH = {
	denim_scrap: { bite: 0.04, ins: 0.03 },
	leather: { bite: 0.07, ins: 0.02, wp: 0.05 },
	fabric: { ins: 0.04 },
	kapa_cloth: { ins: 0.06 },
};
export const POUCH_CAP = 2;
export const PADS = { bite: 0.12 };
const CAPS = { bite: 0.6, bullet: 0.7, ins: 0.95, wp: 1, cap: 12 };
// garments a patch sits on: tops, trousers, vests, gloves and soft hats
export const PATCH_SLOTS = new Set( [ 'torso', 'legs', 'vest', 'hands', 'head' ] );
export function patchable( def ) {
	if ( def?.cat !== 'clothing' || ! PATCH_SLOTS.has( def.clothing.slot ) ) return false;
	if ( def.clothing.armor.bullet > 0 ) return false;
	return ! ( def.model?.type === 'hat' && HARD.test( def.model.style || '' ) ) && ! def.tags.includes( 'nodye' );
}
// belts, vests and bags take pouches
export const pouchable = ( def ) => ( def?.cat === 'clothing' && [ 'belt', 'vest' ].includes( def.clothing.slot ) ) || ( def?.cat === 'backpack' && def.backpack.slot !== 'belt' && ! def.tags.includes( 'fragile' ) );

// add stat bonuses to a stack, each capped against the def's own value
export function addMods( stack, delta ) {
	const def = getItem( stack.id ), c = def?.clothing || def?.backpack;
	const m = stack.data.mods || ( stack.data.mods = {} );
	const base = { bite: c?.armor?.bite || 0, bullet: c?.armor?.bullet || 0, ins: c?.insulation || 0, wp: c?.waterproof || 0, cap: 0 };
	for ( const k in delta ) {
		const room = Math.max( 0, CAPS[ k ] - base[ k ] - ( m[ k ] || 0 ) );
		m[ k ] = Math.round( ( ( m[ k ] || 0 ) + Math.min( delta[ k ], room ) ) * 1000 ) / 1000;
	}
	return m;
}
export function subMods( stack, delta ) {
	const m = stack.data.mods;
	if ( ! m ) return;
	for ( const k in delta ) m[ k ] = Math.max( 0, Math.round( ( ( m[ k ] || 0 ) - delta[ k ] ) * 1000 ) / 1000 );
	if ( Object.values( m ).every( v => ! v ) ) delete stack.data.mods;
}

// the stats a worn stack really has: its def plus what was sewn on (the same sums the core hooks make)
export function wornStats( stack, def = getItem( stack?.id ) ) {
	const c = def?.clothing || def?.backpack;
	if ( ! c ) return null;
	const m = stack.data?.mods || {}, vis = stack.data?.look?.dye ? DYES[ stack.data.look.dye ]?.vis : null;
	return {
		bite: ( c.armor?.bite || 0 ) + ( m.bite || 0 ), bullet: ( c.armor?.bullet || 0 ) + ( m.bullet || 0 ),
		ins: ( c.insulation || 0 ) + ( m.ins || 0 ), wp: Math.min( 1, ( c.waterproof || 0 ) + ( m.wp || 0 ) ),
		cap: ( c.capacity || 0 ) + ( m.cap || 0 ), vis: vis ?? c.visibility ?? 0.5,
	};
}

// ---- wet clothes ----------------------------------------------------------------------------------------------------

// how much of you each slot covers: a soaked shirt soaks you more than wet socks
export const WET_SHARE = { torso: 0.35, legs: 0.25, feet: 0.1, head: 0.05, hands: 0.05, vest: 0.1, back: 0.05, face: 0.03, belt: 0.02, eyes: 0 };
export const DRY = { carried: 0.12, sun: 0.3, fire: 1.4 }; // wetness lost per game hour off the body
// putting on a wet garment: how wet you get
export const wetOnEquip = ( bodyWet, w, slot ) => Math.max( bodyWet, w * Math.min( 1, ( WET_SHARE[ slot ] || 0 ) * 2.5 ) );
// taking off a wet one: less wet cloth against the skin
export const wetOnRemove = ( bodyWet, slot ) => bodyWet * ( 1 - ( WET_SHARE[ slot ] || 0 ) * 0.8 );
export const dryTime = ( w ) => 3 + 8 * clamp( w, 0, 1 );
export const wetLabel = ( w ) => w > 0.75 ? 'soaked' : w > 0.3 ? 'wet' : w > 0.05 ? 'damp' : null;

// ---- fragile bags -----------------------------------------------------------------------------------------------------

// plastic bags carry so much before they tear: per second of strain, cond lost; a hit tears them too
export const FRAGILE = {
	grocery_bag: { safe: 3, over: 6, sprint: 0.006, walk: 0.002, hit: 0.2 },
	trash_bag: { safe: 8, over: 15, sprint: 0.004, walk: 0.0015, hit: 0.12 },
	trash_bag_poncho: { safe: 0, over: 99, sprint: 0.0006, walk: 0, hit: 0.1 },
};
// condition lost over `dt` seconds carrying `kg` in a bag of `kind`
export function strain( kind, kg, dt, { sprinting = false, moving = false } = {} ) {
	const F = FRAGILE[ kind ];
	if ( ! F ) return 0;
	let w = 0;
	if ( sprinting && kg > F.safe * 0.5 ) w += F.sprint * Math.max( 0.5, kg / Math.max( 0.5, F.safe ) );
	if ( moving && kg > F.over ) w += F.walk * ( kg / F.over );
	if ( kg > F.over * 1.5 ) w += F.walk * 2;
	return w * dt;
}
export const RIP_AT = 0.05;

// ---- someone's keys on a lanyard --------------------------------------------------------------------------------------

// a set of keys fits about a third of the locked cases you find; each set is tried once on a case (the same answer
// every time: it hashes the two stacks' uids)
export const KEY_FIT = 0.35;
const hashStr = ( s ) => { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; };
export const keyFits = ( caseUid, keysUid ) => hashStr( String( caseUid ) + ':' + String( keysUid ) ) % 1000 < KEY_FIT * 1000;
export const keysTried = ( caseStack, keysStack ) => !! caseStack?.data?.tried?.includes( keysStack?.uid );

// ---- dragging a suitcase --------------------------------------------------------------------------------------------

export const SUITCASE = { speed: 0.85, every: 2.6, radius: 13 };
export const DRAGGED = new Set( [ 'rolling_suitcase' ] );

// ---- how much your clothes hide you (player.camo, read by the infected's sight) ---------------------------------------

// Each slot counts by how much of you it shows; a bare one shows skin (0.55). Hi-vis is 1.0, a ghillie 0.05. A vest or
// a poncho covers most of the torso, so there it is mostly what shows (a bandolier hardly). The average is measured
// from everyday clothes (0.5): dark or loud clothes shift it a little (about ±0.1), a hi-vis vest a little more,
// full camouflage a lot. Colours fade at night, so the effect does too.
const CAMO_SHARE = { torso: 0.34, legs: 0.26, head: 0.1, back: 0.1, face: 0.06, hands: 0.04, feet: 0.04 };
const VEST_COVER = { bandolier: 0.25 };
export const CAMO = { norm: 0.5, slope: 0.9, cover: 0.8, night: 0.6, min: 0.65, max: 1.3 };
const visOf = ( st ) => ( st && wornStats( st )?.vis ) ?? 0.55;
export function camoFactor( equip, night = 0 ) {
	let s = 0, n = 0;
	for ( const slot in CAMO_SHARE ) {
		const st = equip?.[ slot ], k = CAMO_SHARE[ slot ];
		if ( ! st && slot === 'back' ) continue; // no pack: nothing there to see
		let v = visOf( st );
		const vest = slot === 'torso' && equip?.vest;
		if ( vest ) v += ( visOf( vest ) - v ) * ( VEST_COVER[ vest.id ] ?? CAMO.cover );
		s += v * k; n += k;
	}
	const avg = n > 0 ? s / n : 0.55;
	const day = 1 - CAMO.night * clamp( night || 0, 0, 1 );
	return clamp( 1 + ( avg - CAMO.norm ) * CAMO.slope * day, CAMO.min, CAMO.max );
}
