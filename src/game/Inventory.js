// Inventories: DayZ-style storage in what you wear. Every clothing piece and backpack with capacity
// holds its own list of stacks (stack.data.items); the body has a small base "pockets" store.
// World containers (fridges, lockers, car trunks) are { key, label, capacity, items }.
import { ITEMS, getItem, makeStack, stackWeight, stackVolume, canMerge, displayName } from './items/ItemDB.js';

export const EQUIP_SLOTS = [ 'head', 'eyes', 'face', 'torso', 'vest', 'back', 'hands', 'legs', 'feet', 'belt' ];
export const WEAPON_SLOTS = [ 'primary', 'secondary', 'sidearm', 'melee' ];
export const SLOT_LABEL = {
	head: 'Head', eyes: 'Eyewear', face: 'Face', torso: 'Top', vest: 'Vest', back: 'Back', hands: 'Gloves', legs: 'Pants', feet: 'Shoes',
	belt: 'Belt', primary: 'Shoulder', secondary: 'Shoulder 2', sidearm: 'Holster', melee: 'Melee',
};
const BASE_POCKETS = 4;

export function itemsOf( stack ) {
	if ( ! stack.data.items ) stack.data.items = [];
	return stack.data.items;
}
export function capacityOf( stack ) {
	const def = getItem( stack.id );
	const base = def?.clothing?.capacity || def?.backpack?.capacity || def?.container?.capacity || 0;
	// pouches sewn on (stack.data.mods.cap, the gear domain)
	return base + ( stack.data?.mods?.cap || 0 );
}

export function containerVolume( items ) {
	let v = 0;
	for ( const s of items ) v += stackVolume( s );
	return v;
}

export function containerWeight( items ) {
	let w = 0;
	for ( const s of items ) {
		w += stackWeight( s );
		if ( s.data?.items ) w += containerWeight( s.data.items );
	}
	return w;
}

// add as much of `stack` as fits; returns the quantity left over (0 = all placed)
export function addToItems( items, capacity, stack ) {
	const def = getItem( stack.id );
	if ( ! def ) return stack.qty;
	// top up existing stacks first
	if ( def.stack > 1 ) {
		for ( const s of items ) {
			if ( s.qty >= def.stack || ! canMerge( s, stack ) ) continue;
			const before = stackVolume( s );
			const take = Math.min( def.stack - s.qty, stack.qty );
			s.qty += take;
			if ( containerVolume( items ) > capacity && stackVolume( s ) > before ) {
				// merging grew the stack's footprint past the capacity: back off unit by unit
				let back = 0;
				while ( back < take && containerVolume( items ) > capacity ) { s.qty --; back ++; }
				stack.qty -= take - back;
			} else stack.qty -= take;
			if ( stack.qty <= 0 ) return 0;
		}
	}
	const free = capacity - containerVolume( items );
	if ( stackVolume( stack ) <= free ) { items.push( stack ); return 0; }
	if ( def.stack > 1 ) {
		// split: as many units as fit
		const per = def.size / Math.max( 1, def.stackPerSlot || def.stack );
		const n = Math.min( stack.qty, Math.floor( free / Math.max( per, 1e-6 ) ) );
		if ( n > 0 ) {
			const part = { ...stack, uid: stack.uid + 'x' + Math.random().toString( 36 ).slice( 2, 6 ), qty: n, data: JSON.parse( JSON.stringify( stack.data ) ) };
			while ( part.qty > 0 && stackVolume( part ) > free ) part.qty --;
			if ( part.qty > 0 ) { items.push( part ); stack.qty -= part.qty; }
		}
	}
	return stack.qty;
}

export function removeFromItems( items, stack ) {
	const i = items.indexOf( stack );
	if ( i >= 0 ) { items.splice( i, 1 ); return true; }
	for ( const s of items ) if ( s.data?.items && removeFromItems( s.data.items, stack ) ) return true;
	return false;
}

export class PlayerInventory {
	constructor() {
		this.equip = {}; // slot -> stack
		this.weapons = {}; // slot -> stack
		this.pockets = [];
		this.hands = null; // uid of the stack held in the hands
		this.hotbar = new Array( 9 ).fill( null ); // uids
		this.version = 0; // bumped on every change (UI refresh)
	}

	changed() { this.version ++; }

	// all storage containers, in fill-priority order
	containers() {
		const out = [ { key: 'pockets', label: 'Pockets', capacity: BASE_POCKETS, items: this.pockets, owner: null } ];
		for ( const slot of [ 'torso', 'legs', 'vest', 'belt', 'back', 'head' ] ) {
			const s = this.equip[ slot ];
			if ( s && capacityOf( s ) > 0 ) out.push( { key: 'equip:' + slot, label: displayName( s ), capacity: capacityOf( s ), items: itemsOf( s ), owner: s } );
		}
		return out;
	}

	*allStacks() {
		for ( const s of Object.values( this.equip ) ) if ( s ) yield s;
		for ( const s of Object.values( this.weapons ) ) if ( s ) yield s;
		for ( const c of this.containers() ) for ( const s of c.items ) {
			yield s;
			if ( s.data?.items ) for ( const t of s.data.items ) yield t;
		}
	}

	findUid( uid ) {
		if ( ! uid ) return null;
		for ( const s of this.allStacks() ) if ( s.uid === uid ) return s;
		return null;
	}

	// where a stack lives: { kind: 'equip'|'weapon'|'container', slot?, container? }
	locate( stack ) {
		for ( const k in this.equip ) if ( this.equip[ k ] === stack ) return { kind: 'equip', slot: k };
		for ( const k in this.weapons ) if ( this.weapons[ k ] === stack ) return { kind: 'weapon', slot: k };
		for ( const c of this.containers() ) if ( c.items.includes( stack ) ) return { kind: 'container', container: c };
		return null;
	}

	totalWeight() {
		let w = 0;
		for ( const s of Object.values( this.equip ) ) if ( s ) { w += stackWeight( s ) + containerWeight( itemsOf( s ) ); }
		for ( const s of Object.values( this.weapons ) ) if ( s ) w += stackWeight( s );
		w += containerWeight( this.pockets );
		return w;
	}

	count( id ) {
		let n = 0;
		for ( const s of this.allStacks() ) if ( s.id === id ) n += s.qty;
		return n;
	}

	find( pred ) {
		for ( const s of this.allStacks() ) if ( pred( s, getItem( s.id ) ) ) return s;
		return null;
	}

	findAll( pred ) {
		const out = [];
		for ( const s of this.allStacks() ) if ( pred( s, getItem( s.id ) ) ) out.push( s );
		return out;
	}

	hasTool( kind ) {
		return this.find( ( s, d ) => ( d?.tool?.kind === kind || d?.tool?.provides?.includes( kind ) || d?.melee?.tools?.includes( kind ) ) && s.cond > 0 );
	}

	// pick a free slot for an item picked up: weapons to weapon slots, clothes to empty slots, else containers
	add( stack, { autoEquip = true } = {} ) {
		const def = getItem( stack.id );
		if ( ! def ) return stack.qty;
		if ( autoEquip ) {
			if ( def.cat === 'firearm' ) {
				const slots = def.firearm.slot === 'sidearm' ? [ 'sidearm' ] : [ 'primary', 'secondary' ];
				for ( const sl of slots ) if ( ! this.weapons[ sl ] ) { this.weapons[ sl ] = stack; this.changed(); return 0; }
			}
			if ( def.cat === 'melee' && ! this.weapons.melee && def.size >= 3 ) { this.weapons.melee = stack; this.changed(); return 0; }
			if ( ( def.cat === 'clothing' || def.cat === 'backpack' ) ) {
				const slot = def.clothing?.slot || def.backpack?.slot || 'back';
				if ( ! this.equip[ slot ] ) { this.equip[ slot ] = stack; this.changed(); return 0; }
			}
		}
		let left = stack.qty;
		for ( const c of this.containers() ) {
			if ( c.owner === stack ) continue;
			left = addToItems( c.items, c.capacity, stack );
			if ( left <= 0 ) break;
		}
		this.changed();
		return left;
	}

	// remove a stack wherever it is
	remove( stack ) {
		for ( const k in this.equip ) if ( this.equip[ k ] === stack ) { delete this.equip[ k ]; this.changed(); return true; }
		for ( const k in this.weapons ) if ( this.weapons[ k ] === stack ) { delete this.weapons[ k ]; if ( this.hands === stack.uid ) this.hands = null; this.changed(); return true; }
		for ( const c of this.containers() ) if ( removeFromItems( c.items, stack ) ) { if ( this.hands === stack.uid ) this.hands = null; this.changed(); return true; }
		return false;
	}

	// consume n units of an item id (crafting); returns true if all were available
	consume( id, n ) {
		if ( this.count( id ) < n ) return false;
		for ( const s of [ ...this.allStacks() ] ) {
			if ( s.id !== id || n <= 0 ) continue;
			const take = Math.min( s.qty, n );
			s.qty -= take; n -= take;
			if ( s.qty <= 0 ) this.remove( s );
		}
		this.changed();
		return true;
	}

	// clothing / backpack into its slot; the previous one goes to the containers or is returned for dropping
	equipClothing( stack ) {
		const def = getItem( stack.id );
		const slot = def.clothing?.slot || def.backpack?.slot || 'back';
		const prev = this.equip[ slot ];
		this.remove( stack );
		this.equip[ slot ] = stack;
		let dropped = null;
		if ( prev ) { if ( this.add( prev, { autoEquip: false } ) > 0 ) dropped = prev; }
		this.changed();
		return dropped;
	}

	heldStack() { return this.findUid( this.hands ); }

	serialize() {
		return { equip: this.equip, weapons: this.weapons, pockets: this.pockets, hands: this.hands, hotbar: this.hotbar };
	}
	load( o ) {
		this.equip = o.equip || {}; this.weapons = o.weapons || {}; this.pockets = o.pockets || [];
		this.hands = o.hands || null; this.hotbar = o.hotbar || new Array( 9 ).fill( null );
		// drop anything whose definition no longer exists
		const ok = s => s && ITEMS.has( s.id );
		for ( const k in this.equip ) if ( ! ok( this.equip[ k ] ) ) delete this.equip[ k ];
		for ( const k in this.weapons ) if ( ! ok( this.weapons[ k ] ) ) delete this.weapons[ k ];
		this.pockets = this.pockets.filter( ok );
		this.changed();
	}

	// starting kit for a fresh spawn on the beach
	static freshSpawn( rnd = Math.random ) {
		const inv = new PlayerInventory();
		const pick = a => a[ Math.floor( rnd() * a.length ) ];
		const put = ( id, o ) => { const s = makeStack( id, 1, o ); if ( s ) inv.add( s ); return s; };
		put( pick( [ 'aloha_shirt', 'tshirt', 'tank_top' ] ) );
		put( pick( [ 'board_shorts', 'jeans', 'cargo_shorts' ] ) );
		put( 'slippers' );
		put( 'bandage_rag' );
		put( pick( [ 'road_flare', 'chemlight' ] ) );
		if ( rnd() < 0.5 ) put( 'water_bottle', { liquid: 'water' } );
		if ( rnd() < 0.5 ) put( pick( [ 'crackers', 'granola_bar', 'macadamia_nuts' ] ) );
		return inv;
	}
}
