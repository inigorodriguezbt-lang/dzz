// What you can do with an item (game.itemUse): the right-click menu and double-click default of the inventory,
// quick-heal, and everything that follows — eating (portions, opening cans with the right tool, cracking coconuts,
// cooking at a fire), drinking (cans, bottles, canteens of water / seawater / dirty water), medicine and kits,
// lights with batteries, reading, repairing, ripping clothes into rags, flares and chemlights, sleeping.
//   actions( stack ) -> [ { label, run } ]   (the first is the double-click default)
//   use( stack )                             runs the default action
//   fillFrom( kind, stack? )                 'sea' | 'tap' | 'rain' (| 'dirty'): fills a water container
//   toggleLight( stack? )                    the flashlight key (the hands module can call it)
// Also per frame: food spoils in game hours (inventory, the open container, the ground; cooler bags slow it),
// batteries drain in lights that are on, the carried light is fed to the light pool, dropped chemlights and
// burning flares glow.
import * as THREE from 'three';
import { getItem, makeStack, cloneStack, newUid, freshness } from './ItemDB.js';
import { playItemSound, ensureItemSound } from './sounds.js';
import { liquidName, worstLiquid, provides, fmtHour, cardinal } from './util.js';

const GERUND = {
	'Bandage': 'Bandaging', 'Pack wounds': 'Packing the wounds', 'Apply tourniquet': 'Tightening the tourniquet', 'Stitch wounds': 'Stitching the wounds',
	'Disinfect wounds': 'Disinfecting', 'Clean wounds': 'Cleaning the wounds', 'Inject': 'Injecting', 'Apply': 'Applying', 'Splint leg': 'Splinting your leg',
	'Start IV': 'Running the IV', 'Transfuse': 'Transfusing', 'Bandage with a rag': 'Bandaging', 'Purify water': 'Purifying',
};

const RADIO = [
	'"…this is the Emergency Alert System. Residents of Oʻahu should remain indoors. Evacuation points at Aloha Stadium are closed…"',
	'"…Coast Guard Sector Honolulu, all vessels: Kewalo Basin is not safe. Repeat, Kewalo Basin is not safe…"',
	'A pre-recorded voice reads the tide tables for Hilo Bay. Nobody has changed the tape in days.',
	'"…if you can hear this, we are at the Kahului airport terminal. We have water. Come in daylight, come slow, hands where we can see them…"',
	'Slack-key guitar on KINE, looping the same three songs. Someone left the automation running.',
	'"…National Guard checkpoint at the H-3 tunnels has been abandoned. Do not attempt to cross the Koʻolau…"',
	'Static, then a child counting in Hawaiian — ʻekahi, ʻelua, ʻekolu — then static again.',
	'"…Molokaʻi is quiet. Stay off our island." The same message, every hour.',
];
const PHONE = [
	'12 unread messages. The last one: "where are you?? pick up"',
	'No service. The lock screen is a photo of a dog on a surfboard.',
	'A news alert from six days ago: "Governor declares state of emergency".',
	'Voicemail full. Battery low.',
];

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
		this._fwd = new THREE.Vector3();
		this.glowTex = null;
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
		const add = ( label, run ) => A.push( { label, run } );
		const first = ( label, run ) => A.unshift( { label, run } );
		const g = this.game, inv = this.inv;
		const nearFire = !! g.nearFire?.( g.player.pos );

		// ---- food ----
		if ( d.food ) {
			const f = d.food;
			if ( d.unpack ) add( 'Unpack', () => this.unpack( stack ) );
			if ( d.opensTo ) {
				const b = this.blade();
				add( b ? `Crack open (${getItem( b.id ).name})` : 'Crack open (needs a blade)', () => this.crack( stack ) );
			} else if ( f.opener && ! stack.data.open ) {
				const o = f.opener === 'cut' ? this.cutOption() : this.openOption();
				add( o ? o.label : ( f.opener === 'cut' ? 'Cut open (needs a blade)' : 'Open (needs a can opener, a knife or a stone)' ), () => this.openFood( stack ) );
			} else {
				const left = stack.data.left ?? f.portions;
				let label = f.raw ? 'Eat raw' : 'Eat';
				if ( f.portions > 1 ) label += ` (${left}/${f.portions})`;
				if ( f.spoil && freshness( stack ) <= 0 ) label += ' — rotten!';
				add( label, () => this.eat( stack ) );
			}
			if ( f.raw && f.cooked && getItem( f.cooked ) ) {
				if ( nearFire ) first( 'Cook on the fire', () => this.cook( stack ) );
				else add( 'Cook (needs a fire)', () => this.cook( stack ) );
			}
		}

		// ---- drinks ----
		if ( d.drink ) {
			const k = d.drink, left = stack.data.left ?? k.portions;
			add( k.portions > 1 ? `Drink (${left}/${k.portions})` : 'Drink', () => this.drinkItem( stack ) );
			if ( k.container && getItem( k.container ) ) add( 'Pour it out', () => this.pourOut( stack ) );
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
			if ( L > 0.01 && liq && liq !== 'fuel' ) add( `Drink ${liquidName( liq )}${liq === 'sea' ? ' (salty!)' : liq === 'dirty' ? ' (risky)' : ''}`, () => this.drinkFrom( stack ) );
			if ( L > 0.01 && liq === 'dirty' ) { const p = this.purifier(); if ( p ) add( `Purify with ${getItem( p.id ).name}`, () => this.purify( p, stack ) ); }
			if ( L < d.tool.liquid - 0.01 && this.canCollectRain() ) add( 'Collect rain', () => this.fillFrom( 'rain', stack ) );
			if ( L > 0.01 ) add( 'Empty it', () => this.emptyContainer( stack ) );
		}

		// ---- fuel ----
		if ( d.fuel ) {
			if ( d.fuel.kind === 'propane' ) { const st = inv.find( ( s, dd ) => dd?.tool?.kind === 'stove' ); if ( st ) add( 'Fit to the camp stove', () => this.refillStove( stack, st ) ); }
			if ( ( stack.data.amount || 0 ) > 0.01 && d.fuel.kind !== 'propane' ) add( 'Empty it', () => this.emptyFuel( stack ) );
		}

		// ---- tools ----
		if ( d.tool ) this._toolActions( stack, d, add );

		// ---- throwables we light ourselves ----
		if ( d.throwable?.kind === 'flare' ) {
			add( 'Strike and throw', () => this.lightFlare( stack, true ) );
			add( 'Strike and drop', () => this.lightFlare( stack, false ) );
		}

		// ---- clothing ----
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) {
			if ( stack.cond < 0.95 && this.findKind( 'sewing' ) ) add( 'Repair (sewing kit)', () => this.repair( this.findKind( 'sewing' ), stack ) );
			if ( stack.cond < 0.8 && this.findKind( 'tape' ) ) add( 'Patch up (duct tape)', () => this.repair( this.findKind( 'tape' ), stack ) );
			if ( this.rippable( d ) ) add( 'Rip into rags', () => this.rip( stack ) );
		}

		// ---- fuel for a fire ----
		if ( nearFire && this.game.crafting?.fuelValue?.( d.id ) ) add( 'Put on the fire', () => this.game.crafting.addFuel( stack ) );

		// ---- reading and odds and ends ----
		if ( d.book ) add( 'Read', () => this.read( stack ) );
		switch ( d.id ) {
			case 'newspaper': add( 'Read the paper', () => this.read( stack ) ); break;
			case 'ukulele': add( 'Play', () => this.noiseMaker( stack, 'strum', 45, 'You strum a few bars of "Hawaiʻi Aloha". It carries a long way.' ) ); break;
			case 'rubber_duck': add( 'Squeeze', () => this.noiseMaker( stack, 'squeak', 18, 'Squeak.' ) ); break;
			case 'laptop': add( 'Open it', () => this.game.toast( 'The battery is dead. Somebody\'s whole life is on it.', 'info' ) ); break;
			case 'family_photo': add( 'Look at it', () => this.game.toast( 'A family grinning on Waikīkī beach. "Summer 2019" on the back.', 'info' ) ); break;
		}
		return A;
	}

	_toolActions( stack, d, add ) {
		const g = this.game, t = d.tool, inv = this.inv;
		// lights
		if ( t.light ) {
			if ( t.kind === 'chemlight' ) {
				if ( stack.data.on ) add( 'Drop it (lit)', () => this.dropLit( stack ) );
				else { add( 'Snap to light', () => this.snapChemlight( stack, false ) ); add( 'Snap and drop', () => this.snapChemlight( stack, true ) ); }
			} else if ( t.kind === 'torch' ) {
				add( stack.data.on ? 'Put out the torch' : ( this.fireSource() ? 'Light the torch' : 'Light the torch (needs a lighter or matches)' ), () => this.toggleLight( stack ) );
			} else {
				const dead = ! ( stack.data.charge > 0 );
				add( stack.data.on ? 'Turn off' : dead ? 'Turn on (batteries dead)' : 'Turn on', () => this.toggleLight( stack ) );
			}
		}
		if ( t.battery && t.kind !== 'chemlight' && t.kind !== 'torch' && ( stack.data.charge ?? 0 ) < t.battery * 0.95 && inv.count( 'batteries' ) > 0 ) add( 'Replace the batteries', () => this.replaceBatteries( stack ) );
		switch ( t.kind ) {
			case 'battery': {
				const dev = this.lowestDevice();
				if ( dev ) add( `Put into ${getItem( dev.id ).name}`, () => this.replaceBatteries( dev ) );
				break;
			}
			case 'map': add( 'Read the map', () => { g.app?.ui?.closeScreen?.(); g.app?.ui?.map?.open?.(); } ); break;
			case 'compass': add( 'Check heading', () => { const deg = ( ( - g.player.yaw * 180 / Math.PI ) % 360 + 360 ) % 360; g.toast( `Heading ${Math.round( deg )}° ${cardinal( deg )}`, 'info' ); } ); break;
			case 'watch': add( 'Check the time', () => g.toast( `${fmtHour( g.hour )} — day ${g.day}`, 'info' ) ); break;
			case 'gps': add( 'Check position', () => this.gps( stack ) ); break;
			case 'radio': add( 'Listen', () => this.radio( stack ) ); break;
			case 'phone': add( 'Check messages', () => this.phone( stack ) ); break;
			case 'rangefinder': add( 'Measure distance', () => this.rangefind( stack ) ); break;
			case 'binoculars': add( 'Look through them', () => { if ( g.hands?.select ) { g.hands.select( stack ); g.toast( 'Aim to look through the binoculars', 'info' ); } else g.toast( 'You scan the horizon.', 'info' ); } ); break;
			case 'fishingrod': add( 'Fish here', () => g.fishing?.cast?.( stack ) ); break;
			case 'tent': add( 'Pitch the tent and sleep', () => this.sleep( 1.0 ) ); break;
			case 'sleepingbag': add( 'Sleep', () => this.sleep( 0.85 ) ); break;
			case 'whistle': add( 'Blow the whistle', () => this.noiseMaker( stack, 'whistle', 110, 'A shrill blast. Every infected within a hundred metres heard that.' ) ); break;
			case 'stove': add( ( stack.data.uses ?? t.uses ) > 0 ? 'Set up the stove' : 'Set up the stove (canister empty)', () => this.placeStove( stack ) ); break;
			case 'campfire': add( 'Place the campfire', () => this.placeCampfire( stack ) ); break;
			case 'sewing': { const tg = this.mostDamaged( ( s, dd ) => dd.cat === 'clothing' || dd.cat === 'backpack', 0.95 ); add( tg ? `Repair ${getItem( tg.id ).name}` : 'Repair clothing (nothing torn)', () => this.repair( stack, tg ) ); break; }
			case 'tape': { const tg = this.mostDamaged( ( s, dd ) => dd.cat !== 'firearm' && dd.cat !== 'food', 0.8 ); add( tg ? `Patch up ${getItem( tg.id ).name}` : 'Patch something up (nothing damaged)', () => this.repair( stack, tg ) ); break; }
			case 'cleaning': { const tg = this.mostDamaged( ( s, dd ) => dd.cat === 'firearm', 0.98 ); add( tg ? `Clean ${getItem( tg.id ).name}` : 'Clean a gun (none need it)', () => this.repair( stack, tg ) ); break; }
			case 'canopener': { const c = this.inv.find( ( s, dd ) => dd?.food?.opener === true && ! s.data.open ); if ( c ) add( `Open ${getItem( c.id ).name}`, () => this.openFood( c ) ); break; }
			case 'solar': { const dev = this.lowestDevice( true ); add( dev ? `Charge ${getItem( dev.id ).name}` : 'Charge (nothing to charge)', () => this.solarCharge( dev ) ); break; }
			case 'lighter': case 'matches': { const tch = this.inv.find( ( s, dd ) => dd?.tool?.kind === 'torch' && ! s.data.on ); if ( tch ) add( 'Light a torch', () => this.toggleLight( tch ) ); break; }
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

	where( stack ) {
		const inv = this.inv;
		const find = ( items ) => { for ( const s of items ) { if ( s === stack ) return items; if ( s.data?.items ) { const r = find( s.data.items ); if ( r ) return r; } } return null; };
		for ( const c of inv.containers() ) { const r = find( c.items ); if ( r ) return { kind: 'inv', items: r }; }
		for ( const k in inv.equip ) { if ( inv.equip[ k ] === stack ) return { kind: 'equip', slot: k }; }
		for ( const k in inv.weapons ) { if ( inv.weapons[ k ] === stack ) return { kind: 'weapon', slot: k }; }
		const other = this.game.app?.ui?.inventory?.other;
		if ( other?.items ) { const r = find( other.items ); if ( r ) return { kind: 'other', items: r, container: other }; }
		const wi = this.game.items3d?.byStack?.( stack );
		if ( wi ) return { kind: 'ground', item: wi };
		return null;
	}

	exists( stack ) { return stack.qty > 0 && !! this.where( stack ); }

	changed( w = null ) {
		this.inv.changed();
		if ( w?.kind === 'other' ) this.game.events.emit( 'container:changed', { container: w.container } );
		if ( w?.kind === 'ground' ) this.game.items3d?.refresh?.( w.item );
	}

	discard( stack ) {
		const w = this.where( stack );
		if ( ! w ) return;
		if ( w.kind === 'inv' || w.kind === 'equip' || w.kind === 'weapon' ) this.inv.remove( stack );
		else if ( w.kind === 'other' ) { const i = w.items.indexOf( stack ); if ( i >= 0 ) w.items.splice( i, 1 ); }
		else if ( w.kind === 'ground' ) this.game.items3d.remove( w.item );
		this.changed( w );
	}

	// one unit is used up; per-unit state (portions left, an opened can) resets for the next one
	consumeOne( stack ) {
		stack.qty -= 1;
		if ( stack.qty <= 0 ) { this.discard( stack ); return; }
		delete stack.data.left; delete stack.data.open; delete stack.data.spill;
		this.changed( this.where( stack ) );
	}

	// a single unit to work on: split off a stack of several (opening one can of four)
	splitOne( stack ) {
		if ( stack.qty <= 1 ) return stack;
		const w = this.where( stack );
		const part = cloneStack( stack );
		part.uid = newUid();
		part.qty = 1;
		stack.qty -= 1;
		if ( w?.items ) w.items.splice( w.items.indexOf( stack ) + 1, 0, part );
		else if ( w?.kind === 'ground' ) this.game.items3d.spawn( part, w.item.pos.clone().add( new THREE.Vector3( 0.12, 0.05, 0.08 ) ), { persistent: true } );
		else if ( this.inv.add( part, { autoEquip: false } ) > 0 ) this.game.dropStack( part );
		this.changed( w );
		return part;
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
		if ( stack.data.uses <= 0 ) { this.game.toast( `${d.name} is used up`, 'info' ); this.consumeOne( stack ); } else this.inv.changed();
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
	openOption() {
		const inv = this.inv;
		const op = inv.find( ( s ) => provides( s, 'canopener' ) );
		if ( op ) return { tool: op, label: `Open with ${getItem( op.id ).name}`, time: 3, loss: 0 };
		const knife = inv.find( ( s ) => provides( s, 'open_can' ) );
		if ( knife ) return { tool: knife, label: `Open with ${getItem( knife.id ).name}`, time: 5, loss: 0.1, wear: 0.01 };
		const heavy = inv.find( ( s, d ) => d?.melee && ( d.melee.tools?.some( t => [ 'chop', 'hammer', 'pry', 'break' ].includes( t ) ) || d.melee.kind === 'blunt' || d.melee.kind === 'axe' ) );
		if ( heavy ) return { tool: heavy, label: `Bash open with ${getItem( heavy.id ).name}`, time: 5, loss: 0.25, wear: 0.02, sound: 'hit_metal' };
		const stone = inv.find( ( s, d ) => d?.id === 'stone' );
		if ( stone ) return { tool: stone, label: 'Bash open with a stone', time: 6, loss: 0.3, sound: 'hit_metal' };
		return null;
	}
	cutOption() {
		const b = this.blade();
		return b ? { tool: b, label: `Cut open (${getItem( b.id ).name})`, time: 4, loss: 0, wear: 0.005 } : null;
	}
	wear( stack, amount ) { if ( stack && amount ) { stack.cond = Math.max( 0.02, stack.cond - amount ); } }

	// ============================================================================================================
	// eating and drinking
	// ============================================================================================================

	openFood( stack ) {
		const d = getItem( stack.id ), f = d.food;
		const opt = f.opener === 'cut' ? this.cutOption() : this.openOption();
		if ( ! opt ) { this.game.toast( f.opener === 'cut' ? 'You need a knife or machete to cut this open' : 'You need a can opener or a knife — or bash it open with a stone', 'warn' ); return; }
		const one = this.splitOne( stack );
		this.timed( `Opening ${d.name}`, opt.time, opt.sound || ( f.opener === 'cut' ? 'tear' : 'can_open' ), () => {
			if ( ! this.exists( one ) ) return;
			one.data.open = true;
			if ( opt.loss ) { one.data.spill = opt.loss; this.game.toast( 'You spill some of it opening it that way', 'info' ); }
			this.wear( opt.tool, opt.wear );
			this.changed( this.where( one ) );
		} );
	}

	crack( stack ) {
		const d = getItem( stack.id );
		const b = this.blade();
		if ( ! b ) { this.game.toast( 'You need a blade — a machete, a knife — to crack a coconut', 'warn' ); return; }
		this.timed( `Cracking the ${d.name.toLowerCase()}`, 3.5, 'hit_wood', () => {
			if ( ! this.exists( stack ) ) return;
			this.transform( stack, d.opensTo, { age: 0 } );
			this.wear( b, 0.005 );
		} );
	}

	eat( stack ) {
		const d = getItem( stack.id ), f = d.food;
		if ( f.opener && ! stack.data.open && ! d.opensTo ) { this.openFood( stack ); return; }
		if ( d.opensTo ) { this.crack( stack ); return; }
		const one = f.portions > 1 ? this.splitOne( stack ) : stack;
		const time = 2.5 + Math.min( 3, ( f.kcal / f.portions ) / 350 );
		this.timed( `Eating ${d.name}`, time, 'eat', () => {
			if ( ! this.exists( one ) ) return;
			const S = this.S;
			const msg = S.eat( one );
			if ( one.data.spill ) S.hunger = Math.max( 0, S.hunger - f.kcal / 20 / f.portions * one.data.spill );
			if ( msg ) this.game.toast( msg, 'warn' );
			else if ( f.raw ) this.game.toast( 'That was raw…', 'warn' );
			one.data.left = ( one.data.left ?? f.portions ) - 1;
			if ( one.data.left <= 0 ) this.consumeOne( one );
			else this.changed( this.where( one ) );
		} );
	}

	cook( stack ) {
		const g = this.game, d = getItem( stack.id ), f = d.food;
		if ( ! g.nearFire?.( g.player.pos ) ) { g.toast( 'You need a campfire to cook on — place a fire kit and light it', 'warn' ); return; }
		const one = this.splitOne( stack );
		this.timed( `Cooking ${d.name.replace( /^Raw /, '' )}`, d.weight > 1 ? 16 : 11, 'sizzle', () => {
			if ( ! this.exists( one ) ) return;
			this.transform( one, f.cooked, { age: 0 } );
			g.toast( `${getItem( f.cooked ).name} is ready`, 'good' );
		} );
	}

	scaledDrink( k, portions ) {
		const p = Math.max( 1, portions );
		return { drink: { ...k, water: k.water / p, kcal: k.kcal / p, alcohol: k.alcohol / p, caffeine: k.caffeine / p } };
	}

	drinkItem( stack ) {
		const d = getItem( stack.id ), k = d.drink;
		const one = k.portions > 1 ? this.splitOne( stack ) : stack;
		const sound = /can/.test( d.model?.type || '' ) && d.model?.style === 'soda' ? 'can_open' : 'drink';
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
		const g = this.game, S = this.S;
		const liq = stack.data.liquid;
		const sip = Math.min( stack.data.amount || 0, 0.5 );
		if ( sip <= 0 ) return;
		this.timed( 'Drinking', 3, 'drink', () => {
			if ( ! this.exists( stack ) ) return;
			S.drink( null, sip, liq );
			stack.data.amount = Math.max( 0, ( stack.data.amount || 0 ) - sip );
			if ( stack.data.amount < 0.005 ) { stack.data.amount = 0; stack.data.liquid = null; }
			if ( liq === 'water' && S.thirst >= 100 ) g.toast( 'You are no longer thirsty', 'good' );
			this.changed( this.where( stack ) );
		} );
	}

	emptyContainer( stack ) {
		this.timed( 'Emptying', 1.5, 'pour', () => { stack.data.amount = 0; stack.data.liquid = null; this.changed( this.where( stack ) ); } );
	}

	emptyFuel( stack ) {
		this.timed( 'Emptying the can', 3, 'pour', () => { stack.data.amount = 0; this.changed( this.where( stack ) ); } );
	}

	canCollectRain() {
		const g = this.game;
		return ( g.weather?.rain || 0 ) > 0.25 && ! g.world.isIndoors?.( g.player.pos ) && ! g.player.vehicle;
	}

	// fill a water container from the sea, a tap, the rain or a stream
	fillFrom( kind, stack = null ) {
		const g = this.game;
		const liq = kind === 'sea' ? 'sea' : kind === 'dirty' ? 'dirty' : 'water';
		const ok = ( s, d ) => d?.tool?.liquid && ( s.data.amount || 0 ) < d.tool.liquid - 0.01 && ( ! s.data.liquid || ( s.data.amount || 0 ) < 0.01 || s.data.liquid === liq || kind !== 'rain' );
		const c = stack && ok( stack, getItem( stack.id ) ) ? stack : this.inv.find( ( s, d ) => ok( s, d ) && ( ! s.data.liquid || s.data.liquid === liq || ( s.data.amount || 0 ) < 0.01 ) ) || this.inv.find( ok );
		if ( ! c ) { g.toast( 'You have nothing to fill — find a bottle, canteen or pot', 'warn' ); return false; }
		if ( kind === 'rain' && ! this.canCollectRain() ) { g.toast( 'It needs to be raining, and you need to be outside', 'warn' ); return false; }
		const d = getItem( c.id ), cap = d.tool.liquid;
		const time = kind === 'rain' ? 8 : Math.min( 8, 2 + cap * 1.2 );
		this.timed( kind === 'rain' ? 'Collecting rainwater' : `Filling the ${d.name.toLowerCase()}`, time, kind === 'rain' ? null : 'pour', () => {
			if ( ! this.exists( c ) ) return;
			const cur = c.data.amount || 0;
			const add = kind === 'rain' ? Math.min( cap - cur, 0.15 + 0.35 * ( g.weather?.rain || 0.5 ) ) : cap - cur;
			c.data.liquid = cur > 0.01 && c.data.liquid ? worstLiquid( c.data.liquid, liq ) : liq;
			c.data.amount = Math.min( cap, cur + add );
			const what = liquidName( c.data.liquid );
			g.toast( `${d.name}: ${c.data.amount.toFixed( 2 )} L of ${what}${c.data.liquid === 'sea' ? ' — boil it at a fire before drinking' : ''}`, c.data.liquid === 'water' ? 'good' : 'info' );
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
			g.toast( salty ? 'Tablets do nothing for salt — boil seawater at a fire instead' : 'You have no dirty water to purify', 'warn' );
			return;
		}
		const need = Math.max( 1, Math.ceil( ( c.data.amount || 0 ) / ( d.medical.purify || 1 ) ) );
		const have = d.medical.uses ? this.usesLeft( tab ) : tab.qty;
		if ( have < need ) { g.toast( `You need ${need} ${d.medical.uses ? 'doses' : 'tablets'} for ${( c.data.amount || 0 ).toFixed( 1 )} L`, 'warn' ); return; }
		this.timed( 'Purifying water', 4, 'pills', () => {
			if ( ! this.exists( c ) || ! this.exists( tab ) ) return;
			c.data.liquid = 'water';
			if ( d.medical.uses ) this.useUp( tab, need );
			else { tab.qty -= need; if ( tab.qty <= 0 ) this.discard( tab ); }
			g.toast( 'The water is safe to drink', 'good' );
		} );
	}

	// ============================================================================================================
	// medicine
	// ============================================================================================================

	medicate( stack ) {
		const g = this.game, S = this.S, d = getItem( stack.id ), m = d.medical;
		// refuse what would only be wasted
		if ( m.splint && ! S.fracture ) { g.toast( 'Nothing is broken', 'info' ); return; }
		if ( m.splint && S.splint ) { g.toast( 'Your leg is already splinted', 'info' ); return; }
		if ( m.bleed && S.bleeding <= 0 ) { g.toast( 'You are not bleeding', 'info' ); return; }
		if ( m.infection && ! S.infected && ! m.heal && ! m.pain && ! ( m.sick && S.sick > 0.1 ) ) { g.toast( 'You have no infection to treat', 'info' ); return; }
		if ( m.blood && S.blood > 4900 ) { g.toast( 'You have not lost any blood', 'info' ); return; }
		if ( m.sick && ! m.infection && ! m.heal && S.sick <= 0.05 ) { g.toast( 'Your stomach is fine', 'info' ); return; }
		const verb = m.verb || 'Use';
		const label = GERUND[ verb ] || ( /^Take/.test( verb ) ? 'Taking medicine' : verb );
		this.timed( label, m.use || 3, m.sound || 'bandage', () => {
			if ( ! this.exists( stack ) ) return;
			const bleeding = S.bleeding;
			S.medicate( d );
			if ( m.bleed && bleeding > 0 ) g.toast( S.bleeding > 0 ? `Still bleeding (${S.bleeding} wound${S.bleeding > 1 ? 's' : ''})` : 'The bleeding has stopped', S.bleeding > 0 ? 'warn' : 'good' );
			if ( m.infection && S.infected ) g.toast( 'The infection is still there — keep treating it', 'warn' );
			else if ( m.infection && ! m.bleed && ! S.infected ) g.toast( 'The wound looks clean', 'good' );
			if ( m.splint ) g.toast( 'Leg splinted — take it slow while it heals', 'good' );
			if ( m.uses ) this.useUp( stack ); else this.consumeOne( stack );
		} );
	}

	unpack( stack ) {
		const g = this.game, d = getItem( stack.id );
		this.timed( `Unpacking ${d.name}`, 2.5, 'unwrap', () => {
			if ( ! this.exists( stack ) ) return;
			const names = [];
			for ( const [ id, q ] of d.unpack || [] ) { if ( ! getItem( id ) ) continue; this.give( id, q, { full: true } ); names.push( `${q > 1 ? q + '× ' : ''}${getItem( id ).name}` ); }
			this.consumeOne( stack );
			g.toast( names.length ? 'Unpacked: ' + names.join( ', ' ) : 'It was empty', 'good' );
		} );
	}

	// ============================================================================================================
	// lights
	// ============================================================================================================

	isLight( d ) { return !! d?.tool?.light; }

	// the flashlight key, or a light's Turn on / off action
	toggleLight( stack = null ) {
		const g = this.game, inv = this.inv;
		if ( ! stack ) {
			const on = inv.findAll( ( s, d ) => this.isLight( d ) && s.data.on && d.tool.kind !== 'chemlight' );
			if ( on.length ) { for ( const s of on ) if ( getItem( s.id ).tool.kind !== 'torch' ) s.data.on = false; playItemSound( g, 'click', { vol: 0.4 } ); inv.changed(); return; }
			const order = [ 'headlamp', 'flashlight', 'lantern', 'phone' ];
			const cand = inv.findAll( ( s, d ) => this.isLight( d ) && order.includes( d.tool.kind ) && s.data.charge > 0 ).sort( ( a, b ) => order.indexOf( getItem( a.id ).tool.kind ) - order.indexOf( getItem( b.id ).tool.kind ) );
			if ( ! cand.length ) { g.toast( 'You have no working light', 'warn' ); return; }
			stack = cand[ 0 ];
		}
		const d = getItem( stack.id );
		if ( d.tool.kind === 'torch' ) {
			if ( stack.data.on ) { stack.data.on = false; playItemSound( g, 'snap', { vol: 0.3 } ); inv.changed(); return; }
			const src = this.fireSource();
			if ( ! src ) { g.toast( 'You need a lighter or matches', 'warn' ); return; }
			this.timed( 'Lighting the torch', 2, 'strike', () => { stack.data.on = true; if ( ! ( stack.data.charge > 0 ) ) stack.data.charge = d.tool.battery; this.useUp( src ); } );
			return;
		}
		if ( ! stack.data.on && ! ( stack.data.charge > 0 ) ) { g.toast( `The ${d.name.toLowerCase()} is dead — it needs batteries`, 'warn' ); return; }
		stack.data.on = ! stack.data.on;
		playItemSound( g, 'click', { vol: 0.45 } );
		inv.changed();
	}

	replaceBatteries( dev ) {
		const g = this.game, d = getItem( dev.id );
		const bat = this.inv.find( ( s ) => s.id === 'batteries' );
		if ( ! bat ) { g.toast( 'You have no batteries', 'warn' ); return; }
		this.timed( `Changing the batteries`, 3, 'click', () => {
			if ( ! this.exists( bat ) ) return;
			dev.data.charge = d.tool.battery;
			this.consumeOne( bat );
			g.toast( `${d.name}: fresh batteries`, 'good' );
		} );
	}

	lowestDevice( rechargeableOnly = false ) {
		const list = this.inv.findAll( ( s, d ) => d?.tool?.battery && ! [ 'chemlight', 'torch' ].includes( d.tool.kind ) && ( ! rechargeableOnly || d.tool.rechargeable ) && ( s.data.charge ?? 0 ) < d.tool.battery * 0.95 );
		list.sort( ( a, b ) => ( a.data.charge ?? 0 ) / getItem( a.id ).tool.battery - ( b.data.charge ?? 0 ) / getItem( b.id ).tool.battery );
		return list[ 0 ] || null;
	}

	solarCharge( dev ) {
		const g = this.game;
		if ( ! dev ) { g.toast( 'Nothing needs charging', 'info' ); return; }
		if ( g.world.sky.sunDir.y < 0.12 || g.world.isIndoors?.( g.player.pos ) ) { g.toast( 'The panel needs direct sunlight', 'warn' ); return; }
		const d = getItem( dev.id );
		this.timed( `Charging ${d.name}`, 15, null, () => {
			dev.data.charge = Math.min( d.tool.battery, ( dev.data.charge || 0 ) + d.tool.battery * 0.35 * Math.min( 1, 1.25 - ( g.weather?.cover ?? 0.3 ) ) );
			g.toast( `${d.name}: ${Math.round( dev.data.charge / d.tool.battery * 100 )}% charged`, 'good' );
		} );
	}

	snapChemlight( stack, drop ) {
		const g = this.game;
		const one = this.splitOne( stack );
		playItemSound( g, 'snap', { vol: 0.5 } );
		one.data.on = true;
		if ( ! ( one.data.charge > 0 ) ) one.data.charge = getItem( one.id ).tool.battery;
		if ( drop ) this.dropLit( one );
		else this.inv.changed();
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
		this.timed( 'Striking the flare', 1, 'strike', () => {
			if ( ! this.exists( stack ) ) return;
			this.consumeOne( stack );
			const eye = new THREE.Vector3( p.pos.x, p.eye - 0.2, p.pos.z );
			const dir = p.lookDir( new THREE.Vector3() );
			const f = {
				pos: eye.clone().addScaledVector( dir, 0.4 ), vel: thrown ? dir.clone().multiplyScalar( 11 ).add( new THREE.Vector3( 0, 3, 0 ) ) : new THREE.Vector3( dir.x, 0.5, dir.z ).multiplyScalar( 1.5 ),
				burn: d.throwable.burn || 420, flying: true, noiseT: 0, light: d.throwable.light, obj: null, snd: null, src: null,
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
		f.snd = g.audio?.loop ? ( ensureItemSound( g.audio, 'flare_loop' ), g.audio.loop( 'flare_loop', { pos: f.pos, vol: 0.5, bus: 'sfx' } ) ) : null;
	}

	_updateFlares( dt ) {
		const g = this.game;
		for ( let i = this.flares.length - 1; i >= 0; i -- ) {
			const f = this.flares[ i ];
			if ( f.flying ) {
				f.vel.y -= 18 * dt;
				const step = f.vel.clone().multiplyScalar( dt );
				const len = step.length();
				const hit = len > 0 ? g.physics.raycast( f.pos, step.clone().divideScalar( len ), len + 0.05, { water: true } ) : null;
				if ( hit ) {
					f.pos.copy( hit.point ).addScaledVector( hit.normal, 0.05 );
					if ( hit.kind === 'water' ) { f.burn = Math.min( f.burn, 8 ); } // it fizzles out in the sea
					if ( hit.normal.y > 0.5 || f.vel.length() < 2 ) f.flying = false;
					else f.vel.reflect( hit.normal ).multiplyScalar( 0.35 );
				} else f.pos.add( step );
				if ( f.pos.y < g.hf.heightAt( f.pos.x, f.pos.z ) ) { f.pos.y = g.hf.heightAt( f.pos.x, f.pos.z ) + 0.05; f.flying = false; }
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

	// carried lights: the best spot light (flashlight / headlamp / phone) and the best point light (lantern, torch,
	// chemlight) of everything switched on; batteries drain in game hours
	_updateLights( dh ) {
		const g = this.game, inv = this.inv;
		let spot = null, spotScore = 0, point = null, pointScore = 0;
		for ( const s of inv.findAll( ( st, d ) => this.isLight( d ) && st.data.on ) ) {
			const d = getItem( s.id ), t = d.tool, L = t.light;
			if ( dh > 0 ) s.data.charge = Math.max( 0, ( s.data.charge ?? t.battery ) - dh );
			if ( ! ( s.data.charge > 0 ) ) {
				s.data.on = false;
				if ( t.kind === 'chemlight' ) { g.toast( 'Your chemlight has faded', 'info' ); this.consumeOne( s ); }
				else if ( t.kind === 'torch' ) { g.toast( 'The torch has burned out', 'info' ); this.consumeOne( s ); }
				else g.toast( `Your ${d.name.toLowerCase()} died — the batteries are flat`, 'warn' );
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
		this.glowT = ( this.glowT ?? 0 ) - dt;
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

	gps( stack ) {
		const g = this.game, p = g.player.pos;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'The GPS is dead', 'warn' ); return; }
		stack.data.charge = Math.max( 0, stack.data.charge - 0.05 );
		const where = g.app?.ui?.locationName?.( p, true ) || '';
		const grid = `${Math.round( p.x )} E, ${Math.round( - p.z )} N`;
		g.toast( `${where} · ${grid} · elev ${Math.round( Math.max( 0, p.y ) * 6 )} m`, 'info' );
	}

	radio( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) {
			// the emergency radio has a hand crank
			if ( getItem( stack.id ).id === 'radio' ) { this.timed( 'Cranking the radio', 6, 'reel', () => { stack.data.charge = Math.min( getItem( stack.id ).tool.battery, 2 ); this.radio( stack ); } ); return; }
			g.toast( 'Dead batteries', 'warn' ); return;
		}
		stack.data.charge = Math.max( 0, stack.data.charge - 0.1 );
		playItemSound( g, 'click', { vol: 0.4 } );
		const walkie = getItem( stack.id ).id === 'walkie_talkie';
		g.toast( walkie ? ( Math.random() < 0.8 ? 'Static on every channel.' : '"…anyone copy? This is unit four at Kalihi station, we need…" Static.' ) : RADIO[ Math.floor( Math.random() * RADIO.length ) ], 'info' );
	}

	phone( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'The phone is dead', 'warn' ); return; }
		stack.data.charge = Math.max( 0, stack.data.charge - 0.05 );
		g.toast( PHONE[ Math.floor( Math.random() * PHONE.length ) ], 'info' );
	}

	rangefind( stack ) {
		const g = this.game;
		if ( ! ( stack.data.charge > 0 ) ) { g.toast( 'The rangefinder is dead', 'warn' ); return; }
		stack.data.charge = Math.max( 0, stack.data.charge - 0.02 );
		const o = g.camera.position.clone(), dir = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( g.camera.quaternion );
		const hs = g.physics.raycast( o, dir, 1500 );
		const he = g.entities.raycast( o, dir, hs ? hs.t : 1500 );
		const t = he ? he.t : hs?.t;
		playItemSound( g, 'click', { vol: 0.3 } );
		g.toast( t ? `Range: ${t < 100 ? t.toFixed( 1 ) : Math.round( t )} m${he ? ' (' + ( he.entity.type === 'zombie' ? 'infected' : he.entity.type ) + ')' : ''}` : 'No reading', 'info' );
	}

	noiseMaker( stack, sound, radius, text ) {
		const g = this.game, p = g.player;
		playItemSound( g, sound, { vol: 0.9 } );
		g.events.emit( 'noise', { pos: p.pos.clone(), radius, source: p, kind: sound } );
		if ( text ) g.toast( text, 'info' );
	}

	sleep( quality ) {
		const g = this.game, S = this.S;
		if ( g.world.isIndoors?.( g.player.pos ) && quality < 1 ) quality = Math.min( 1, quality + 0.1 );
		const hours = Math.max( 2, Math.min( 9, Math.round( ( 100 - S.energy ) / ( 12 * quality ) ) ) );
		return g.sleep?.( hours, quality );
	}

	placeCampfire( stack ) {
		const g = this.game;
		const pos = g.crafting?.placePoint?.();
		if ( ! pos ) { g.toast( 'No room for a fire here', 'warn' ); return; }
		this.timed( 'Building a campfire', 5, 'hit_wood', () => {
			if ( ! this.exists( stack ) ) return;
			this.consumeOne( stack );
			const fire = g.crafting.placeFire( 'campfire', pos, { lit: false, fuel: 1.5 } );
			const src = this.fireSource();
			if ( src && fire ) { g.crafting.lightFire( fire ); } else g.toast( 'The fire is laid. Light it with a lighter or matches (F).', 'info' );
		} );
	}

	placeStove( stack ) {
		const g = this.game, d = getItem( stack.id );
		if ( this.usesLeft( stack ) <= 0 ) { g.toast( 'The canister is empty — fit a propane canister', 'warn' ); return; }
		const pos = g.crafting?.placePoint?.( 0.9 );
		if ( ! pos ) { g.toast( 'No room here', 'warn' ); return; }
		this.timed( 'Setting up the stove', 3, 'click', () => {
			if ( ! this.exists( stack ) ) return;
			const uses = this.usesLeft( stack ) - 1;
			this.discard( stack );
			g.crafting.placeFire( 'stove', pos, { lit: true, fuel: 0.75, uses, cond: stack.cond } );
			void d;
		} );
	}

	refillStove( can, stove ) {
		this.timed( 'Fitting the canister', 3, 'click', () => {
			if ( ! this.exists( can ) || ! this.exists( stove ) ) return;
			stove.data.uses = getItem( stove.id ).tool.uses;
			this.consumeOne( can );
			this.game.toast( 'The stove is good for ten more meals', 'good' );
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
		if ( ! target ) { g.toast( 'Nothing needs repairing', 'info' ); return; }
		const kind = getItem( tool.id ).tool.kind;
		const gain = kind === 'sewing' ? 0.35 : kind === 'cleaning' ? 0.35 : 0.2;
		const cap = kind === 'tape' ? 0.85 : 1;
		const dt = getItem( target.id );
		this.timed( `Repairing ${dt.name}`, kind === 'tape' ? 5 : 9, kind === 'tape' ? 'tear' : 'zipper', () => {
			if ( ! this.exists( tool ) || ! this.exists( target ) ) return;
			target.cond = Math.min( cap, target.cond + gain );
			this.useUp( tool );
			g.toast( `${dt.name} repaired`, 'good' );
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
		if ( stack.data.items?.length ) { g.toast( 'Empty its pockets first', 'warn' ); return; }
		const n = Math.max( 1, Math.min( 6, Math.round( d.size * 1.2 * ( 0.4 + 0.6 * stack.cond ) ) ) );
		const b = this.blade();
		this.timed( `Ripping ${d.name} into rags`, b ? 3 : 5, 'tear', () => {
			if ( ! this.exists( stack ) ) return;
			this.discard( stack );
			this.give( 'rags', n );
			g.toast( `${n} rags`, 'good' );
		} );
	}

	read( stack ) {
		const g = this.game, d = getItem( stack.id );
		const pages = d.book?.pages || [ 'The last edition: "OUTBREAK SPREADS — Governor urges calm". The sports page is still about the Rainbow Warriors.' ];
		this.timed( `Reading ${d.name}`, 3, null, () => {
			pages.forEach( ( p, i ) => setTimeout( () => g.toast( p, 'info' ), i * 1400 ) );
			if ( d.book?.skill && ! this.knowledge[ d.book.skill ] ) {
				this.knowledge[ d.book.skill ] = true;
				setTimeout( () => g.toast( `You learned something about ${d.book.skill}`, 'good' ), pages.length * 1400 );
			}
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
		for ( let i = this.flares.length - 1; i >= 0; i -- ) this._removeFlare( i );
		for ( const gl of this.glows.values() ) { this.game.scene.remove( gl.sprite ); gl.sprite.material.dispose(); }
		this.glows.clear();
		if ( this.carried ) this.lights?.remove( this.carried );
		this.glowTex?.dispose();
	}
}
