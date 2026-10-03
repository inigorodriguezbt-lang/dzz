// The gear domain at runtime (docs/ITEMS_PLAN.md "gear"): what the verbs share and a small system for what you wear.
//
//   attach( g )            once per game (hooks.js addSystem, when the items module starts, as the outdoors domain's): the
//                          gear system (game.register) — wet clothes, plastic bags that tear, a suitcase dragged along
//                          (slow, no sprinting, the wheels rattle), how much your clothes hide you (player.camo), and a
//                          net over your face keeping the mosquitoes off
//   openCase( g, stack )   a carried case or box opens like a container next to the inventory; the first time, what
//                          was packed in it is rolled (its def's `opens` table)
//   unlock( g, stack, how, use )   'pick' with a lockpick or 'force' with a pry tool
//   setLook( stack, dye )  dye a garment (data.look) and name it after the dye
import { getItem, displayName } from '../../ItemDB.js';
import { rollLoot } from '../../Loot.js';
import { capacityOf, itemsOf, containerWeight } from '../../../Inventory.js';
import { provides } from '../../util.js';
import { DYES, dyedName, WET_SHARE, DRY, wetOnEquip, wetOnRemove, FRAGILE, strain, RIP_AT, SUITCASE, DRAGGED, camoFactor, clamp, keyFits } from './logic.js';
import { attach as outdoorsAttach } from '../outdoors/runtime.js';

// ---- looks ------------------------------------------------------------------------------------------------------------

export function setLook( stack, dye ) {
	const def = getItem( stack.id );
	if ( ! dye || ! DYES[ dye ] ) { delete stack.data.look; delete stack.data.name; return; }
	stack.data.look = { dye };
	stack.data.name = dyedName( def, dye );
}

// ---- cases ------------------------------------------------------------------------------------------------------------

export const isCase = ( def ) => !! def?.container?.capacity && !! def.opens;
export const locked = ( stack, def = getItem( stack.id ) ) => !! def?.lock && ! stack.data.opened && ! stack.data.unlocked;

// what was packed in it, the first time it is opened
function unpackFirst( stack, def ) {
	if ( stack.data.opened ) return;
	stack.data.opened = true;
	const items = itemsOf( stack ), cap = capacityOf( stack );
	let vol = 0;
	// the biggest thing first (a pistol before its cleaning kit), then whatever still fits
	const rolled = rollLoot( def.opens ).sort( ( a, b ) => ( getItem( b.id )?.size || 1 ) - ( getItem( a.id )?.size || 1 ) );
	for ( const s of rolled ) {
		const v = ( getItem( s.id )?.size || 1 ) * ( getItem( s.id )?.stack > 1 ? 1 : s.qty );
		if ( vol + v > cap + 1e-6 ) continue;
		items.push( s );
		vol += v;
	}
}

export function openCase( g, stack ) {
	const def = getItem( stack.id );
	if ( locked( stack, def ) ) { g.toast( 'Locked', 'warn' ); return null; }
	unpackFirst( stack, def );
	const c = { key: 'gear:' + stack.uid, label: displayName( stack ), capacity: capacityOf( stack ), items: itemsOf( stack ), kind: 'bag', owner: stack };
	if ( g.player?.pos?.clone ) c.pos = g.player.pos.clone();
	g.player?.inventory?.changed?.();
	g.app?.ui?.openContainer?.( c );
	return c;
}

// a lockpick takes a while and keeps the lock; prying is quick, loud and bends the case; someone's keys are quiet and
// quick, if one of them fits
export function unlock( g, stack, how, use ) {
	const inv = g.player.inventory;
	if ( how === 'keys' ) {
		const keys = inv.find( ( s ) => s.id === 'lanyard_keys' );
		if ( ! keys ) { g.toast( 'No keys', 'warn' ); return false; }
		use.timed( 'Trying keys', 4, 'click', () => {
			if ( ! use.exists( stack ) ) return;
			( stack.data.tried ||= [] ).push( keys.uid );
			if ( ! keyFits( stack.uid, keys.uid ) ) { g.toast( 'No key fits', 'info' ); return; }
			stack.data.unlocked = true;
			g.toast( 'Unlocked', 'good' );
			openCase( g, stack );
		} );
		return true;
	}
	if ( how === 'pick' ) {
		const pick = inv.find( ( s ) => provides( s, 'lockpick' ) || getItem( s.id )?.tool?.kind === 'lockpick' );
		if ( ! pick ) { g.toast( 'Need a lockpick', 'warn' ); return false; }
		const lv = g.skills?.level?.( 'mechanics' ) || 0;
		use.timed( 'Picking lock', Math.max( 3, 9 - lv * 0.5 ), 'click', () => {
			if ( ! use.exists( stack ) ) return;
			stack.data.unlocked = true;
			use.wear( pick, 0.04 );
			g.skills?.xp?.( 'mechanics', 4 );
			g.toast( 'Unlocked', 'good' );
			openCase( g, stack );
		} );
		return true;
	}
	const bar = inv.find( ( s ) => provides( s, 'pry' ) ) || inv.find( ( s ) => provides( s, 'screwdriver' ) ) || inv.find( ( s ) => provides( s, 'cut' ) );
	if ( ! bar ) { g.toast( 'Need a crowbar or a blade', 'warn' ); return false; }
	use.timed( 'Forcing it open', provides( bar, 'pry' ) ? 3 : 5, 'hit_metal', () => {
		if ( ! use.exists( stack ) ) return;
		stack.data.unlocked = true;
		stack.cond = Math.max( 0.05, stack.cond - 0.35 );
		use.wear( bar, 0.02 );
		g.events?.emit?.( 'noise', { pos: g.player.pos.clone ? g.player.pos.clone() : { ...g.player.pos }, radius: 12, source: g.player, kind: 'pry' } );
		openCase( g, stack );
	} );
	return true;
}

// ---- the system ---------------------------------------------------------------------------------------------------------

const ATTACHED = new WeakMap();
export const system = ( g ) => ATTACHED.get( g ) || null;

export function attach( g ) {
	if ( ! g || typeof g.register !== 'function' ) return null;
	if ( ATTACHED.has( g ) ) return ATTACHED.get( g );
	const sys = new GearSystem( g );
	ATTACHED.set( g, sys );
	g.register( sys );
	sys.hook();
	return sys;
}

const NETS = new Set( [ 'beekeeper_veil', 'boonie_net' ] );

export class GearSystem {
	constructor( g ) {
		this.game = g;
		this.t = 0;
		this.lastH = g.time?.hours ?? 0;
		this.worn = {}; // slot -> the stack worn there last tick
		this.hp = g.survival?.health ?? 100;
		this.rollT = 0;
		this.hooked = false;
	}

	// the hooks: a suitcase in tow slows you (survival.addMoveMod); a net over the face is as good as repellent
	hook() {
		if ( this.hooked ) return;
		this.hooked = true;
		const g = this.game, S = g.survival;
		S?.addMoveMod?.( ( m ) => {
			const back = g.player?.inventory?.equip?.back;
			if ( back && DRAGGED.has( back.id ) && ! S.creative && g.mode !== 'creative' ) { m.speed *= SUITCASE.speed; m.canSprint = false; }
		} );
		// a net over your face keeps the mosquitoes off, by day and through a night out (the outdoors system's
		// protection hook; its attach is idempotent, whichever system starts first creates it)
		outdoorsAttach( g )?.addProtection?.( () => this.netOn() );
	}

	netOn() { return NETS.has( this.game.player?.inventory?.equip?.head?.id ); }

	update( dt ) {
		const g = this.game, S = g.survival, pl = g.player;
		if ( ! S || ! pl?.inventory || g.dead ) return;
		this.t += dt;
		this.rollT -= dt;
		// a suitcase rattles along behind you (creative: no noise, no wear)
		const back = pl.inventory.equip.back, creative = g.mode === 'creative';
		if ( back && DRAGGED.has( back.id ) && pl.moving && ! pl.vehicle && ! pl.swimming && ! creative && this.rollT <= 0 ) {
			this.rollT = SUITCASE.every;
			const pos = pl.pos.clone ? pl.pos.clone() : { ...pl.pos };
			g.events?.emit?.( 'noise', { pos, radius: SUITCASE.radius * ( pl.stance === 'crouch' ? 0.6 : 1 ), source: pl, kind: 'suitcase' } );
			rumble( g );
		}
		if ( this.t < 0.5 ) return;
		const step = this.t;
		this.t = 0;
		const h = g.time?.hours ?? 0, dh = clamp( h - this.lastH, 0, 2 );
		this.lastH = h;
		this._equipChanges();
		this._wet( dh );
		if ( ! creative ) this._bags( step );
		pl.camo = camoFactor( pl.inventory.equip, g.world?.sky?.night || 0 );
		this.hp = S.health;
	}

	// putting on a wet shirt soaks you; taking one off leaves you a little drier
	_equipChanges() {
		const g = this.game, S = g.survival, eq = g.player.inventory.equip;
		for ( const slot in WET_SHARE ) {
			const now = eq[ slot ] || null, was = this.worn[ slot ] || null;
			if ( now === was ) continue;
			if ( was && getItem( was.id )?.cat === 'clothing' ) {
				was.data.wet = Math.max( was.data.wet || 0, ( S.wet || 0 ) * ( 1 - Math.min( 0.9, getItem( was.id ).clothing.waterproof || 0 ) ) );
				if ( was.data.wet < 0.01 ) delete was.data.wet;
				S.wet = wetOnRemove( S.wet || 0, slot );
			}
			if ( now && ( now.data?.wet || 0 ) > 0.02 ) S.wet = Math.min( 1, wetOnEquip( S.wet || 0, now.data.wet, slot ) );
			this.worn[ slot ] = now;
		}
	}

	// worn clothes are as wet as you are; the rest dries: slowly in a bag, faster in the sun, fast by a fire
	_wet( dh ) {
		const g = this.game, S = g.survival, inv = g.player.inventory, eq = inv.equip;
		const body = S.wet || 0;
		for ( const slot in eq ) {
			const s = eq[ slot ], d = s && getItem( s.id );
			if ( d?.cat !== 'clothing' ) continue;
			const w = body * ( 1 - Math.min( 0.9, d.clothing.waterproof || 0 ) );
			if ( w < 0.01 ) { if ( s.data.wet ) delete s.data.wet; } else if ( Math.abs( ( s.data.wet || 0 ) - w ) > 0.02 ) s.data.wet = Math.round( w * 100 ) / 100;
		}
		if ( dh <= 0 ) return;
		const fire = !! g.nearFire?.( g.player.pos );
		const sky = g.world?.sky, sun = ! fire && ( sky?.sunDir?.y ?? 0 ) > 0.2 && ! g.world?.isIndoors?.( g.player.pos ) && ( g.weather?.rain || 0 ) < 0.1;
		const rate = fire ? DRY.fire : sun ? DRY.sun : DRY.carried;
		for ( const c of inv.containers() ) for ( const s of c.items ) {
			if ( ! s.data?.wet ) continue;
			s.data.wet = Math.max( 0, s.data.wet - rate * dh );
			if ( s.data.wet < 0.01 ) delete s.data.wet;
		}
	}

	// plastic tears: sprinting with a full bag, a heavy load, a hit
	_bags( step ) {
		const g = this.game, S = g.survival, pl = g.player, eq = pl.inventory.equip;
		const hit = this.hp - S.health > 3;
		for ( const slot of [ 'belt', 'back', 'vest' ] ) {
			const s = eq[ slot ], F = s && FRAGILE[ s.id ];
			if ( ! F ) continue;
			const kg = s.data.items ? containerWeight( s.data.items ) : 0;
			let loss = strain( s.id, kg, step, { sprinting: !! pl.sprinting, moving: !! pl.moving } );
			if ( hit ) loss += F.hit;
			if ( loss <= 0 ) continue;
			s.cond = Math.max( 0, s.cond - loss );
			if ( s.cond <= RIP_AT ) this.rip( s );
		}
	}

	// the bag gives way: what was in it falls at your feet
	rip( stack ) {
		const g = this.game, inv = g.player.inventory;
		const items = stack.data.items || [];
		stack.data.items = [];
		inv.remove( stack );
		for ( const s of items ) g.dropStack?.( s );
		g.toast( items.length ? 'Bag ripped, things fell' : 'Bag ripped', 'warn' );
		g.audio?.play?.( 'tear', { vol: 0.6 } );
		inv.changed();
	}
}

// ---- a suitcase's wheels on the road --------------------------------------------------------------------------------

function rumble( g ) {
	const a = g.audio;
	if ( ! a?.ctx || ! a.buffers ) return;
	if ( ! a.buffers.has( 'gear_wheels' ) ) {
		const sr = a.ctx.sampleRate, n = Math.floor( sr * 1.4 ), d = new Float32Array( n );
		let s = 7, lp = 0;
		const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( ( s >>> 0 ) / 4294967296 ) * 2 - 1; };
		for ( let i = 0; i < n; i ++ ) {
			lp += ( r() - lp ) * 0.08; // a low grind
			const t = i / sr, click = ( t * 9 ) % 1 < 0.012 ? r() * 0.8 : 0; // the seams of the pavement
			d[ i ] = ( lp * 1.6 + click ) * Math.min( 1, t * 8, ( 1.4 - t ) * 6 ) * 0.5;
		}
		const buf = a.ctx.createBuffer( 1, n, sr );
		buf.copyToChannel( d, 0 );
		a.buffers.set( 'gear_wheels', buf );
	}
	a.play?.( 'gear_wheels', { vol: 0.35, pos: g.player.pos, max: 30 } );
}
