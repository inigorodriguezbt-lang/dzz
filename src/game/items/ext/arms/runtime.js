// The arms domain's runtime (Node-safe with three.js, no DOM): what the verbs and combos in defs/ext/arms.js call.
//   attach( game )            once per game (hooks.js addSystem, when the items module starts): the riot shield's
//                              block (survival.addHurtGuard) and its weight on your step (survival.addMoveMod)
//   shoot( game, slingshot )  a steel ball or a stone off the slingshot, through the weapons module's Throwables
//   throwThing( game, stack, how )   an alarm clock set to ring or a radio left playing, thrown (it lands and keeps on,
//                              a placed `noise` thing)
//   horn( game, stack, def )   an air horn's blast or a party horn
//   tapeOn( ctx, slot, id )    a flashlight or a knife taped onto a gun (a combo's run); untape( use, stack )
//   guardsOn( ctx ) / guardsOff( use, garment )   arm guards over the sleeves of a top (bite protection)
//   takeApart( use, stack, def )   a lashed spear back into its blade and its pole
import * as THREE from 'three';
import { getItem, makeStack } from '../../ItemDB.js';
import { provides } from '../../util.js';
import { SLING, SHIELD, inFront, HORN, GUARDS, THROWN_ALARM } from './logic.js';
import { playArmsSound } from './sounds.js';

const ATTACHED = new WeakMap();
const _v = new THREE.Vector3();
const now = () => ( globalThis.performance?.now?.() ?? Date.now() ) / 1000;

export function attach( g ) {
	if ( ! g?.survival || ATTACHED.has( g ) ) return ATTACHED.get( g ) || null;
	const S = g.survival, st = { lastShot: - 1e9, blocks: 0 };
	ATTACHED.set( g, st );
	S.addHurtGuard?.( ( amount, kind = 'melee', info = {} ) => {
		if ( ! shieldBlocks( g, kind, info ) ) return false;
		st.blocks ++;
		return true;
	} );
	S.addMoveMod?.( ( m ) => { if ( shieldHeld( g ) && ! S.creative ) m.speed *= SHIELD.slow; } );
	return st;
}

export const state = ( g ) => ATTACHED.get( g ) || null;

// ---- the riot shield ---------------------------------------------------------------------------------------------------

export function shieldHeld( g ) {
	const s = g?.player?.inventory?.heldStack?.();
	const d = s && getItem( s.id );
	return d?.melee?.block && s.cond > 0 ? s : null;
}

// a bite or a blow from the front lands on the shield instead: stamina and a little wear, and the attacker is pushed off
export function shieldBlocks( g, kind, info ) {
	if ( ! SHIELD.kinds.includes( kind ) || ! info?.dir ) return false;
	const s = shieldHeld( g );
	if ( ! s ) return false;
	// mid-shove the shield is out of line
	if ( g.hands?.act?.type === 'melee' ) return false;
	const look = g.player.lookDir?.( _v );
	if ( ! look || ! inFront( info.dir, look ) ) return false;
	const S = g.survival;
	if ( ! S.creative && ( S.stamina ?? 100 ) < SHIELD.minStamina ) return false;
	S.useStamina?.( SHIELD.stamina );
	if ( g.mode !== 'creative' ) s.cond = Math.max( 0, s.cond - SHIELD.wear );
	if ( s.cond <= 0 ) g.toast?.( 'Riot shield broke', 'bad' );
	playArmsSound( g, 'arms_block', { vol: 0.8 } );
	g.player.shake = Math.max( g.player.shake || 0, 0.15 );
	info.source?.stagger?.( info.dir.clone().negate(), 0.6 );
	g.player.inventory.changed?.();
	return true;
}

// ---- the slingshot -------------------------------------------------------------------------------------------------------

export function slingAmmo( inv ) {
	for ( const id of SLING.order ) { const s = inv.find( ( x ) => x.id === id && x.qty > 0 ); if ( s ) return s; }
	return null;
}
export const slingCount = ( inv ) => SLING.order.reduce( ( n, id ) => n + ( inv.count?.( id ) || 0 ), 0 );

export function shoot( g, sling ) {
	const st = attach( g ) || { lastShot: - 1e9 };
	const inv = g.player.inventory, U = g.itemUse;
	if ( now() - st.lastShot < SLING.cooldown ) return false;
	if ( g.player.swimming ) { g.toast?.( 'Not in the water', 'warn' ); return false; }
	if ( sling.cond <= 0 ) { g.toast?.( 'Slingshot broken', 'bad' ); return false; }
	const ammo = slingAmmo( inv );
	if ( ! ammo ) { g.toast?.( 'No shot', 'warn' ); return false; }
	st.lastShot = now();
	const id = ammo.id, def = getItem( id );
	if ( U?.consumeOne ) U.consumeOne( ammo ); else { ammo.qty --; if ( ammo.qty <= 0 ) inv.remove( ammo ); }
	const dir = g.player.lookDir( new THREE.Vector3() );
	dir.y += 0.012; dir.normalize(); // a hair high: the shot drops over 20 m
	const origin = g.camera.position.clone().addScaledVector( dir, 0.4 );
	origin.y -= 0.04;
	g.throwables?.launch?.( { id, name: def.name, cat: 'throwable', throwable: { kind: 'arms_shot' }, model: def.model }, { origin, vel: dir.multiplyScalar( SLING.speed ), source: g.player } );
	playArmsSound( g, 'arms_sling', { vol: 0.6 } );
	g.events?.emit?.( 'noise', { pos: g.player.pos.clone(), radius: SLING.noise, source: g.player, kind: 'sling' } );
	if ( g.mode !== 'creative' ) sling.cond = Math.max( 0, sling.cond - SLING.wear );
	inv.changed?.();
	return true;
}

// ---- thrown noise makers ---------------------------------------------------------------------------------------------------

export function throwThing( g, stack, how ) {
	const U = g.itemUse, d = getItem( stack.id ), P = g.player;
	if ( ! g.throwables?.launch || ! d ) return false;
	if ( P.swimming ) { g.toast?.( 'Not in the water', 'warn' ); return false; }
	if ( how === 'radio' && ! ( stack.data?.charge > 0 ) && g.mode !== 'creative' ) { g.toast?.( 'Batteries dead', 'warn' ); return false; }
	const one = U?.splitOne ? U.splitOne( stack ) : stack;
	if ( U?.discard ) U.discard( one ); else P.inventory.remove( one );
	const dir = P.lookDir( new THREE.Vector3() );
	dir.y += 0.18; dir.normalize();
	const cam = g.camera;
	const right = new THREE.Vector3( 1, 0, 0 ).applyQuaternion( cam.quaternion );
	const origin = cam.position.clone().addScaledVector( right, 0.2 ).addScaledVector( dir, 0.35 );
	origin.y -= 0.1;
	const vel = dir.multiplyScalar( THROWN_ALARM.speed );
	if ( P.vel ) vel.addScaledVector( P.vel, 0.8 );
	const o = g.throwables.launch( { id: d.id, name: d.name, cat: 'throwable', throwable: { kind: 'arms_item' }, model: d.model }, { origin, vel, source: P } );
	if ( o ) { o.stack = one; o.place = how === 'alarm' ? { left: THROWN_ALARM.delay, ring: 0, pulse: 0 } : { on: true, pulse: 0 }; }
	g.audio?.play?.( 'swing', { vol: 0.5, rate: 1.2 } );
	P.inventory.changed?.();
	return true;
}

// ---- horns -------------------------------------------------------------------------------------------------------------

export function horn( g, stack, def ) {
	const H = HORN[ def.id ];
	if ( ! H ) return false;
	playArmsSound( g, H.sound, { vol: 1 } );
	g.events?.emit?.( 'noise', { pos: g.player.pos.clone(), radius: H.radius, source: g.player, kind: 'horn' } );
	const U = g.itemUse;
	if ( def.tool?.uses ) U?.useUp?.( stack, 1 );
	if ( def.fun ) U?.applyFun?.( def, 1, { repeat: 90 } );
	return true;
}

// ---- taped onto a gun ----------------------------------------------------------------------------------------------------

// one turn of the tape you carry (a combo's tools: [ 'tape' ] only checks for it)
export function useTape( c, n = 1 ) {
	const t = c.inv.find( ( s ) => provides( s, 'tape' ) && s !== c.a && s !== c.b );
	if ( t && c.use?.useUp ) c.use.useUp( t, n );
	return !! t;
}

// slot 'light': the flashlight (side a, used up) keeps its charge; slot 'bayonet': the knife keeps its condition
export function tapeOn( c, slot, id ) {
	const att = makeStack( id, 1 );
	att.cond = c.a.cond;
	att.data.from = c.a.id;
	if ( slot === 'light' ) {
		const cap = c.A.tool?.battery || 8, mine = getItem( id ).tool?.battery || 8;
		att.data.charge = Math.min( mine, ( c.a.data?.charge ?? cap ) / cap * mine );
		att.data.on = false;
	}
	c.b.data.att ||= {};
	c.b.data.att[ slot ] = att;
	useTape( c );
	return att;
}

// back to the flashlight or the knife it was made from
export function untape( use, stack ) {
	const d = getItem( stack.id ), from = stack.data?.from && getItem( stack.data.from ) ? stack.data.from : d.attachment?.slot === 'light' ? 'flashlight' : 'kitchen_knife';
	use.timed( 'Untaping', 3, 'tear', () => {
		if ( ! use.exists( stack ) ) return;
		const data = {};
		if ( d.tool?.battery ) data.charge = ( stack.data.charge ?? 0 ) / d.tool.battery * ( getItem( from ).tool?.battery || d.tool.battery );
		use.transform( stack, from, data );
	} );
}

// ---- arm guards ------------------------------------------------------------------------------------------------------------

export function guardsOn( c ) {
	const add = GUARDS[ c.a.id ] || 0, g = c.b;
	const mods = g.data.mods ||= {};
	mods.bite = ( mods.bite || 0 ) + add;
	g.data.guards = { id: c.a.id, cond: c.a.cond };
}

export function guardsOff( use, garment ) {
	const G = garment.data?.guards;
	if ( ! G ) return;
	use.timed( 'Taking off guards', 3, 'tear', () => {
		if ( ! garment.data.guards ) return;
		const mods = garment.data.mods || {};
		mods.bite = ( mods.bite || 0 ) - ( GUARDS[ G.id ] || 0 );
		if ( mods.bite <= 1e-6 ) delete mods.bite;
		delete garment.data.guards;
		use.give( G.id, 1, { cond: G.cond ?? 1 } );
	} );
}

// ---- lashed spears -----------------------------------------------------------------------------------------------------------

export function takeApart( use, stack, def ) {
	const blade = def.id === 'machete_spear' ? 'machete' : stack.data?.knife && getItem( stack.data.knife ) ? stack.data.knife : 'kitchen_knife';
	use.timed( 'Untaping', 5, 'tear', () => {
		if ( ! use.exists( stack ) ) return;
		const cond = stack.cond;
		use.discard( stack );
		use.give( blade, 1, { cond } );
		use.give( 'long_stick', 1 );
	} );
}
