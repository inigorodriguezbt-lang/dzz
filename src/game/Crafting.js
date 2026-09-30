// Crafting and fires (game.crafting).
//   recipes            every recipe whose ingredients exist (src/game/items/recipes.js); r.toolLabels names r.tools
//   available()        the ones you can make right now
//   canCraft( r ) / check( r ) -> { ok, reason } / craft( r )
// Recipes consume their `in` items (loose ones before anything worn or in a weapon slot, never a piece of clothing
// that still holds something), need their `tools` (a tool's kind, or a melee weapon's tools: 'cut', 'chop'…),
// optionally a `station: 'fire'` (a lit campfire or stove within reach) and `liquid` drawn from what you carry
// (water from bottles and canteens, gasoline from fuel cans). The special 'boil' recipe turns the dirty water and
// seawater you carry into drinking water (seawater loses volume as it distils).
//
// Fires: placeFire( kind, pos, opts ) for a campfire or camp stove, lightFire, addFuel( stack ), fuelValue( id ),
// placePoint(); sets game.nearFire( pos ) -> bool (warmth in Survival, the crafting UI's station check).
// F on a fire: light it, feed it, put it out, pack up the stove. Fires are saved in save.world.campfires.
import * as THREE from 'three';
import { ITEMS, getItem, makeStack } from './items/ItemDB.js';
import { allRecipes } from './items/recipes.js';
import { Campfire } from './items/Campfire.js';
import { provides } from './items/util.js';
import { raySphere } from './Entities.js';
import { ensureItemSound } from './items/sounds.js';

// game hours a fuel item keeps a campfire going
const FUEL = { stick: 0.25, long_stick: 0.6, firewood: 1.5, planks: 1, charcoal: 2.5, newspaper: 0.1, rags: 0.08, animal_hide: 0.5, campfire_kit: 1.5,
	comic_book: 0.1, bible: 0.15, phrasebook: 0.08, tiki: 0.8, ukulele: 0.3 };
const MAX_FUEL = 8;
const REAL_FUEL = new Set( [ 'stick', 'long_stick', 'firewood', 'planks', 'charcoal' ] );

export class Crafting {
	constructor( game, lights = null ) {
		this.game = game;
		this.lights = lights;
		this.recipes = allRecipes().filter( r => ITEMS.has( r.out[ 0 ] ) && r.in.every( ( [ id ] ) => ITEMS.has( id ) ) );
		// display names for the tool kinds ('cut' -> 'blade') so the crafting panel can show them plainly
		for ( const r of this.recipes ) r.toolLabels = ( r.tools || [] ).map( t => TOOL_LABEL[ t ] || t );
		this.fires = [];
		this.lastHours = game.time.hours;
		game.nearFire = ( pos, r = null ) => this.nearFire( pos, r );
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
	}

	get inv() { return this.game.player.inventory; }

	// ---- recipes ----------------------------------------------------------------------------------------------

	available() { return this.recipes.filter( r => this.canCraft( r ) ); }
	canCraft( r ) { return this.check( r ).ok; }

	hasTool( kind ) { return !! this.inv.find( ( s ) => provides( s, kind ) ); }

	// the stacks of an ingredient a recipe may use up, in the order it takes them: loose ones in your containers
	// first, then what you wear or hold in a weapon slot; never one that still holds items (a shirt with a full
	// pocket), and whole units before part-used ones
	ingredientStacks( id ) {
		const inv = this.inv, loose = [], worn = [];
		const empty = ( s ) => ! s.data?.items?.length;
		for ( const c of inv.containers() ) for ( const s of c.items ) {
			if ( s.id === id && empty( s ) ) loose.push( s );
			if ( s.data?.items ) for ( const t of s.data.items ) if ( t.id === id && empty( t ) ) loose.push( t );
		}
		for ( const s of [ ...Object.values( inv.equip ), ...Object.values( inv.weapons ) ] ) if ( s?.id === id && empty( s ) ) worn.push( s );
		const part = ( s ) => ( s.data?.left != null || s.data?.open ) ? 1 : 0;
		loose.sort( ( a, b ) => part( a ) - part( b ) );
		return [ ...loose, ...worn ];
	}

	ingredientCount( id ) { let n = 0; for ( const s of this.ingredientStacks( id ) ) n += s.qty; return n; }

	consumeIngredient( id, n ) {
		for ( const s of this.ingredientStacks( id ) ) {
			if ( n <= 0 ) break;
			const take = Math.min( s.qty, n );
			s.qty -= take; n -= take;
			if ( s.qty <= 0 ) this.inv.remove( s );
		}
		this.inv.changed();
	}

	// litres of a liquid you carry: water in water containers, gasoline in fuel cans
	liquidAvailable( kind ) {
		let L = 0;
		for ( const s of this.inv.allStacks() ) {
			const d = getItem( s.id );
			if ( kind === 'fuel' && d?.fuel?.kind === 'gasoline' ) L += s.data.amount || 0;
			else if ( d?.tool?.liquid && s.data.liquid === ( kind === 'fuel' ? 'fuel' : 'water' ) ) L += s.data.amount || 0;
		}
		return L;
	}

	drawLiquid( kind, litres ) {
		let need = litres;
		for ( const s of [ ...this.inv.allStacks() ] ) {
			if ( need <= 1e-6 ) break;
			const d = getItem( s.id );
			const ok = kind === 'fuel' ? ( d?.fuel?.kind === 'gasoline' || ( d?.tool?.liquid && s.data.liquid === 'fuel' ) ) : ( d?.tool?.liquid && s.data.liquid === 'water' );
			if ( ! ok ) continue;
			const take = Math.min( need, s.data.amount || 0 );
			s.data.amount = ( s.data.amount || 0 ) - take;
			need -= take;
			if ( d.tool?.liquid && s.data.amount < 0.005 ) { s.data.amount = 0; s.data.liquid = null; }
		}
	}

	// what boiling would work on: containers with dirty water or seawater, and whether we have a vessel for them
	boilable() {
		const list = this.inv.findAll( ( s, d ) => d?.tool?.liquid && ( s.data.liquid === 'dirty' || s.data.liquid === 'sea' ) && s.data.amount > 0.01 );
		const pot = this.hasTool( 'pot' );
		return list.filter( s => pot || getItem( s.id ).tool.metal );
	}

	check( r ) {
		const g = this.game, inv = this.inv;
		if ( ! r ) return { ok: false, reason: 'Unknown recipe' };
		for ( const [ id, q ] of r.in ) {
			if ( this.ingredientCount( id ) >= q ) continue;
			// there are enough, but one is a piece of clothing with something in it
			return { ok: false, reason: inv.count( id ) >= q ? 'Empty it first' : `Need ${q}× ${getItem( id )?.name || id}` };
		}
		for ( const t of r.tools || [] ) if ( ! this.hasTool( t ) ) return { ok: false, reason: `Need ${TOOL_NEED[ t ] || t}` };
		if ( r.station === 'fire' && ! this.nearFire( g.player.pos ) ) return { ok: false, reason: 'Need a fire' };
		if ( r.liquid && this.liquidAvailable( r.liquid.kind ) < r.liquid.litres - 1e-6 ) return { ok: false, reason: r.liquid.kind === 'fuel' ? `Need ${r.liquid.litres} L gasoline` : `Need ${r.liquid.litres} L water` };
		if ( r.special === 'boil' ) {
			if ( ! this.boilable().length ) {
				const any = inv.find( ( s, d ) => d?.tool?.liquid && ( s.data.liquid === 'dirty' || s.data.liquid === 'sea' ) );
				return { ok: false, reason: any ? 'Need a pot' : 'No water to boil' };
			}
		}
		return { ok: true };
	}

	craft( r ) {
		const g = this.game;
		const c = this.check( r );
		if ( ! c.ok ) { g.toast( c.reason, 'warn' ); return false; }
		const time = r.special === 'boil' ? 6 + this.boilable().reduce( ( a, s ) => a + ( s.data.amount || 0 ), 0 ) * 5 : r.time;
		const sound = r.station === 'fire' ? 'sizzle' : 'craft';
		ensureItemSound( g.audio, sound );
		g.actions.start( {
			label: r.special === 'boil' ? 'Boiling water' : r.station === 'fire' ? r.name : `Crafting ${r.name}`, time, sound, cancelOnMove: true,
			onDone: () => {
				const c2 = this.check( r );
				if ( ! c2.ok ) { g.toast( c2.reason, 'warn' ); return; }
				if ( r.special === 'boil' ) { this.boil(); return; }
				for ( const [ id, q ] of r.in ) this.consumeIngredient( id, q );
				if ( r.liquid ) this.drawLiquid( r.liquid.kind, r.liquid.litres );
				// tools wear a little
				for ( const t of r.tools || [] ) { const tool = this.inv.find( ( s ) => provides( s, t ) ); if ( tool ) tool.cond = Math.max( 0.05, tool.cond - 0.01 ); }
				const [ id, n ] = r.out;
				const d = getItem( id );
				let left = n;
				while ( left > 0 ) {
					const q = Math.min( left, d.stack );
					const s = makeStack( id, q );
					left -= q;
					if ( this.inv.add( s ) > 0 ) { g.dropStack( s ); g.toast( 'No room, dropped', 'warn' ); }
				}
				this.inv.changed();
				g.events.emit( 'item:pick', { stack: { id, qty: n, data: {}, uid: 'craft' } } );
				g.stats.crafted = ( g.stats.crafted || 0 ) + 1;
			},
		} );
		return true;
	}

	boil() {
		const g = this.game;
		let clean = 0;
		for ( const s of this.boilable() ) {
			if ( s.data.liquid === 'sea' ) s.data.amount *= 0.6; // the salt stays behind with part of the water
			s.data.liquid = 'water';
			clean += s.data.amount;
		}
		this.inv.changed();
		g.toast( `${clean.toFixed( 1 )} L clean water`, 'good' );
	}

	// ---- fires ------------------------------------------------------------------------------------------------

	nearFire( pos, r = null ) {
		for ( const f of this.fires ) {
			if ( ! f.lit ) continue;
			const R = r ?? f.radius;
			const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z, dy = f.pos.y - pos.y;
			if ( dx * dx + dz * dz < R * R && Math.abs( dy ) < 2 ) return true;
		}
		return false;
	}

	fuelValue( id ) { return FUEL[ id ] || 0; }

	// what F feeds a fire: real fuel only (books, rags and ukuleles burn from the item menu), the longest burning
	// first
	bestFuel() {
		let best = null;
		for ( const s of this.inv.allStacks() ) if ( REAL_FUEL.has( s.id ) && ( ! best || FUEL[ s.id ] > FUEL[ best.id ] ) ) best = s;
		return best;
	}

	// a spot on the ground in front of the player for a fire or stove
	placePoint( dist = 1.1 ) {
		const g = this.game, p = g.player;
		if ( p.vehicle || p.swimming ) return null;
		const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
		const chest = new THREE.Vector3( p.pos.x, p.pos.y + 0.8, p.pos.z );
		const hit = g.physics.raycastBoxes( chest, new THREE.Vector3( fx, 0, fz ), dist + 0.4 );
		const d = hit ? Math.max( 0.5, hit.t - 0.45 ) : dist;
		const x = p.pos.x + fx * d, z = p.pos.z + fz * d;
		const gr = g.physics.ground( x, z, p.pos.y + 0.6, 0.7, 0.2 );
		if ( Math.abs( gr.y - p.pos.y ) > 1 ) return null;
		if ( gr.y < g.physics.waterLevel( x, z ) - 0.05 ) return null;
		for ( const f of this.fires ) if ( f.pos.distanceTo( new THREE.Vector3( x, gr.y, z ) ) < 0.9 ) return null;
		return new THREE.Vector3( x, gr.y, z );
	}

	placeFire( kind, pos, opts = {} ) {
		const f = new Campfire( this.game, this, kind, pos, opts );
		this.fires.push( f );
		return f;
	}

	removeFire( f ) {
		const i = this.fires.indexOf( f );
		if ( i >= 0 ) this.fires.splice( i, 1 );
		f.dispose();
	}

	fireSource() {
		return this.inv.find( ( s, d ) => ( d?.tool?.kind === 'lighter' || d?.tool?.kind === 'matches' ) && ( s.data.uses ?? d.tool.uses ?? 1 ) > 0 );
	}

	lightFire( f ) {
		const g = this.game;
		if ( f.fuel <= 0.01 ) { g.toast( 'Needs fuel', 'warn' ); return; }
		const src = g.mode === 'creative' ? null : this.fireSource();
		if ( ! src && g.mode !== 'creative' ) { g.toast( 'Need a lighter or matches', 'warn' ); return; }
		ensureItemSound( g.audio, 'strike' );
		g.actions.start( {
			label: 'Lighting fire', time: 2.5, sound: 'strike', cancelOnMove: true,
			onDone: () => {
				if ( src ) g.itemUse ? g.itemUse.useUp( src ) : ( src.data.uses = ( src.data.uses ?? getItem( src.id ).tool.uses ) - 1 );
				// wet weather: the flame fails sometimes, unless you have read the survival manual
				if ( ( g.weather?.rain || 0 ) > 0.5 && ! g.world.isIndoors?.( f.pos ) && ! g.itemUse?.knowledge?.survival && Math.random() < 0.35 ) { g.toast( 'Rain put it out', 'warn' ); return; }
				f.light();
			},
		} );
	}

	addFuel( stack ) {
		const g = this.game;
		const f = this.fires.filter( x => x.kind === 'campfire' ).sort( ( a, b ) => a.pos.distanceTo( g.player.pos ) - b.pos.distanceTo( g.player.pos ) )[ 0 ];
		const v = this.fuelValue( stack.id );
		if ( ! f || f.pos.distanceTo( g.player.pos ) > 3.5 || ! v ) { g.toast( 'No campfire here', 'warn' ); return; }
		g.actions.start( {
			label: 'Adding fuel', time: 1.5, sound: 'hit_wood', cancelOnMove: true,
			onDone: () => {
				if ( stack.qty <= 0 ) return;
				f.fuel = Math.min( MAX_FUEL, f.fuel + v );
				// wherever it is (a stack on the ground too); without the item-use module, from the inventory
				if ( g.itemUse ) g.itemUse.consumeOne( stack );
				else { stack.qty --; if ( stack.qty <= 0 ) this.inv.remove( stack ); this.inv.changed(); }
			},
		} );
	}

	provide( ray, maxDist ) {
		const g = this.game;
		if ( g.player.vehicle || ! this.fires.length ) return null;
		let best = null, bt = maxDist;
		const c = new THREE.Vector3();
		for ( const f of this.fires ) {
			if ( f.pos.distanceToSquared( ray.origin ) > 36 ) continue;
			c.copy( f.pos ); c.y += f.kind === 'stove' ? 0.07 : 0.15;
			const t = raySphere( ray.origin, ray.dir, c, f.kind === 'stove' ? 0.22 : 0.5, bt );
			if ( t !== null && t < bt ) { bt = t; best = f; }
		}
		if ( ! best ) return null;
		const f = best, inv = this.inv;
		const hrs = ( h ) => h >= 1 ? `${Math.round( h )} h` : `${Math.max( 5, Math.round( h * 60 / 5 ) * 5 )} min`;
		if ( f.kind === 'stove' ) return [ { t: bt, id: f.id, label: 'Pack up stove', hold: 0.6, action: () => this.packStove( f ) } ];
		const fuelItem = this.bestFuel();
		const addFuel = fuelItem ? { t: bt, id: f.id, label: `Add ${getItem( fuelItem.id ).name}`, sub: f.fuel > 0.01 ? `${hrs( f.fuel )} left` : null, action: () => this.addFuel( fuelItem ) } : null;
		if ( ! f.lit ) {
			if ( f.fuel > 0.01 ) return [ { t: bt, id: f.id, label: 'Light fire', sub: this.fireSource() || g.mode === 'creative' ? `${hrs( f.fuel )} of fuel` : 'Need a lighter or matches', action: () => this.lightFire( f ) } ];
			if ( addFuel ) return [ addFuel ];
			return [ { t: bt, id: f.id, label: 'Campfire', sub: 'Needs fuel', action: () => g.toast( 'Need sticks or firewood', 'info' ) } ];
		}
		// a fire running low takes fuel first; otherwise F (held) puts it out
		if ( addFuel && f.fuel < 1.5 ) return [ addFuel ];
		return [ { t: bt, id: f.id, label: 'Put out', sub: `${hrs( f.fuel )} left`, hold: 1.2, action: () => { f.putOut(); g.audio?.play( 'splash', { pos: f.pos, vol: 0.3, rate: 1.6 } ); } } ];
	}

	packStove( f ) {
		const g = this.game;
		const s = makeStack( 'camp_stove', 1 );
		if ( ! s ) return;
		s.data.uses = Math.max( 0, f.uses );
		s.cond = f.cond ?? 1;
		this.removeFire( f );
		if ( this.inv.add( s ) > 0 ) g.dropStack( s );
		this.inv.changed();
		g.audio?.play( 'pickup', { vol: 0.4 } );
	}

	update( dt ) {
		const g = this.game;
		let dh = g.time.hours - this.lastHours;
		this.lastHours = g.time.hours;
		if ( dh < 0 || dh > 24 * 30 ) dh = 0;
		for ( let i = this.fires.length - 1; i >= 0; i -- ) {
			const f = this.fires[ i ];
			f.update( dt, dh );
			// burnt-out fires crumble away after two days; spent stoves stay until packed
			if ( f.kind === 'campfire' && ! f.lit && f.deadSince !== null && g.time.hours - f.deadSince > 48 ) this.removeFire( f );
		}
	}

	serialize( save ) {
		save.world = save.world || {};
		save.world.campfires = this.fires.map( f => f.serialize() );
	}

	load( save ) {
		for ( const f of [ ...this.fires ] ) this.removeFire( f );
		for ( const e of save.world?.campfires || [] ) {
			if ( ! Array.isArray( e.p ) ) continue;
			this.placeFire( e.k || 'campfire', new THREE.Vector3( e.p[ 0 ], e.p[ 1 ], e.p[ 2 ] ), { yaw: e.y, lit: e.lit, fuel: e.fuel, uses: e.uses, cond: e.cond, born: e.born, deadSince: e.dead ?? null } );
		}
		this.lastHours = this.game.time.hours;
	}

	dispose() {
		this.offProvider?.();
		for ( const f of this.fires ) f.dispose();
		this.fires.length = 0;
		if ( this.game.nearFire ) this.game.nearFire = null;
	}
}

const TOOL_LABEL = { cut: 'blade', chop: 'axe', saw: 'saw', hammer: 'hammer', pot: 'cooking pot', toolbox: 'toolbox', canopener: 'can opener' };
const TOOL_NEED = { cut: 'a blade', chop: 'an axe or machete', saw: 'a saw', hammer: 'a hammer', pot: 'a cooking pot', toolbox: 'a toolbox', canopener: 'a can opener' };
