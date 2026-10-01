// What you can do with an item (game.itemUse): the right-click menu and double-click default of the inventory,
// quick-heal, and everything that follows — eating (portions, opening cans with the right tool, cracking coconuts,
// cooking at a fire), drinking (cans, bottles, canteens of water / seawater / dirty water), medicine and kits,
// lights with batteries, reading guides, repairing, ripping clothes into rags, flares and chemlights, sleeping.
//   actions( stack ) -> [ { verb, note, label, run } ]   (the first is the double-click default)
//     verb: the plain menu verb ('Eat'); note: its short state or null ('2/3', 'Rotten', '2/3 · Rotten');
//     label: verb and note in brackets ('Eat (2/3) (rotten)'), the form the inventory screen parses today
//   use( stack )                             runs the default action
//   fillFrom( kind, stack? )                 'sea' | 'tap' | 'rain' (| 'dirty'): fills a water container
//   toggleLight( stack? )                    the flashlight key when no hands module handles it
// Also per frame: food spoils in game hours (inventory, the open container, the ground; cooler bags slow it),
// batteries drain in lights that are on, carried lights feed the light pool, dropped chemlights and burning
// flares glow.
// Using something where it lies (eating off a table, opening a can on a shelf) claims it: the loot spot counts as
// looted and the item is saved like a drop (WorldItems.claim).
// Player-facing text stays short and functional: menu labels are a verb (+ object), toasts a few words.
import * as THREE from 'three';
import { getItem, makeStack, cloneStack, newUid, freshness, stackVolume } from './ItemDB.js';
import { capacityOf, containerVolume } from '../Inventory.js';
import { POT_COOKED } from './recipes.js';
import { playItemSound, ensureItemSound } from './sounds.js';
import { liquidName, worstLiquid, provides, fmtHour, cardinal } from './util.js';
import { USE_PROVIDERS } from './hooks.js';

// progress labels for medical verbs
const GERUND = {
	'Bandage': 'Bandaging', 'Pack wounds': 'Packing wounds', 'Apply tourniquet': 'Applying tourniquet', 'Stitch wounds': 'Stitching',
	'Disinfect': 'Disinfecting', 'Clean wounds': 'Cleaning wounds', 'Inject': 'Injecting', 'Apply': 'Applying', 'Splint leg': 'Splinting',
	'Start IV': 'Running IV', 'Transfuse': 'Transfusing', 'Purify water': 'Purifying', 'Take': 'Taking',
};
const SKILL_NAME = { fishing: 'fishing', survival: 'survival', foraging: 'foraging', first_aid: 'first aid' };

// clothes that do not rip into rags (synthetics, armour, rubber)
const RIP_EXCLUDE = /wetsuit|hazmat|rain_|leather|down_jacket|firefighter|ghillie|police_vest|plate|stab|rig|life_jacket|vest|helmet|hard_hat/;

export class ItemUse {
	constructor( game, lights ) {
		this.game = game;
		this.lights = lights;
		this.lastHours = game.time.hours;
		this.tickT = 0;
		this.knowledge = {};
		this.carried = lights ? lights.add( { pos: new THREE.Vector3(), color: 0xffaa66, intensity: 0, range: 8, on: false, priority: 4, lift: 0 } ) : null;
		this.flares = []; // burning road flares in the world
		this.glows = new Map(); // lit chemlights on the ground: WorldItem -> { src, sprite }
		this.glowTex = null;
		this.glowT = 0;
		// what the guides taught belongs to the character: a new one after death starts without it
		this.offDeath = game.events?.on?.( 'playerDeath', () => { this.knowledge = {}; } ) || null;
	}

	get inv() { return this.game.player.inventory; }
	get S() { return this.game.survival; }

	// ============================================================================================================
	// actions
	// ============================================================================================================

	actions( stack ) {
		const d = getItem( stack?.id );
		if ( ! d ) return [];
		const A = [];
		// verb + optional state notes ('3/3', 'rotten'): kept apart, and joined in brackets into `label` for the
		// inventory screen, which splits them back out of the label
		const entry = ( verb, run, notes ) => {
			const n = ( notes || [] ).filter( Boolean );
			return { verb, note: n.length ? n.map( x => x[ 0 ].toUpperCase() + x.slice( 1 ) ).join( ' · ' ) : null, label: verb + n.map( x => ` (${x})` ).join( '' ), run };
		};
		const add = ( verb, run, notes = null ) => A.push( entry( verb, run, notes ) );
		const first = ( verb, run, notes = null ) => A.unshift( entry( verb, run, notes ) );
		const g = this.game, inv = this.inv;
		const nearFire = !! g.nearFire?.( g.player.pos );

		// ---- food ----
		if ( d.food ) {
			const f = d.food;
			if ( d.unpack ) add( 'Unpack', () => this.unpack( stack ) );
			if ( d.opensTo ) add( 'Crack open', () => this.crack( stack ) );
			else if ( f.opener && ! stack.data.open ) add( f.opener === 'cut' ? 'Cut open' : 'Open', () => this.openFood( stack ) );
			else {
				const left = stack.data.left ?? f.portions;
				add( f.raw ? 'Eat raw' : 'Eat', () => this.eat( stack ), [ f.portions > 1 ? `${left}/${f.portions}` : null, f.spoil && freshness( stack ) <= 0 ? 'rotten' : null ] );
			}
			if ( f.raw && f.cooked && getItem( f.cooked ) && nearFire ) {
				// rice and eggs cook in a pot of water (their recipe), everything else roasts on the fire
				const pot = POT_COOKED[ d.id ] ? g.crafting?.recipes?.find( r => r.id === POT_COOKED[ d.id ] ) : null;
				if ( pot ) first( 'Cook', () => this.cookInPot( stack, pot ) );
				else if ( ! POT_COOKED[ d.id ] ) first( 'Cook', () => this.cook( stack ) );
			}
		}

		// ---- drinks ----
		if ( d.drink ) {
			const k = d.drink, left = stack.data.left ?? k.portions;
			add( 'Drink', () => this.drinkItem( stack ), [ k.portions > 1 ? `${left}/${k.portions}` : null ] );
			if ( k.container && getItem( k.container ) ) add( 'Pour out', () => this.pourOut( stack ) );
		}

		// ---- medicine (and rags) ----
		if ( d.medical ) {
			const m = d.medical;
			if ( d.unpack ) add( 'Unpack', () => this.unpack( stack ) );
			else if ( m.purify && ! m.infection && ! m.bleed ) add( 'Purify water', () => this.purify( stack ) );
			else {
				add( m.verb || 'Use', () => this.medicate( stack ) );
				if ( m.purify ) add( 'Purify water', () => this.purify( stack ) );
			}
		}

		// ---- liquid containers ----
		if ( d.tool?.liquid ) {
			const L = stack.data.amount || 0, liq = stack.data.liquid;
			if ( L > 0.01 && liq && liq !== 'fuel' ) add( `Drink ${liquidName( liq )}`, () => this.drinkFrom( stack ) );
			if ( L > 0.01 && liq === 'dirty' && this.purifier() ) add( 'Purify', () => this.purify( this.purifier(), stack ) );
			if ( L < d.tool.liquid - 0.01 && this.canCollectRain() ) add( 'Collect rain', () => this.fillFrom( 'rain', stack ) );
			if ( L > 0.01 ) add( 'Empty', () => this.emptyContainer( stack ) );
		}

		// ---- fuel ----
		if ( d.fuel ) {
			if ( d.fuel.kind === 'propane' ) { const st = inv.find( ( s, dd ) => dd?.tool?.kind === 'stove' ); if ( st ) add( 'Refill stove', () => this.refillStove( stack, st ) ); }
			else if ( ( stack.data.amount || 0 ) > 0.01 ) add( 'Empty', () => this.emptyFuel( stack ) );
		}

		// ---- tools ----
		if ( d.tool ) this._toolActions( stack, d, add );

		// ---- road flares ----
		if ( d.throwable?.kind === 'flare' ) {
			add( 'Light and throw', () => this.lightFlare( stack, true ) );
			add( 'Light and drop', () => this.lightFlare( stack, false ) );
		}

		// ---- clothing ----
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) {
			if ( stack.cond < 0.95 && this.findKind( 'sewing' ) ) add( 'Repair', () => this.repair( this.findKind( 'sewing' ), stack ) );
			else if ( stack.cond < 0.8 && this.findKind( 'tape' ) ) add( 'Patch', () => this.repair( this.findKind( 'tape' ), stack ) );
			if ( this.rippable( d ) ) add( 'Rip into rags', () => this.rip( stack ) );
		}

		// ---- a fire nearby burns it ----
		if ( nearFire && g.crafting?.fuelValue?.( d.id ) && d.id !== 'campfire_kit' ) add( 'Add to fire', () => g.crafting.addFuel( stack ) );

		// ---- guides and odds and ends ----
		if ( d.book?.skill && ! this.knowledge[ d.book.skill ] ) add( 'Read', () => this.read( stack ) );
		if ( d.id === 'ukulele' ) add( 'Play', () => this.noiseMaker( 'strum', 45 ) );
		if ( d.id === 'rubber_duck' ) add( 'Squeeze', () => this.noiseMaker( 'squeak', 18 ) );
		// verbs the other item modules add (hooks.js)
		for ( const fn of USE_PROVIDERS ) {
			try { fn( stack, d, { add, first, game: g, use: this, inv } ); } catch ( e ) { console.error( 'use actions', e ); }
		}
		return A;
	}

	_toolActions( stack, d, add ) {
		const g = this.game, t = d.tool, inv = this.inv;
		// lights
		if ( t.light ) {
			if ( t.kind === 'chemlight' ) {
				if ( stack.data.on ) add( 'Drop', () => this.dropLit( stack ) );
				else { add( 'Snap', () => this.snapChemlight( stack, false ) ); add( 'Snap and drop', () => this.snapChemlight( stack, true ) ); }
			} else if ( t.kind === 'torch' ) {
				add( stack.data.on ? 'Put out' : 'Light', () => this.toggleLight( stack ) );
			} else add( stack.data.on ? 'Turn off' : 'Turn on', () => this.toggleLight( stack ) );
		}
		if ( t.battery && ! [ 'chemlight', 'torch' ].includes( t.kind ) && ( stack.data.charge ?? 0 ) < t.battery * 0.95 && inv.count( 'batteries' ) > 0 ) add( 'Replace batteries', () => this.replaceBatteries( stack ) );
		switch ( t.kind ) {
			case 'battery': {
				const dev = this.lowestDevice();
				if ( dev ) add( `Insert into ${getItem( dev.id ).name}`, () => this.replaceBatteries( dev ) );
				break;
			}
			case 'map': add( 'Open map', () => { g.app?.ui?.closeScreen?.(); g.app?.ui?.map?.open?.(); } ); break;
			case 'compass': add( 'Check heading', () => { const deg = ( ( - g.player.yaw * 180 / Math.PI ) % 360 + 360 ) % 360; g.toast( `Heading ${Math.round( deg )}° ${cardinal( deg )}`, 'info' ); } ); break;
			case 'watch': add( 'Check time', () => g.toast( `${fmtHour( g.hour )}, day ${g.day}`, 'info' ) ); break;
			case 'phone': add( 'Check time', () => this.phoneTime( stack ) ); break;
			case 'gps': add( 'Check position', () => this.gps( stack ) ); break;
			case 'radio': if ( d.id !== 'walkie_talkie' ) add( 'Listen', () => this.radio( stack ) ); break;
			case 'rangefinder': add( 'Measure', () => this.rangefind( stack ) ); break;
			case 'binoculars': if ( g.hands?.select ) add( 'Use', () => { g.app?.ui?.closeScreen?.(); g.hands.select( stack ); } ); break;
			case 'fishingrod': add( 'Fish', () => g.fishing?.cast?.( stack ) ); break;
			case 'tent': add( 'Sleep', () => this.sleep( 1.0 ) ); break;
			case 'sleepingbag': add( 'Sleep', () => this.sleep( 0.85 ) ); break;
			case 'whistle': add( 'Blow', () => this.noiseMaker( 'whistle', 110 ) ); break;
			case 'stove': add( 'Place', () => this.placeStove( stack ) ); break;
			case 'campfire': add( 'Place', () => this.placeCampfire( stack ) ); break;
			case 'sewing': { const tg = this.mostDamaged( ( s, dd ) => dd.cat === 'clothing' || dd.cat === 'backpack', 0.95 ); if ( tg ) add( `Repair ${getItem( tg.id ).name}`, () => this.repair( stack, tg ) ); break; }
			case 'tape': { const tg = this.mostDamaged( ( s, dd ) => dd.cat !== 'firearm' && dd.cat !== 'food', 0.8 ); if ( tg ) add( `Patch ${getItem( tg.id ).name}`, () => this.repair( stack, tg ) ); break; }
			case 'cleaning': { const tg = this.mostDamaged( ( s, dd ) => dd.cat === 'firearm', 0.98 ); if ( tg ) add( `Clean ${getItem( tg.id ).name}`, () => this.repair( stack, tg ) ); break; }
			case 'canopener': { const c = inv.find( ( s, dd ) => dd?.food?.opener === true && ! s.data.open ); if ( c ) add( `Open ${getItem( c.id ).name}`, () => this.openFood( c ) ); break; }
			case 'solar': { const dev = this.lowestDevice( true ); if ( dev ) add( `Charge ${getItem( dev.id ).name}`, () => this.solarCharge( dev ) ); break; }
			case 'lighter': case 'matches': { const tch = inv.find( ( s, dd ) => dd?.tool?.kind === 'torch' && ! s.data.on ); if ( tch ) add( 'Light torch', () => this.toggleLight( tch ) ); break; }
		}
	}

	use( stack ) {
		const a = this.actions( stack )[ 0 ];
		if ( a ) a.run();
		return !! a;
	}

	// ============================================================================================================
	// where things are, taking one off a stack, using up
	// ============================================================================================================

	// { kind: 'inv'|'other', items, capacity } | { kind: 'equip'|'weapon', slot } | { kind: 'ground', item } | null
	where( stack ) {
		const inv = this.inv;
		const find = ( items, capacity ) => {
			for ( const s of items ) {
				if ( s === stack ) return { items, capacity };
				if ( s.data?.items ) { const r = find( s.data.items, capacityOf( s ) ); if ( r ) return r; }
			}
			return null;
		};
		for ( const c of inv.containers() ) { const r = find( c.items, c.capacity ); if ( r ) return { kind: 'inv', ...r }; }
		for ( const k in inv.equip ) { if ( inv.equip[ k ] === stack ) return { kind: 'equip', slot: k }; }
		for ( const k in inv.weapons ) { if ( inv.weapons[ k ] === stack ) return { kind: 'weapon', slot: k }; }
		const other = this.game.app?.ui?.inventory?.other;
		if ( other?.items ) { const r = find( other.items, other.capacity ?? Infinity ); if ( r ) return { kind: 'other', ...r, container: other }; }
		const wi = this.game.items3d?.byStack?.( stack );
		if ( wi ) return { kind: 'ground', item: wi };
		return null;
	}

	exists( stack ) { return stack.qty > 0 && !! this.where( stack ); }

	// after changing a stack: redraw, and an item used where it lies is no longer its loot spot's (it is saved like a
	// drop and the spot counts as looted, so the building does not hand out a fresh one next visit)
	changed( w = null ) {
		this.inv.changed();
		if ( w?.kind === 'other' ) this.game.events.emit( 'container:changed', { container: w.container } );
		if ( w?.kind === 'ground' ) {
			const it = this.game.items3d?.claim?.( w.item ) || w.item;
			this.game.items3d?.refresh?.( it );
		}
	}

	discard( stack ) {
		const w = this.where( stack );
		if ( ! w ) return;
		if ( w.kind === 'inv' || w.kind === 'equip' || w.kind === 'weapon' ) this.inv.remove( stack );
		else if ( w.kind === 'other' ) { const i = w.items.indexOf( stack ); if ( i >= 0 ) w.items.splice( i, 1 ); }
		// used up where it lay: taken, as far as its loot spot is concerned
		else if ( w.kind === 'ground' ) { this.game.items3d.remove( w.item, { taken: true } ); this.inv.changed(); return; }
		this.changed( w );
	}

	// one unit is used up; per-unit state (portions left, an opened can) resets for the next one
	consumeOne( stack ) {
		stack.qty -= 1;
		if ( stack.qty <= 0 ) { this.discard( stack ); return; }
		delete stack.data.left; delete stack.data.open; delete stack.data.spill;
		this.changed( this.where( stack ) );
	}

	// a single unit to work on: split off a stack of several (opening one can of four). It goes next to the stack
	// when the container has room for the extra slot, else into any carried container with room (never merged back
	// into a stack), else onto the ground.
	splitOne( stack ) {
		if ( stack.qty <= 1 ) return stack;
		const w = this.where( stack );
		const part = cloneStack( stack );
		part.uid = newUid();
		part.qty = 1;
		stack.qty -= 1;
		if ( w?.items && containerVolume( w.items ) + stackVolume( part ) <= ( w.capacity ?? Infinity ) + 1e-6 ) w.items.splice( w.items.indexOf( stack ) + 1, 0, part );
		else if ( w?.kind === 'ground' ) this.game.items3d.spawn( part, w.item.pos.clone().add( new THREE.Vector3( 0.12, 0.05, 0.08 ) ), { persistent: true } );
		else if ( ! this.stow( part ) ) this.game.dropStack( part );
		this.changed( w );
		return part;
	}

	// into the first carried container with room for it as its own stack
	stow( stack ) {
		for ( const c of this.inv.containers() ) {
			if ( c.owner === stack || containerVolume( c.items ) + stackVolume( stack ) > c.capacity + 1e-6 ) continue;
			c.items.push( stack );
			return true;
		}
		return false;
	}

	// turn a stack into another item in place (a drunk bottle becomes an empty one)
	transform( stack, id, data = {} ) {
		const one = this.splitOne( stack );
		one.id = id;
		one.data = data;
		const d = getItem( id );
		if ( d?.tool?.battery && one.data.charge === undefined ) one.data.charge = d.tool.battery;
		this.changed( this.where( one ) );
		return one;
	}

	give( id, qty = 1, opts = {} ) {
		const d = getItem( id );
		if ( ! d ) return;
		let left = qty;
		while ( left > 0 ) {
			const n = Math.min( left, d.stack );
			const s = makeStack( id, n, opts );
			left -= n;
			if ( this.inv.add( s ) > 0 ) this.game.dropStack( s );
		}
		this.inv.changed();
	}

	usesLeft( stack ) {
		const d = getItem( stack.id );
		return stack.data.uses ?? d.tool?.uses ?? d.medical?.uses ?? 1;
	}
	useUp( stack, n = 1 ) {
		const d = getItem( stack.id );
		const max = d.tool?.uses ?? d.medical?.uses;
		if ( ! max ) { this.consumeOne( stack ); return; }
		stack.data.uses = this.usesLeft( stack ) - n;
		if ( stack.data.uses <= 0 ) { this.game.toast( `${d.name} used up`, 'info' ); this.consumeOne( stack ); } else this.changed( this.where( stack ) );
	}

	timed( label, time, sound, onDone, opts = {} ) {
		const g = this.game;
		if ( g.actions.busy && ! opts.force ) g.actions.cancel();
		if ( sound ) ensureItemSound( g.audio, sound );
		g.actions.start( {
			label, time, sound, cancelOnMove: opts.cancelOnMove ?? true,
			onDone: () => { try { onDone(); } catch ( e ) { console.error( e ); } this.inv.changed(); },
			onCancel: opts.onCancel,
		} );
	}

	// ---- tool finders ----
	findKind( kind ) { return this.inv.find( ( s ) => provides( s, kind ) ); }
	blade() { return this.inv.find( ( s ) => provides( s, 'cut' ) ); }
	fireSource() { return this.inv.find( ( s, d ) => ( d?.tool?.kind === 'lighter' || d?.tool?.kind === 'matches' ) && this.usesLeft( s ) > 0 ); }
	purifier() { return this.inv.find( ( s, d ) => d?.medical?.purify > 0 ); }
	// the best way to open a can with what you carry: a can opener is clean, a knife spills a little, bashing it
	// open with an axe, a hammer or a stone spills more
	openOption() {
		const inv = this.inv;
		const op = inv.find( ( s ) => provides( s, 'canopener' ) );
		if ( op ) return { tool: op, time: 3, loss: 0 };
		const knife = inv.find( ( s ) => provides( s, 'open_can' ) );
		if ( knife ) return { tool: knife, time: 5, loss: 0.1, wear: 0.01 };
		const heavy = inv.find( ( s, d ) => d?.melee && ( d.melee.tools?.some( t => [ 'chop', 'hammer', 'pry', 'break' ].includes( t ) ) || d.melee.kind === 'blunt' || d.melee.kind === 'axe' ) );
		if ( heavy ) return { tool: heavy, time: 5, loss: 0.25, wear: 0.02, sound: 'hit_metal' };
		const stone = inv.find( ( s, d ) => d?.id === 'stone' );
		if ( stone ) return { tool: stone, time: 6, loss: 0.3, sound: 'hit_metal' };
		return null;
	}
	cutOption() {
		const b = this.blade();
		return b ? { tool: b, time: 4, loss: 0, wear: 0.005 } : null;
	}
	wear( stack, amount ) { if ( stack && amount ) stack.cond = Math.max( 0.02, stack.cond - amount ); }
	// the first aid handbook makes every treatment quicker
	medTime( t ) { return t * ( this.knowledge.first_aid ? 0.7 : 1 ); }

	// ============================================================================================================
	// eating and drinking
	// ============================================================================================================

	openFood( stack ) {
		const d = getItem( stack.id ), f = d.food;
		const opt = f.opener === 'cut' ? this.cutOption() : this.openOption();
		if ( ! opt ) { this.game.toast( f.opener === 'cut' ? 'Need a blade' : 'Need a can opener or blade', 'warn' ); return; }
		const one = this.splitOne( stack );
		this.timed( `Opening ${d.name}`, opt.time, opt.sound || ( f.opener === 'cut' ? 'tear' : 'can_open' ), () => {
			if ( ! this.exists( one ) ) return;
			one.data.open = true;
			if ( opt.loss ) { one.data.spill = opt.loss; this.game.toast( 'Spilled some', 'info' ); }
			this.wear( opt.tool, opt.wear );
			this.changed( this.where( one ) );
		} );
	}

	crack( stack ) {
		const d = getItem( stack.id );
		const b = this.blade();
		if ( ! b ) { this.game.toast( 'Need a blade', 'warn' ); return; }
		this.timed( `Opening ${d.name}`, 3.5, 'hit_wood', () => {
			if ( ! this.exists( stack ) ) return;
			this.transform( stack, d.opensTo, { age: 0 } );
			this.wear( b, 0.005 );
		} );
	}

	eat( stack ) {
		const d = getItem( stack.id ), f = d.food;
		if ( d.opensTo ) { this.crack( stack ); return; }
		if ( f.opener && ! stack.data.open ) { this.openFood( stack ); return; }
		const one = f.portions > 1 ? this.splitOne( stack ) : stack;
		const time = 2.5 + Math.min( 3, ( f.kcal / f.portions ) / 350 );
		this.timed( `Eating ${d.name}`, time, 'eat', () => {
			if ( ! this.exists( one ) ) return;
			const S = this.S;
			const msg = S.eat( one );
			// food spilled opening the can with the wrong tool is lost from every portion
			if ( one.data.spill ) S.hunger = Math.max( 0, S.hunger - f.kcal / 20 / f.portions * one.data.spill );
			if ( msg ) this.game.toast( msg, 'warn' );
			one.data.left = ( one.data.left ?? f.portions ) - 1;
			if ( one.data.left <= 0 ) this.consumeOne( one );
			else this.changed( this.where( one ) );
		} );
	}

	// roast one unit on the fire; what was already eaten of it stays eaten
	cook( stack ) {
		const g = this.game, d = getItem( stack.id ), f = d.food;
		if ( ! g.nearFire?.( g.player.pos ) ) { g.toast( 'Need a fire', 'warn' ); return; }
		const one = this.splitOne( stack );
		this.timed( `Cooking ${d.name.replace( /^Raw /, '' )}`, d.weight > 1 ? 16 : 11, 'sizzle', () => {
			if ( ! this.exists( one ) ) return;
			const cf = getItem( f.cooked ).food, data = { age: 0 };
			const left = one.data.left ?? f.portions;
			if ( left < f.portions ) data.left = Math.min( cf.portions, Math.max( 1, Math.round( left / f.portions * cf.portions ) ) );
			if ( data.left === cf.portions ) delete data.left;
			this.transform( one, f.cooked, data );
		} );
	}

	// rice and eggs: the recipe's pot, water and fire, but this unit (a part-eaten bag of rice gives less)
	cookInPot( stack, r ) {
		const g = this.game, C = g.crafting, d = getItem( stack.id ), f = d.food;
		const need = { ...r, in: [] }; // the pot, the water, the fire: not the ingredient, which is this stack
		const c = C.check( need );
		if ( ! c.ok ) { g.toast( c.reason, 'warn' ); return; }
		const one = this.splitOne( stack );
		this.timed( `Cooking ${d.name}`, r.time, 'sizzle', () => {
			if ( ! this.exists( one ) || ! C.check( need ).ok ) return;
			const k = ( one.data.left ?? f.portions ) / f.portions;
			if ( r.liquid ) C.drawLiquid( r.liquid.kind, r.liquid.litres );
			this.consumeOne( one );
			this.give( r.out[ 0 ], Math.max( 1, Math.round( r.out[ 1 ] * k ) ) );
		} );
	}

	scaledDrink( k, portions ) {
		const p = Math.max( 1, portions );
		return { drink: { ...k, water: k.water / p, kcal: k.kcal / p, alcohol: k.alcohol / p, caffeine: k.caffeine / p } };
	}

	drinkItem( stack ) {
		const d = getItem( stack.id ), k = d.drink;
		const one = k.portions > 1 ? this.splitOne( stack ) : stack;
		const sound = d.model?.type === 'can' && d.model?.style === 'soda' && ! one.data.left ? 'can_open' : 'drink';
		this.timed( `Drinking ${d.name}`, 2.5, sound, () => {
			if ( ! this.exists( one ) ) return;
			this.S.drink( this.scaledDrink( k, k.portions ), 0.33, 'water' );
			this.game.audio?.play( 'drink', { vol: 0.5 } );
			one.data.left = ( one.data.left ?? k.portions ) - 1;
			if ( one.data.left > 0 ) { this.changed( this.where( one ) ); return; }
			if ( k.container && getItem( k.container ) ) this.transform( one, k.container, { liquid: null, amount: 0 } );
			else this.consumeOne( one );
		} );
	}

	pourOut( stack ) {
		const d = getItem( stack.id );
		this.timed( `Pouring out ${d.name}`, 2, 'pour', () => { if ( this.exists( stack ) ) this.transform( stack, d.drink.container, { liquid: null, amount: 0 } ); } );
	}

	drinkFrom( stack ) {
		const S = this.S;
		const liq = stack.data.liquid;
		const sip = Math.min( stack.data.amount || 0, 0.5 );
		if ( sip <= 0 ) return;
		this.timed( `Drinking ${liquidName( liq )}`, 3, 'drink', () => {
			if ( ! this.exists( stack ) ) return;
			S.drink( null, sip, liq );
			stack.data.amount = Math.max( 0, ( stack.data.amount || 0 ) - sip );
			if ( stack.data.amount < 0.005 ) { stack.data.amount = 0; stack.data.liquid = null; }
			this.changed( this.where( stack ) );
		} );
	}

	emptyContainer( stack ) {
		this.timed( 'Emptying', 1.5, 'pour', () => { stack.data.amount = 0; stack.data.liquid = null; this.changed( this.where( stack ) ); } );
	}

	emptyFuel( stack ) {
		this.timed( 'Emptying', 3, 'pour', () => { stack.data.amount = 0; this.changed( this.where( stack ) ); } );
	}

	canCollectRain() {
		const g = this.game;
		return ( g.weather?.rain || 0 ) > 0.25 && ! g.world.isIndoors?.( g.player.pos ) && ! g.player.vehicle;
	}

	// fill a water container from the sea, a tap, the rain or a stream
	fillFrom( kind, stack = null ) {
		const g = this.game;
		const liq = kind === 'sea' ? 'sea' : kind === 'dirty' ? 'dirty' : 'water';
		// rain only tops up what already holds clean water (or nothing); the sea and a tap fill anything
		const ok = ( s, d ) => d?.tool?.liquid && ( s.data.amount || 0 ) < d.tool.liquid - 0.01 && ( ! s.data.liquid || ( s.data.amount || 0 ) < 0.01 || s.data.liquid === liq || kind !== 'rain' );
		const c = stack && ok( stack, getItem( stack.id ) ) ? stack : this.inv.find( ( s, d ) => ok( s, d ) && ( ! s.data.liquid || s.data.liquid === liq || ( s.data.amount || 0 ) < 0.01 ) ) || this.inv.find( ok );
		if ( ! c ) { g.toast( 'Nothing to fill', 'warn' ); return false; }
		if ( kind === 'rain' && ! this.canCollectRain() ) { g.toast( 'Not raining here', 'warn' ); return false; }
		const d = getItem( c.id ), cap = d.tool.liquid;
		const time = kind === 'rain' ? 8 : Math.min( 8, 2 + cap * 1.2 );
		this.timed( `Filling ${d.name}`, time, kind === 'rain' ? null : 'pour', () => {
			if ( ! this.exists( c ) ) return;
			const cur = c.data.amount || 0;
			const add = kind === 'rain' ? Math.min( cap - cur, 0.15 + 0.35 * ( g.weather?.rain || 0.5 ) ) : cap - cur;
			c.data.liquid = cur > 0.01 && c.data.liquid ? worstLiquid( c.data.liquid, liq ) : liq;
			c.data.amount = Math.min( cap, cur + add );
			g.toast( `${d.name}: ${c.data.amount.toFixed( 1 )} L ${liquidName( c.data.liquid )}`, c.data.liquid === 'water' ? 'good' : 'info' );
			this.changed( this.where( c ) );
		} );
		return true;
	}

	// water purification tablets / iodine: dirty water becomes drinkable (salt stays)
	purify( tab, target = null ) {
		const g = this.game, d = getItem( tab.id );
		const c = target || this.inv.find( ( s, dd ) => dd?.tool?.liquid && s.data.liquid === 'dirty' && s.data.amount > 0.01 );
		if ( ! c ) {
			const salty = this.inv.find( ( s, dd ) => dd?.tool?.liquid && s.data.liquid === 'sea' );
			g.toast( salty ? 'Boil seawater instead' : 'No dirty water', 'warn' );
			return;
		}
		const need = Math.max( 1, Math.ceil( ( c.data.amount || 0 ) / ( d.medical.purify || 1 ) ) );
		const have = d.medical.uses ? this.usesLeft( tab ) : tab.qty;
		if ( have < need ) { g.toast( `Need ${need} ${d.medical.uses ? 'doses' : 'tablets'}`, 'warn' ); return; }
		this.timed( 'Purifying', 4, 'pills', () => {
			if ( ! this.exists( c ) || ! this.exists( tab ) ) return;
			c.data.liquid = 'water';
			this.changed( this.where( c ) );
			if ( d.medical.uses ) this.useUp( tab, need );
			else { tab.qty -= need; if ( tab.qty <= 0 ) this.discard( tab ); }
			g.toast( 'Water purified', 'good' );
		} );
	}

	// ============================================================================================================
	// medicine
	// ============================================================================================================

	medicate( stack ) {
		const g = this.game, S = this.S, d = getItem( stack.id ), m = d.medical;
		// refuse what would only be wasted
		if ( m.splint && ! S.fracture ) { g.toast( 'Nothing broken', 'info' ); return; }
		if ( m.splint && S.splint ) { g.toast( 'Already splinted', 'info' ); return; }
		if ( m.bleed && S.bleeding <= 0 ) { g.toast( 'Not bleeding', 'info' ); return; }
		if ( m.infection && ! S.infected && ! m.heal && ! m.pain && ! ( m.sick && S.sick > 0.1 ) ) { g.toast( 'No infection', 'info' ); return; }
		if ( m.blood && S.blood > 4900 ) { g.toast( 'No blood loss', 'info' ); return; }
		if ( m.sick && ! m.infection && ! m.heal && S.sick <= 0.05 ) { g.toast( 'Not sick', 'info' ); return; }
		const verb = m.verb || 'Use';
		this.timed( GERUND[ verb ] || verb, this.medTime( m.use || 3 ), m.sound || 'bandage', () => {
			if ( ! this.exists( stack ) ) return;
			const bleeding = S.bleeding;
			S.medicate( d );
			if ( m.bleed && bleeding > 0 ) g.toast( S.bleeding > 0 ? `Still bleeding (${S.bleeding})` : 'Bleeding stopped', S.bleeding > 0 ? 'warn' : 'good' );
			if ( m.infection && S.infected ) g.toast( 'Still infected', 'warn' );
			if ( m.uses ) this.useUp( stack ); else this.consumeOne( stack );
		} );
	}

	unpack( stack ) {
		const g = this.game, d = getItem( stack.id );
		this.timed( `Unpacking ${d.name}`, 2.5, 'unwrap', () => {
			if ( ! this.exists( stack ) ) return;
			let n = 0;
			for ( const [ id, q ] of d.unpack || [] ) { if ( ! getItem( id ) ) continue; this.give( id, q, { full: true } ); n += q; }
			this.consumeOne( stack );
			if ( ! n ) g.toast( 'Empty', 'info' );
		} );
	}

	// ============================================================================================================
	// lights
	// ============================================================================================================

	isLight( d ) { return !! d?.tool?.light; }

	// the flashlight key (when no hands module owns it), or a light's Turn on / off action
	toggleLight( stack = null ) {
		const g = this.game, inv = this.inv;
		if ( ! stack ) {
			const on = inv.findAll( ( s, d ) => this.isLight( d ) && s.data.on && ! [ 'chemlight', 'torch' ].includes( d.tool.kind ) );
			if ( on.length ) { for ( const s of on ) s.data.on = false; playItemSound( g, 'click', { vol: 0.4 } ); inv.changed(); return; }
			const order = [ 'headlamp', 'flashlight', 'lantern', 'phone' ];
			const cand = inv.findAll( ( s, d ) => this.isLight( d ) && order.includes( d.tool.kind ) && s.data.charge > 0 ).sort( ( a, b ) => order.indexOf( getItem( a.id ).tool.kind ) - order.indexOf( getItem( b.id ).tool.kind ) );
			if ( ! cand.length ) { g.toast( 'No working light', 'warn' ); return; }
			stack = cand[ 0 ];
		}
		const d = getItem( stack.id );
		// a hands module draws spot lights only from the hands (and a worn headlamp): turning one on takes it out
		if ( g.hands?.select && ! stack.data.on && d.tool.light?.kind === 'spot' && d.tool.kind !== 'headlamp' && inv.hands !== stack.uid && ( stack.data.charge > 0 ) ) g.hands.select( stack );
		if ( d.tool.kind === 'torch' ) {
			if ( stack.data.on ) { stack.data.on = false; playItemSound( g, 'snap', { vol: 0.3 } ); inv.changed(); return; }
			const src = this.fireSource();
			if ( ! src ) { g.toast( 'Need a lighter or matches', 'warn' ); return; }
			this.timed( 'Lighting torch', 2, 'strike', () => { stack.data.on = true; if ( ! ( stack.data.charge > 0 ) ) stack.data.charge = d.tool.battery; this.useUp( src ); } );
			return;
		}
		if ( ! stack.data.on && ! ( stack.data.charge > 0 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
		stack.data.on = ! stack.data.on;
		playItemSound( g, 'click', { vol: 0.45 } );
		inv.changed();
	}

	replaceBatteries( dev ) {
		const g = this.game, d = getItem( dev.id );
		const bat = this.inv.find( ( s ) => s.id === 'batteries' );
		if ( ! bat ) { g.toast( 'No batteries', 'warn' ); return; }
		this.timed( 'Replacing batteries', 3, 'click', () => {
			if ( ! this.exists( bat ) ) return;
			dev.data.charge = d.tool.battery;
			this.changed( this.where( dev ) );
			this.consumeOne( bat );
		} );
	}

	lowestDevice( rechargeableOnly = false ) {
		const list = this.inv.findAll( ( s, d ) => d?.tool?.battery && ! [ 'chemlight', 'torch' ].includes( d.tool.kind ) && ( ! rechargeableOnly || d.tool.rechargeable ) && ( s.data.charge ?? 0 ) < d.tool.battery * 0.95 );
		list.sort( ( a, b ) => ( a.data.charge ?? 0 ) / getItem( a.id ).tool.battery - ( b.data.charge ?? 0 ) / getItem( b.id ).tool.battery );
		return list[ 0 ] || null;
	}

	solarCharge( dev ) {
		const g = this.game;
		if ( ! dev ) { g.toast( 'Nothing to charge', 'info' ); return; }
		if ( g.world.sky.sunDir.y < 0.12 || g.world.isIndoors?.( g.player.pos ) ) { g.toast( 'Needs direct sunlight', 'warn' ); return; }
		const d = getItem( dev.id );
		this.timed( `Charging ${d.name}`, 15, null, () => {
			dev.data.charge = Math.min( d.tool.battery, ( dev.data.charge || 0 ) + d.tool.battery * 0.35 * Math.min( 1, 1.25 - ( g.weather?.cover ?? 0.3 ) ) );
			g.toast( `${d.name}: ${Math.round( dev.data.charge / d.tool.battery * 100 )}%`, 'good' );
		} );
	}

	snapChemlight( stack, drop ) {
		const g = this.game;
		const one = this.splitOne( stack );
		playItemSound( g, 'snap', { vol: 0.5 } );
		one.data.on = true;
		if ( ! ( one.data.charge > 0 ) ) one.data.charge = getItem( one.id ).tool.battery;
		if ( drop ) this.dropLit( one );
		this.changed( this.where( one ) );
	}

	dropLit( stack ) {
		const g = this.game;
		const w = this.where( stack );
		if ( w && w.kind !== 'ground' ) { this.inv.remove( stack ); g.dropStack( stack ); }
		this.inv.changed();
	}

	// road flares burn where they land: a red light, a hiss, and noise that draws the infected
	lightFlare( stack, thrown ) {
		const g = this.game, p = g.player;
		const d = getItem( stack.id );
		this.timed( 'Lighting flare', 1, 'strike', () => {
			if ( ! this.exists( stack ) ) return;
			this.consumeOne( stack );
			const eye = new THREE.Vector3( p.pos.x, p.eye - 0.2, p.pos.z );
			const dir = p.lookDir( new THREE.Vector3() );
			const f = {
				pos: eye.clone().addScaledVector( dir, 0.4 ), vel: thrown ? dir.clone().multiplyScalar( 11 ).add( new THREE.Vector3( 0, 3, 0 ) ) : new THREE.Vector3( dir.x, 0.5, dir.z ).multiplyScalar( 1.5 ),
				burn: d.throwable.burn || 420, flying: true, noiseT: 0, light: d.throwable.light, sprite: null, snd: null, src: null,
			};
			this.flares.push( f );
			this._flareVisual( f );
		} );
	}

	_glowTexture() {
		if ( this.glowTex ) return this.glowTex;
		const c = document.createElement( 'canvas' ); c.width = c.height = 64;
		const ctx = c.getContext( '2d' );
		const gr = ctx.createRadialGradient( 32, 32, 0, 32, 32, 32 );
		gr.addColorStop( 0, 'rgba(255,255,255,1)' ); gr.addColorStop( 0.25, 'rgba(255,255,255,0.55)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, 64, 64 );
		this.glowTex = new THREE.CanvasTexture( c );
		return this.glowTex;
	}

	_sprite( color, size ) {
		const s = new THREE.Sprite( new THREE.SpriteMaterial( { map: this._glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false } ) );
		s.scale.setScalar( size );
		s.layers.set( 1 );
		this.game.scene.add( s );
		return s;
	}

	_flareVisual( f ) {
		const g = this.game;
		f.sprite = this._sprite( f.light.color, 1.4 );
		f.src = this.lights?.add( { pos: f.pos, color: f.light.color, intensity: f.light.intensity, range: f.light.range, on: true, flicker: true, priority: 3, lift: 0.3 } );
		if ( g.audio?.loop ) { ensureItemSound( g.audio, 'flare_loop' ); f.snd = g.audio.loop( 'flare_loop', { pos: f.pos, vol: 0.5, bus: 'sfx' } ); }
		f.step = new THREE.Vector3();
		f.dir = new THREE.Vector3();
	}

	_updateFlares( dt ) {
		const g = this.game;
		for ( let i = this.flares.length - 1; i >= 0; i -- ) {
			const f = this.flares[ i ];
			if ( f.flying ) {
				f.vel.y -= 18 * dt;
				const step = f.step.copy( f.vel ).multiplyScalar( dt );
				const len = step.length();
				const hit = len > 0 ? g.physics.raycast( f.pos, f.dir.copy( step ).divideScalar( len ), len + 0.05, { water: true } ) : null;
				if ( hit ) {
					f.pos.copy( hit.point ).addScaledVector( hit.normal, 0.05 );
					if ( hit.kind === 'water' ) f.burn = Math.min( f.burn, 8 ); // it fizzles out in the sea
					if ( hit.normal.y > 0.5 || f.vel.length() < 2 ) f.flying = false;
					else f.vel.reflect( hit.normal ).multiplyScalar( 0.35 );
				} else f.pos.add( step );
				const gy = g.hf.heightAt( f.pos.x, f.pos.z );
				if ( f.pos.y < gy ) { f.pos.y = gy + 0.05; f.flying = false; }
			}
			f.burn -= dt;
			const k = Math.min( 1, f.burn / 20 );
			if ( f.src ) f.src.dim = k;
			if ( f.sprite ) { f.sprite.position.copy( f.pos ); f.sprite.position.y += 0.08; f.sprite.scale.setScalar( ( 1.1 + Math.sin( performance.now() * 0.03 ) * 0.15 ) * Math.max( 0.2, k ) ); }
			f.snd?.set( 0.5 * k, null, f.pos );
			f.noiseT -= dt;
			if ( f.noiseT <= 0 ) { f.noiseT = 3; g.events.emit( 'noise', { pos: f.pos.clone(), radius: 55, source: 'flare', kind: 'flare' } ); }
			if ( f.burn <= 0 ) this._removeFlare( i );
		}
	}

	_removeFlare( i ) {
		const f = this.flares[ i ];
		if ( f.sprite ) { this.game.scene.remove( f.sprite ); f.sprite.material.dispose(); }
		if ( f.src ) this.lights.remove( f.src );
		f.snd?.stop();
		this.flares.splice( i, 1 );
	}

	// the light the hands module draws itself (held light, gun light or the headlamp it picks, as Hands._flashlight
	// does): skipped here so it is not lit or drained twice
	_handsLight() {
		const g = this.game, inv = this.inv;
		if ( ! g.hands ) return null;
		const held = inv.heldStack?.();
		const hd = held ? getItem( held.id ) : null;
		if ( held && hd?.tool && held.data.on && ( hd.tool.light || hd.tool.kind === 'flashlight' ) ) return held;
		if ( held && hd?.firearm && held.data.att?.light?.data?.on ) return held.data.att.light;
		let lamp = null;
		for ( const s of Object.values( inv.equip ) ) if ( s && getItem( s.id )?.tool?.kind === 'headlamp' ) { lamp = s; break; }
		lamp = lamp || inv.find( ( s, d ) => d?.tool?.kind === 'headlamp' );
		return lamp?.data.on ? lamp : null;
	}

	// carried lights: the best point light (lantern, torch, chemlight) of everything switched on, and without a hands
	// module the best spot light too; charge drains in game hours. With a hands module a spot light (flashlight,
	// phone) shines only from the hands: one put away switches off rather than light the world a second time.
	_updateLights( dh ) {
		const g = this.game, inv = this.inv;
		const skip = this._handsLight();
		let spot = null, spotScore = 0, point = null, pointScore = 0;
		for ( const s of inv.findAll( ( st, d ) => this.isLight( d ) && st.data.on ) ) {
			if ( s === skip ) continue;
			const d = getItem( s.id ), t = d.tool, L = t.light;
			if ( g.hands && L.kind === 'spot' ) { s.data.on = false; inv.changed(); continue; }
			if ( dh > 0 && g.mode !== 'creative' ) s.data.charge = Math.max( 0, ( s.data.charge ?? t.battery ) - dh );
			if ( ! ( s.data.charge > 0 ) ) {
				s.data.on = false;
				if ( t.kind === 'chemlight' ) { g.toast( 'Chemlight faded', 'info' ); this.consumeOne( s ); }
				else if ( t.kind === 'torch' ) { g.toast( 'Torch burned out', 'info' ); this.consumeOne( s ); }
				else g.toast( `${d.name}: batteries dead`, 'warn' );
				inv.changed();
				continue;
			}
			const score = L.intensity * L.range;
			const low = t.battery && s.data.charge < t.battery * 0.08 && t.kind !== 'chemlight' && t.kind !== 'torch';
			if ( L.kind === 'spot' ) { if ( score > spotScore ) { spotScore = score; spot = { ...L, kind: t.kind, dim: low ? 0.45 : 1, flicker: low }; } }
			else if ( score > pointScore ) { pointScore = score; point = { ...L, kind: t.kind }; }
		}
		if ( this.lights ) this.lights.spotSource = spot;
		const c = this.carried;
		if ( c ) {
			c.on = !! point && ! g.dead;
			if ( point ) {
				c.color = point.color; c.intensity = point.intensity; c.range = point.range; c.flicker = !! point.flicker;
				c.pos.set( g.player.pos.x, g.player.pos.y + ( g.player.vehicle ? 1.2 : Math.max( 0.4, g.player.stanceH - 0.45 ) ), g.player.pos.z );
			}
		}
	}

	// chemlights lying on the ground keep glowing (and draining) until they fade
	_updateGlows( dh, dt = 0 ) {
		const g = this.game, items = g.items3d;
		if ( ! items ) return;
		// rescan a few times a second (chemlights rarely move); keep the glows glued to their items every frame
		this.glowT -= dt;
		if ( this.glowT > 0 && dh <= 0 ) {
			for ( const [ it, gl ] of this.glows ) { gl.sprite.position.copy( it.pos ); gl.sprite.position.y += 0.03; gl.src?.pos.copy( it.pos ); }
			return;
		}
		this.glowT = 0.3;
		const seen = new Set();
		for ( const it of items.near( g.camera.position, 90 ) ) {
			const d = getItem( it.stack.id );
			if ( ! d?.tool?.light || ! it.stack.data.on || d.tool.kind !== 'chemlight' ) continue;
			seen.add( it );
			let gl = this.glows.get( it );
			if ( ! gl ) {
				gl = { sprite: this._sprite( d.tool.light.color, 0.55 ), src: this.lights?.add( { pos: new THREE.Vector3(), color: d.tool.light.color, intensity: d.tool.light.intensity * 1.5, range: d.tool.light.range, on: true, priority: 1, lift: 0.15 } ) };
				this.glows.set( it, gl );
			}
			if ( dh > 0 ) it.stack.data.charge = Math.max( 0, ( it.stack.data.charge ?? d.tool.battery ) - dh );
			if ( gl.src ) gl.src.pos.copy( it.pos );
			gl.sprite.position.copy( it.pos ); gl.sprite.position.y += 0.03;
			if ( ! ( it.stack.data.charge > 0 ) ) { it.stack.data.on = false; items.remove( it ); }
		}
		for ( const [ it, gl ] of this.glows ) {
			if ( seen.has( it ) && items.items.has( it ) && it.stack.data.on ) continue;
			this.game.scene.remove( gl.sprite ); gl.sprite.material.dispose();
			if ( gl.src ) this.lights.remove( gl.src );
			this.glows.delete( it );
		}
	}

	// ============================================================================================================
	// tools and odds and ends
	// ============================================================================================================

	drain( stack, hours ) {
		if ( this.game.mode !== 'creative' ) stack.data.charge = Math.max( 0, ( stack.data.charge || 0 ) - hours );
	}

	gps( stack ) {
		const g = this.game, p = g.player.pos;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
		this.drain( stack, 0.05 );
		const where = g.app?.ui?.locationName?.( p, true ) || '';
		const grid = `${Math.round( p.x )} E ${Math.round( - p.z )} N`;
		g.toast( `${where ? where + ' · ' : ''}${grid} · ${Math.round( Math.max( 0, p.y ) * 6 )} m`, 'info' );
	}

	// the emergency radio reads the weather service: what it is doing now and roughly when it turns
	radio( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) {
			// the emergency radio has a hand crank
			this.timed( 'Cranking', 6, 'reel', () => { stack.data.charge = Math.min( getItem( stack.id ).tool.battery, 2 ); this.radio( stack ); } );
			return;
		}
		this.drain( stack, 0.1 );
		playItemSound( g, 'click', { vol: 0.4 } );
		const W = g.weather;
		if ( ! W ) { g.toast( 'Static', 'info' ); return; }
		const h = Math.max( 1, Math.round( W.nextChange || 1 ) );
		g.toast( `${W.state[ 0 ].toUpperCase() + W.state.slice( 1 )} · ${h} h`, 'info' );
	}

	phoneTime( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'Battery dead', 'warn' ); return; }
		this.drain( stack, 0.02 );
		g.toast( `${fmtHour( g.hour )}, day ${g.day}`, 'info' );
	}

	rangefind( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
		this.drain( stack, 0.02 );
		const o = g.camera.position.clone(), dir = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( g.camera.quaternion );
		const hs = g.physics.raycast( o, dir, 1500 );
		const he = g.entities.raycast( o, dir, hs ? hs.t : 1500 );
		const t = he ? he.t : hs?.t;
		playItemSound( g, 'click', { vol: 0.3 } );
		g.toast( t ? `${t < 100 ? t.toFixed( 1 ) : Math.round( t )} m` : 'No reading', 'info' );
	}

	noiseMaker( sound, radius ) {
		const g = this.game, p = g.player;
		playItemSound( g, sound, { vol: 0.9 } );
		g.events.emit( 'noise', { pos: p.pos.clone(), radius, source: p, kind: sound } );
	}

	sleep( quality ) {
		const g = this.game, S = this.S;
		if ( g.world.isIndoors?.( g.player.pos ) && quality < 1 ) quality = Math.min( 1, quality + 0.1 );
		const hours = Math.max( 2, Math.min( 9, Math.round( ( 100 - S.energy ) / ( 12 * quality ) ) ) );
		g.app?.ui?.closeScreen?.();
		return g.sleep?.( hours, quality );
	}

	placeCampfire( stack ) {
		const g = this.game;
		const pos = g.crafting?.placePoint?.();
		if ( ! pos ) { g.toast( 'No room here', 'warn' ); return; }
		g.app?.ui?.closeScreen?.();
		this.timed( 'Building fire', 5, 'hit_wood', () => {
			if ( ! this.exists( stack ) ) return;
			this.consumeOne( stack );
			const fire = g.crafting.placeFire( 'campfire', pos, { lit: false, fuel: 1.5 } );
			if ( fire && ( this.fireSource() || g.mode === 'creative' ) ) g.crafting.lightFire( fire );
			else g.toast( 'Need a lighter or matches', 'info' );
		} );
	}

	placeStove( stack ) {
		const g = this.game;
		if ( this.usesLeft( stack ) <= 0 ) { g.toast( 'Canister empty', 'warn' ); return; }
		const pos = g.crafting?.placePoint?.( 0.9 );
		if ( ! pos ) { g.toast( 'No room here', 'warn' ); return; }
		g.app?.ui?.closeScreen?.();
		this.timed( 'Setting up stove', 3, 'click', () => {
			if ( ! this.exists( stack ) ) return;
			const uses = this.usesLeft( stack ) - 1;
			this.discard( stack );
			g.crafting.placeFire( 'stove', pos, { lit: true, fuel: 0.75, uses, cond: stack.cond } );
		} );
	}

	refillStove( can, stove ) {
		this.timed( 'Fitting canister', 3, 'click', () => {
			if ( ! this.exists( can ) || ! this.exists( stove ) ) return;
			stove.data.uses = getItem( stove.id ).tool.uses;
			this.changed( this.where( stove ) );
			this.consumeOne( can );
		} );
	}

	mostDamaged( pred, below ) {
		let best = null;
		for ( const s of this.inv.allStacks() ) {
			const d = getItem( s.id );
			if ( ! d || s.cond >= below || ! pred( s, d ) ) continue;
			if ( ! best || s.cond < best.cond ) best = s;
		}
		return best;
	}

	repair( tool, target ) {
		const g = this.game;
		if ( ! tool ) return;
		if ( ! target ) { g.toast( 'Nothing to repair', 'info' ); return; }
		const kind = getItem( tool.id ).tool.kind;
		const gain = kind === 'tape' ? 0.2 : 0.35;
		const cap = kind === 'tape' ? 0.85 : 1; // tape never makes it good as new
		const dt = getItem( target.id );
		this.timed( `Repairing ${dt.name}`, kind === 'tape' ? 5 : 9, kind === 'tape' ? 'tear' : 'zipper', () => {
			if ( ! this.exists( tool ) || ! this.exists( target ) ) return;
			target.cond = Math.min( cap, target.cond + gain );
			this.changed( this.where( target ) );
			this.useUp( tool );
		} );
	}

	rippable( d ) {
		if ( d.cat !== 'clothing' ) return false;
		const c = d.clothing;
		if ( [ 'bandana', 'bandana_blue', 'balaclava' ].includes( d.id ) ) return true;
		return ( c.slot === 'torso' || c.slot === 'legs' ) && ! RIP_EXCLUDE.test( d.id ) && c.armor.bullet === 0 && c.armor.bite < 0.3;
	}

	rip( stack ) {
		const g = this.game, d = getItem( stack.id );
		if ( stack.data.items?.length ) { g.toast( 'Empty it first', 'warn' ); return; }
		const n = Math.max( 1, Math.min( 6, Math.round( d.size * 1.2 * ( 0.4 + 0.6 * stack.cond ) ) ) );
		this.timed( `Ripping ${d.name}`, this.blade() ? 3 : 5, 'tear', () => {
			if ( ! this.exists( stack ) ) return;
			this.discard( stack );
			this.give( 'rags', n );
		} );
	}

	// guides teach one thing each (knowledge flags other systems read); the book stays in your bag
	read( stack ) {
		const g = this.game, d = getItem( stack.id );
		const skill = d.book?.skill;
		if ( ! skill ) return;
		if ( this.knowledge[ skill ] ) { g.toast( 'Already read', 'info' ); return; }
		this.timed( `Reading ${d.name}`, 8, null, () => {
			this.knowledge[ skill ] = true;
			g.toast( `Learned: ${SKILL_NAME[ skill ] || skill}`, 'good' );
		}, { cancelOnMove: false } );
	}

	// ============================================================================================================
	// per frame
	// ============================================================================================================

	update( dt ) {
		const g = this.game;
		// the flashlight key when no hands module handles it
		if ( ! g.hands && g.inputActive && g.input.pressed?.( 'flashlight' ) ) this.toggleLight();
		this._updateFlares( dt );
		this.tickT += dt;
		let dh = 0;
		if ( this.tickT >= 1 ) {
			this.tickT = 0;
			dh = g.time.hours - this.lastHours;
			this.lastHours = g.time.hours;
			// a sleep or /time jump spoils food as it should; a clock set backwards does nothing
			if ( dh < 0 || dh > 24 * 60 ) dh = 0;
			if ( dh > 0 ) this._spoil( dh );
		}
		this._updateLights( dh );
		this._updateGlows( dh, dt );
	}

	// food ages in game hours wherever you can see it; a cooler bag halves it
	_spoil( dh ) {
		const g = this.game;
		const age = ( items, k ) => {
			for ( const s of items ) {
				const d = getItem( s.id );
				if ( d?.food?.spoil ) s.data.age = ( s.data.age || 0 ) + dh * k;
				if ( s.data?.items?.length ) age( s.data.items, k * ( 1 - ( d?.backpack?.keepsFresh || d?.clothing?.keepsFresh || 0 ) ) );
			}
		};
		for ( const c of this.inv.containers() ) {
			const d = c.owner ? getItem( c.owner.id ) : null;
			age( c.items, 1 - ( d?.backpack?.keepsFresh || 0 ) );
		}
		// the open container (a week without power: fridges are just cupboards now)
		const other = g.app?.ui?.inventory?.other;
		if ( other?.items ) age( other.items, 1 );
		if ( g.items3d ) for ( const it of g.items3d.items ) { const d = getItem( it.stack.id ); if ( d?.food?.spoil ) it.stack.data.age = ( it.stack.data.age || 0 ) + dh; }
	}

	serialize( save ) {
		save.world = save.world || {};
		save.world.knowledge = { ...this.knowledge };
	}
	load( save ) {
		this.knowledge = { ...( save.world?.knowledge || {} ) };
		this.lastHours = this.game.time.hours;
	}

	dispose() {
		this.offDeath?.();
		for ( let i = this.flares.length - 1; i >= 0; i -- ) this._removeFlare( i );
		for ( const gl of this.glows.values() ) { this.game.scene.remove( gl.sprite ); gl.sprite.material.dispose(); }
		this.glows.clear();
		if ( this.carried ) this.lights?.remove( this.carried );
		this.glowTex?.dispose();
	}
}
