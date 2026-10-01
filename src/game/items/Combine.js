// Item-on-item mixes at runtime (game.combine; the data and matchers are in combos.js, docs/ITEMS_PLAN.md "Combos").
// Installed as a content module after the items module (game/modules.js). No three.js: the Node tests drive it.
//   find( a, b )          every combo for two stacks, either way round: [ { combo, a, b, label, state } ] where a and b
//                         are the stacks in the combo's sides and state is { ok, reason?, soft? }
//   accepts( drag, onto ) what the inventory shows while dragging one stack over another: { ok: true, verb, matches,
//                         refused } (one or more runnable combos, and the hard refusals beside them), { ok: false,
//                         reason, combo: true } (a combo, refused), or null (none, or only soft refusals)
//   cost( combo, a, b )   what it uses up, for a chooser: "2× Rags, 4× Sticks", or null for one of each
//   partners( stack )     what the stack combines with among everything you carry, the open container and the ground
//                         the inventory screen shows: [ { combo, other, a, b, verb, label, ok, reason } ], runnable
//                         first; soft refusals (nothing to repair) are left out
//   state( combo, a, b )  the dry run: { ok } or { ok: false, reason, soft }
//   run( combo, a, b )    checks, then a timed action (game.actions; creative shortens it) that applies the combo
// Consumption goes through game.itemUse (where / discard / consumeOne / splitOne / transform), the same helpers eating
// and crafting use, so a stack is used up wherever it lives: a pocket, a worn slot, a weapon slot, the open container
// or the ground.
import { getItem, makeStack, displayName, stackVolume } from './ItemDB.js';
import { capacityOf } from '../Inventory.js';
import { COMBOS, findCombos, comboLabel, useSpec, unitsIn, maxUses, maxPortions, liquidIn, liquidRoom, kindOk } from './combos.js';
import { provides, liquidName, worstLiquid } from './util.js';
import { ensureItemSound, ITEM_SOUNDS } from './sounds.js';

const TOOL_NEED = { cut: 'a blade', chop: 'an axe', saw: 'a saw', hammer: 'a hammer', pot: 'a cooking pot', toolbox: 'a toolbox', canopener: 'a can opener',
	pliers: 'pliers', screwdriver: 'a screwdriver', sewing: 'a sewing kit', tape: 'duct tape', lighter: 'a lighter', dig: 'a shovel', pry: 'a crowbar' };
const GROUND_R = 2.6; // the inventory screen's ground radius
const ITEM_SOUND = new Set( ITEM_SOUNDS );

export class Combine {
	constructor( game ) {
		this.game = game;
		this.warned = new Set();
	}

	get inv() { return this.game.player.inventory; }
	get use() { return this.game.itemUse; }

	// combos whose outputs exist (a domain may name an id that another domain has not added yet)
	_live() {
		if ( this._n !== COMBOS.length ) {
			this._n = COMBOS.length;
			this.list = COMBOS.filter( c => {
				const bad = c.out.find( ( [ id ] ) => ! getItem( id ) );
				if ( bad && ! this.warned.has( c.id ) ) { this.warned.add( c.id ); console.warn( `combo ${c.id}: unknown output ${bad[ 0 ]}` ); }
				return ! bad;
			} );
		}
		return this.list;
	}

	// ---- queries --------------------------------------------------------------------------------------------------

	find( a, b, opts = {} ) {
		return findCombos( a, b, { both: opts.both, list: this._live() } ).map( m => ( { ...m, label: comboLabel( m.combo, m.a, m.b ), state: this.state( m.combo, m.a, m.b ) } ) );
	}

	// soft refusals (nothing to mend, liquids that don't mix) are not a target: the drop falls through to the section,
	// so moving a bottle past other bottles still works. `refused` lists the hard refusals for a chooser to grey out.
	accepts( drag, onto ) {
		const list = this.find( drag, onto );
		if ( ! list.length ) return null;
		const ok = list.filter( m => m.state.ok ), refused = list.filter( m => ! m.state.ok && ! m.state.soft && m.state.reason );
		if ( ok.length ) return { ok: true, verb: ok.length === 1 ? ok[ 0 ].label : `Combine (${ok.length})`, matches: ok, refused };
		return refused.length ? { ok: false, reason: refused[ 0 ].state.reason, combo: true } : null;
	}

	// what a combo uses up, for a chooser: "2× Rags, 4× Sticks" (null when it is one of each)
	cost( combo, a, b ) {
		const parts = [];
		let many = false;
		for ( const [ s, u ] of [ [ a, combo.use.a ], [ b, combo.use.b ] ] ) {
			const d = getItem( s.id ), spec = useSpec( u, d );
			if ( ! spec ) continue;
			const n = spec.all ? s.qty : spec.n;
			if ( n > 1 || spec.all ) many = true;
			parts.push( spec.kind === 'qty' || spec.all ? `${n}× ${d.name}` : `${d.name} (${n} ${spec.kind === 'uses' ? ( n > 1 ? 'uses' : 'use' ) : ( n > 1 ? 'shots' : 'shot' )})` );
		}
		if ( combo.liquid ) { many = true; parts.push( `${combo.liquid.litres} L ${liquidName( Array.isArray( combo.liquid.kind ) || combo.liquid.kind === 'any' ? 'water' : combo.liquid.kind )}` ); }
		return many ? parts.join( ', ' ) : null;
	}

	// the stacks the inventory screen shows: carried (one level into pouches), the open container, the ground nearby
	candidates() {
		const g = this.game, out = [ ...this.inv.allStacks() ];
		const other = g.app?.ui?.inventory?.other;
		if ( other?.items ) for ( const s of other.items ) { out.push( s ); if ( s.data?.items ) out.push( ...s.data.items ); }
		for ( const wi of g.items3d?.near?.( g.player.pos, GROUND_R ) || [] ) if ( wi.stack ) out.push( wi.stack );
		return out;
	}

	partners( stack ) {
		if ( ! stack || ! getItem( stack.id ) ) return [];
		const best = new Map(); // combo + orientation + partner id -> the best partner stack of that id
		for ( const other of this.candidates() ) {
			if ( other === stack ) continue;
			for ( const m of this.find( stack, other, { both: true } ) ) {
				if ( m.state.soft ) continue;
				const key = m.combo.id + ( m.a === stack ? '>' : '<' ) + other.id;
				const p = { combo: m.combo, other, a: m.a, b: m.b, verb: m.combo.verb, label: m.label, ok: m.state.ok, reason: m.state.reason || null };
				const cur = best.get( key );
				if ( ! cur || this._better( p, cur ) ) best.set( key, p );
			}
		}
		return [ ...best.values() ].sort( ( x, y ) => ( y.ok - x.ok ) );
	}

	// between two stacks of the same partner: a runnable one, then the one that needs it most (most worn, emptiest,
	// fullest when it is the source of a liquid)
	_better( p, q ) {
		if ( p.ok !== q.ok ) return p.ok;
		const need = ( s ) => {
			const d = getItem( s.id );
			if ( d.tool?.battery ) return ( s.data.charge ?? 0 ) / d.tool.battery;
			const l = liquidIn( s, d );
			if ( l ) return l.litres / Math.max( 0.01, l.cap ) * ( s === p.a || s === q.a ? - 1 : 1 );
			return s.cond;
		};
		return need( p.other ) < need( q.other );
	}

	// ---- checks -----------------------------------------------------------------------------------------------------

	// is the stack still somewhere the player can reach (not used up meanwhile)
	_exists( s ) {
		if ( ! s || ! ( s.qty > 0 ) ) return false;
		const U = this.use;
		return U?.where ? !! U.where( s ) : true;
	}

	// units of a side available: this stack, plus other carried stacks of the same id for plain units
	_available( stack, spec, skip ) {
		if ( spec.all ) return Infinity;
		let n = unitsIn( stack, spec.kind );
		if ( spec.kind === 'qty' && n < spec.n ) for ( const s of this._sameId( stack, skip ) ) n += s.qty;
		return n;
	}

	_sameId( stack, skip ) {
		return this.inv.findAll( ( s ) => s.id === stack.id && s !== stack && s !== skip && ! s.data?.items?.length );
	}

	_hasTool( kind, a, b, combo ) {
		const usedUp = ( s ) => ( s === a && combo.use.a ) || ( s === b && combo.use.b );
		return this.inv.find( ( s ) => provides( s, kind ) && ! usedUp( s ) );
	}

	// litres of a liquid kind you carry (water containers, fuel cans)
	_carried( kind ) {
		let L = 0;
		for ( const s of this.inv.allStacks() ) { const l = liquidIn( s ); if ( l && kindOk( kind, l.kind ) ) L += l.litres; }
		return L;
	}

	state( combo, a, b ) {
		const g = this.game;
		if ( ! a || ! b || a === b ) return { ok: false, reason: null, soft: true };
		const A = getItem( a.id ), B = getItem( b.id );
		if ( ! A || ! B ) return { ok: false, reason: null, soft: true };
		// nothing to mend: not worth offering
		const rep = combo.repair;
		if ( rep ) for ( const side of [ 'a', 'b' ] ) if ( rep[ side ] && ( side === 'a' ? a : b ).cond >= ( rep.max ?? 1 ) - 0.005 ) return { ok: false, reason: 'Not damaged', soft: true };
		for ( const [ side, s, d, other ] of [ [ 'a', a, A, b ], [ 'b', b, B, a ] ] ) {
			const spec = useSpec( combo.use[ side ], d );
			if ( ! spec ) continue;
			// used up with something still inside it, or a gun with a magazine or attachments: empty it first
			if ( s.data?.items?.length ) return { ok: false, reason: 'Empty it first' };
			if ( d.firearm && ( s.data?.mag || Object.values( s.data?.att || {} ).some( Boolean ) ) ) return { ok: false, reason: 'Unload it first' };
			if ( this._available( s, spec, other ) < spec.n ) return { ok: false, reason: spec.kind === 'qty' ? `Need ${spec.n}× ${d.name}` : 'Not enough left' };
		}
		const lq = combo.liquid;
		if ( lq ) {
			const src = lq.side === 'a' ? a : lq.side === 'b' ? b : null;
			const have = src ? ( kindOk( lq.kind, liquidIn( src )?.kind ) ? liquidIn( src ).litres : 0 ) : this._carried( lq.kind );
			if ( have < lq.litres - 1e-6 ) return { ok: false, reason: `Need ${lq.litres} L ${lq.kind === 'any' || Array.isArray( lq.kind ) ? 'water' : liquidName( lq.kind )}` };
		}
		for ( const t of combo.tools ) if ( ! this._hasTool( t, a, b, combo ) ) return { ok: false, reason: `Need ${TOOL_NEED[ t ] || t}` };
		if ( combo.station === 'fire' && ! g.nearFire?.( g.player.pos ) ) return { ok: false, reason: 'Need a fire' };
		if ( combo.check ) {
			let r = null;
			try { r = combo.check( this._ctx( combo, a, b ) ); } catch ( e ) { console.error( 'combo check', combo.id, e ); r = 'Can\'t'; }
			if ( r ) return typeof r === 'string' ? { ok: false, reason: r } : { ok: false, reason: r.reason, soft: !! r.soft };
		}
		return { ok: true };
	}

	// ---- running ----------------------------------------------------------------------------------------------------

	_skill( combo ) { return combo.skill ? ( this.game.skills?.level?.( combo.skill ) || 0 ) : 0; }

	timeOf( combo, a, b ) {
		let t = typeof combo.time === 'function' ? combo.time( this._ctx( combo, a, b ) ) : combo.time;
		// practice makes the hands quicker (4% a level)
		t *= 1 - 0.04 * this._skill( combo );
		return Math.max( 0, t || 0 );
	}

	_sound( name, vol = 0.55 ) {
		const au = this.game.audio;
		if ( ! name || ! au ) return null;
		if ( ITEM_SOUND.has( name ) ) ensureItemSound( au, name );
		return au.play?.( name, { vol } );
	}

	run( combo, a, b ) {
		const g = this.game;
		const st = this.state( combo, a, b );
		if ( ! st.ok ) { if ( st.reason ) g.toast( st.reason, 'warn' ); return false; }
		const time = this.timeOf( combo, a, b );
		const label = combo.progress || comboLabel( combo, a, b );
		const inv0 = this.inv;
		const go = () => {
			// died or respawned meanwhile (a fresh inventory): the old things are the body's now
			if ( g.dead || this.inv !== inv0 ) return;
			// things change during the action: re-check (a stack used, the fire out, the bottle drunk)
			if ( ! this._exists( a ) || ! this._exists( b ) ) return;
			const s2 = this.state( combo, a, b );
			if ( ! s2.ok ) { if ( s2.reason ) g.toast( s2.reason, 'warn' ); return; }
			this.apply( combo, a, b );
		};
		if ( time <= 0 ) { this._sound( combo.sound ); go(); return true; }
		if ( g.actions.busy ) g.actions.cancel();
		if ( ITEM_SOUND.has( combo.sound ) ) ensureItemSound( g.audio, combo.sound );
		g.actions.start( { label, time, sound: combo.sound || null, cancelOnMove: true, combo: { id: combo.id, a: a.uid, b: b.uid },
			onDone: () => { try { go(); } catch ( e ) { console.error( 'combo', combo.id, e ); } this.inv.changed(); } } );
		return true;
	}

	// the standard effects in order, then the combo's own run (no checks: run() and the tests call this after state())
	apply( combo, a, b ) {
		const g = this.game;
		const ctx = this._ctx( combo, a, b );
		const lv = this._skill( combo );
		// liquid first: it comes out of a container that may itself be used up below
		const lq = combo.liquid;
		if ( lq ) {
			if ( lq.side ) this.draw( lq.side === 'a' ? a : b, lq.litres );
			else this.drawCarried( lq.kind, lq.litres );
		}
		// condition: what is mended (a little more with the skill), what wore as a tool, the extra tools
		for ( const side of [ 'a', 'b' ] ) {
			const s = side === 'a' ? a : b;
			const r = combo.repair?.[ side ];
			if ( r ) s.cond = Math.min( combo.repair.max ?? 1, s.cond + r * ( 1 + 0.06 * lv ) );
			const w = combo.wear?.[ side ];
			if ( w ) s.cond = Math.max( 0.02, s.cond - w * ( 1 - 0.05 * lv ) );
		}
		for ( const t of combo.tools ) { const tool = this._hasTool( t, a, b, combo ); if ( tool ) tool.cond = Math.max( 0.05, tool.cond - 0.01 ); }
		// a side that becomes the output (a bat into a nailed bat) hands over its hotbar key and the hands
		const inv = this.inv, keep = [];
		for ( const s of [ a, b ] ) {
			const slot = inv.hotbar?.indexOf( s.uid ) ?? - 1;
			if ( slot >= 0 || inv.hands === s.uid ) keep.push( { uid: s.uid, slot, held: inv.hands === s.uid } );
		}
		ctx.used.a = this.consume( a, combo.use.a, b );
		ctx.used.b = this.consume( b, combo.use.b, a );
		for ( const [ id, q, data ] of combo.out ) ctx.give( id, q, data );
		combo.run?.( ctx );
		for ( const k of keep ) {
			if ( inv.findUid( k.uid ) ) continue;
			const to = ctx.made.find( s => s.qty > 0 && getItem( s.id )?.stack === 1 && inv.findUid( s.uid ) );
			if ( ! to ) continue;
			if ( k.slot >= 0 && ! inv.hotbar.includes( to.uid ) ) inv.hotbar[ k.slot ] = to.uid;
			if ( k.held ) g.hands?.select?.( to );
		}
		if ( combo.repair ) {
			const s = combo.repair.a ? a : b;
			g.toast( `${displayName( s )} ${Math.round( s.cond * 100 )}%`, 'good' );
		}
		if ( combo.skill ) g.skills?.xp?.( combo.skill, combo.xp ?? Math.max( 2, Math.min( 12, ( typeof combo.time === 'number' ? combo.time : 4 ) / 2 ) ) );
		if ( combo.fun ) g.survival?.mood?.( combo.fun );
		if ( combo.noise?.radius ) g.events?.emit?.( 'noise', { pos: g.player.pos.clone ? g.player.pos.clone() : { ...g.player.pos }, radius: combo.noise.radius, source: g.player, kind: 'combine' } );
		// what was changed where it lies (the open container, the ground) is saved as changed
		for ( const s of [ a, b ] ) if ( s.qty > 0 ) this._changed( s );
		this.inv.changed();
		g.events?.emit?.( 'combine', { id: combo.id, a, b } );
		return ctx;
	}

	_changed( s ) {
		const U = this.use;
		if ( U?.changed && U.where ) U.changed( U.where( s ) );
	}

	_ctx( combo, a, b ) {
		const g = this.game;
		const ctx = {
			game: g, inv: this.inv, combo, a, b, A: getItem( a.id ), B: getItem( b.id ), use: g.itemUse,
			survival: g.survival, player: g.player, skills: g.skills,
			used: { a: 0, b: 0 }, made: [],
			consume: ( s, n ) => this.consume( s, n ),
			give: ( id, qty = 1, data ) => { const m = this.give( id, qty, data ); ctx.made.push( ...m ); return m; },
			replace: ( s, id, data = {} ) => this.replace( s, id, data ),
			toast: ( text, kind = 'info' ) => g.toast( text, kind ),
			sound: ( name ) => this._sound( name ),
			pour: ( from, to, litres ) => this.pour( from, to, litres ),
			draw: ( s, litres ) => this.draw( s, litres ),
			liquid: ( s ) => liquidIn( s ),
		};
		return ctx;
	}

	// ---- effects ----------------------------------------------------------------------------------------------------

	// use up units of a stack (see `use` in combos.js); returns how many were used
	consume( stack, u, skip = null ) {
		const d = getItem( stack?.id );
		const spec = useSpec( u, d );
		if ( ! spec || ! d ) return 0;
		const U = this.use;
		if ( spec.all ) { const n = stack.qty; this._discard( stack ); return n; }
		let n = spec.n;
		if ( spec.kind === 'uses' ) {
			const max = maxUses( d );
			while ( n > 0 && stack.qty > 0 ) {
				const left = stack.data.uses ?? max;
				const take = Math.min( n, left );
				stack.data.uses = left - take;
				n -= take;
				if ( stack.data.uses <= 0 ) {
					delete stack.data.uses;
					this.game.toast( `${d.name} used up`, 'info' );
					this._consumeOne( stack );
				} else this._changed( stack );
			}
			return spec.n - n;
		}
		if ( spec.kind === 'portions' ) {
			const p = maxPortions( d ), box = d.drink?.container && getItem( d.drink.container ) ? d.drink.container : null;
			while ( n > 0 && stack.qty > 0 ) {
				// one unit at a time: a crate of juice boxes gives one box
				const one = stack.qty > 1 && U?.splitOne ? U.splitOne( stack ) : stack;
				const left = one.data.left ?? p;
				const take = Math.min( n, left );
				one.data.left = left - take;
				n -= take;
				if ( one.data.left > 0 ) { this._changed( one ); continue; }
				delete one.data.left;
				// the last shot leaves the bottle
				if ( box && U?.transform ) U.transform( one, box, { liquid: null, amount: 0 } );
				else this._consumeOne( one );
				if ( one === stack && box ) break;
			}
			return spec.n - n;
		}
		// plain units: this stack first, then other stacks of the same id you carry
		n -= this._take( stack, n );
		if ( n > 0 ) for ( const s of this._sameId( stack, skip ) ) { if ( n <= 0 ) break; n -= this._take( s, n ); }
		return spec.n - n;
	}

	// up to n of a stack; the unit in use carries per-unit state (portions left, an opened can), the next one starts
	// fresh, as ItemUse.consumeOne does
	_take( s, n ) {
		const t = Math.min( n, s.qty );
		if ( t <= 0 ) return 0;
		s.qty -= t;
		if ( s.qty <= 0 ) { this._discard( s ); return t; }
		delete s.data.left; delete s.data.open; delete s.data.spill;
		this._changed( s );
		return t;
	}

	_discard( s ) {
		const U = this.use;
		if ( U?.discard ) U.discard( s );
		else this.inv.remove( s );
	}

	_consumeOne( s ) {
		const U = this.use;
		if ( U?.consumeOne ) U.consumeOne( s );
		else { s.qty --; if ( s.qty <= 0 ) this.inv.remove( s ); }
	}

	// new stacks into the inventory (a weapon to a free weapon slot, like crafting), the rest dropped at your feet.
	// The HUD's pickup row says what came out when the screen is closed (it is not loot: no 'item:pick' event, which
	// counts towards the "Looted" stat).
	give( id, qty = 1, data = null ) {
		const g = this.game, d = getItem( id );
		if ( ! d || ! ( qty > 0 ) ) return [];
		const made = [];
		let left = qty, dropped = false;
		while ( left > 0 ) {
			const n = Math.min( left, d.stack );
			const s = makeStack( id, n );
			if ( data ) Object.assign( s.data, JSON.parse( JSON.stringify( data ) ) );
			left -= n;
			const rest = this.inv.add( s );
			if ( rest > 0 ) { s.qty = rest; g.dropStack?.( s ); dropped = true; }
			made.push( s );
		}
		this.inv.changed();
		g.app?.ui?.hud?.pickup?.( { id, qty, data: made[ 0 ]?.data || {} } );
		if ( dropped ) g.toast( 'No room, dropped', 'warn' );
		return made;
	}

	// one unit of a stack becomes another item where it lies (a water bottle becomes a sports drink). What a bag or a
	// pocket held stays in it (a dyed backpack, jeans cut into shorts) as far as it fits; the rest goes into your other
	// bags, else at your feet.
	replace( stack, id, data = {} ) {
		const U = this.use;
		const items = stack.qty === 1 && stack.data?.items?.length && ! data.items ? stack.data.items : null;
		if ( items ) data = { ...data, items: [] };
		let one;
		if ( U?.transform ) one = U.transform( stack, id, data );
		else { stack.id = id; stack.data = data; one = stack; }
		if ( items ) {
			const cap = capacityOf( one ), out = [];
			let vol = 0;
			for ( const s of items ) { const v = stackVolume( s ); if ( vol + v <= cap + 1e-6 ) { one.data.items.push( s ); vol += v; } else out.push( s ); }
			if ( ! one.data.items.length ) delete one.data.items;
			for ( const s of out ) if ( this.inv.add( s, { autoEquip: false } ) > 0 ) this.game.dropStack?.( s );
			if ( out.length ) this.game.toast( 'Some things fell out', 'info' );
			this.inv.changed();
		}
		return one;
	}

	// take litres out of one container; returns what came out
	draw( stack, litres ) {
		const l = liquidIn( stack );
		if ( ! l ) return 0;
		const take = Math.min( litres, l.litres );
		stack.data.amount = l.litres - take;
		if ( ! l.fuel && stack.data.amount < 0.005 ) { stack.data.amount = 0; stack.data.liquid = null; }
		return take;
	}

	drawCarried( kind, litres ) {
		let need = litres;
		for ( const s of [ ...this.inv.allStacks() ] ) {
			if ( need <= 1e-6 ) break;
			const l = liquidIn( s );
			if ( l && kindOk( kind, l.kind ) ) need -= this.draw( s, need );
		}
		return litres - need;
	}

	// pour from one container into another, as much as fits; the worse liquid wins a mix
	pour( from, to, litres = Infinity ) {
		const lf = liquidIn( from ), lt = liquidIn( to );
		if ( ! lf?.kind || ! lt ) return 0;
		const kind = lf.kind;
		const n = Math.min( litres, lf.litres, liquidRoom( to ) );
		if ( n <= 0 ) return 0;
		this.draw( from, n );
		if ( ! lt.fuel ) to.data.liquid = lt.kind ? worstLiquid( lt.kind, kind ) : kind;
		to.data.amount = lt.litres + n;
		return n;
	}
}

export function install( game ) {
	game.combine = new Combine( game );
}
