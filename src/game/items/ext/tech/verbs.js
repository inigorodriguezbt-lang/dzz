// Right-click verbs for the tech items (hooks.js addUseActions): the generic "Dismantle" for any def with a
// `dismantle` list (docs/ITEMS_PLAN.md), cells in and out of devices, and what each device does — a police scanner
// and a CB radio mark places on the map (game.sites.reveal), a metal detector finds buried stashes and junk, a magnet
// on a rope drags metal out of the water, a camera's flash makes the infected flinch, a drone scouts, chargers move
// charge about, jumper cables and a siphon hose work on vehicles (game.vehicles: v.fuel, v.needs, v.touch()), and a
// lockbox opens with bolt cutters, a drill, a crowbar or a lockpick.
// Node-safe (three.js only for vectors).
import * as THREE from 'three';
import { addUseActions } from '../../hooks.js';
import { getItem } from '../../ItemDB.js';
import { ItemUse } from '../../ItemUse.js';
import { rollLoot } from '../../Loot.js';
import { provides } from '../../util.js';
import { KINDS as SITE_KINDS } from '../../sites/kinds.js';
import { addFishingMod } from '../../Fishing.js';
import { ensureSound as ensurePlaceSound } from '../../placeables/sounds.js';
import * as L from './logic.js';
import { ensureTechSound, playTechSound } from './sounds.js';
import { chargeTargets, chargeLabel, feed, fuelCan, fuelIn, fuelRoom, takeFuel, putFuel, genFuel } from './power.js';

const TOOL_NAME = { screwdriver: 'a screwdriver', pliers: 'pliers', wrench: 'a wrench', hacksaw: 'a hacksaw', boltcutter: 'bolt cutters', solder: 'a soldering iron',
	weld: 'a blowtorch', drill: 'a drill', glue: 'glue', cut: 'a blade', pry: 'a crowbar', dig: 'a shovel', hammer: 'a hammer', saw: 'a saw' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();

// ---- small shared helpers -----------------------------------------------------------------------------------------------

// skip: the thing being worked on (a cordless drill is a screwdriver, but not for taking itself apart)
export const missingTool = ( inv, kinds, skip = null ) => ( kinds || [] ).find( ( k ) => ! inv.find( ( s ) => s !== skip && provides( s, k ) ) ) || null;
const toolFor = ( inv, kind, skip = null ) => inv.find( ( s ) => s !== skip && provides( s, kind ) );

// new things into the bag (the HUD's pickup row when the screen is closed), else at your feet
export function giveItem( g, id, n = 1, data = null ) {
	if ( ! getItem( id ) || ! ( n > 0 ) ) return [];
	if ( g.combine?.give ) return g.combine.give( id, n, data );
	g.itemUse?.give?.( id, n );
	return [];
}
// a whole stack (rolled loot keeps its condition, magazines, contents)
function giveStack( g, s ) {
	const inv = g.player.inventory;
	const left = inv.add( s );
	if ( left > 0 ) { s.qty = left; g.dropStack?.( s ); }
	inv.changed();
	g.app?.ui?.hud?.pickup?.( { id: s.id, qty: s.qty, data: s.data || {} } );
}

const drain = ( g, s, h ) => { if ( g.mode !== 'creative' ) s.data.charge = Math.max( 0, L.chargeOf( s ) - h ); };
const needCharge = ( g, s, h ) => g.mode === 'creative' || L.chargeOf( s ) >= h;
const noise = ( g, pos, radius, kind ) => g.events?.emit?.( 'noise', { pos: pos.clone(), radius, source: g.player, kind } );
const timed = ( U, label, time, sound, done, opts ) => {
	if ( sound ) ensureTechSound( U.game.audio, sound );
	return U.timed( label, time, sound, done, opts );
};
const names = ( list ) => list.slice( 0, 3 ).map( ( [ id, n ] ) => ( n > 1 ? `${n}× ` : '' ) + getItem( id ).name ).join( ', ' ) + ( list.length > 3 ? '…' : '' );
const away = ( p, s ) => ` · ${L.fmtDist( Math.hypot( s.x - p.x, s.z - p.z ) )} ${L.cardinal( s.x - p.x, s.z - p.z )}`;

// ---- dismantling ----------------------------------------------------------------------------------------------------------

// how good the tool in hand is for the job: precision drivers on electronics, a power drill on anything
function qualityFor( inv, def, skip = null ) {
	let q = 1;
	if ( L.dismantleSkill( def ) === 'electrical' && inv.find( ( s, d ) => s !== skip && d?.tool?.kind === 'screwdriver' && d.tool.quality > 1 && s.cond > 0 ) ) q = 1.5;
	if ( ( def.dismantleTools || [] ).includes( 'screwdriver' ) && inv.find( ( s, d ) => s !== skip && d?.id === 'cordless_drill' && L.chargeOf( s, d ) > 0.05 ) ) q = Math.max( q, 1.25 );
	// a meter on the board tells live parts from dead ones
	if ( L.dismantleSkill( def ) === 'electrical' && inv.find( ( s, d ) => s !== skip && d?.tool?.kind === 'multimeter' && L.chargeOf( s, d ) > 0.05 ) ) q = Math.max( q, 1.3 );
	return q;
}

export function dismantle( g, stack, def ) {
	const U = g.itemUse, inv = g.player.inventory;
	const miss = missingTool( inv, def.dismantleTools, stack );
	if ( miss ) { g.toast( `Need ${TOOL_NAME[ miss ] || miss}`, 'warn' ); return false; }
	if ( stack.data?.items?.length ) { g.toast( 'Empty it first', 'warn' ); return false; }
	const skill = L.dismantleSkill( def ), lv = g.skills?.level?.( skill ) || 0, q = qualityFor( inv, def, stack );
	const tools = ( def.dismantleTools || [] ).map( ( k ) => toolFor( inv, k, stack ) ).filter( Boolean );
	// one unit comes off the stack when it's done (a cancelled job leaves the stack whole)
	timed( U, `Dismantling ${def.name}`, L.dismantleTime( def, lv, q ), 'craft', () => {
		if ( ! U.exists( stack ) || missingTool( inv, def.dismantleTools, stack ) ) return;
		const parts = L.dismantleYield( def, stack, { level: lv, quality: q } );
		U.consumeOne( stack );
		for ( const [ id, n ] of parts ) giveItem( g, id, n );
		for ( const t of tools ) U.wear( t, 0.008 );
		g.skills?.xp?.( skill, 3 + Math.min( 10, parts.reduce( ( a, [ , n ] ) => a + n, 0 ) * 1.5 ) );
		g.toast( parts.length ? names( parts ) : 'Nothing usable', parts.length ? 'good' : 'info' );
	} );
	return true;
}

// ---- cells ------------------------------------------------------------------------------------------------------------------

// the emptiest device you carry that takes a cell size
function lowestFor( inv, cell ) {
	const list = inv.findAll( ( s, d ) => L.cellOf( d ) === cell && L.fracOf( s, d ) < 0.95 );
	list.sort( ( a, b ) => L.fracOf( a ) - L.fracOf( b ) );
	return list[ 0 ] || null;
}

// The core's AA verbs (ItemUse: "Replace batteries", a loose AA's "Insert into X") offer AA cells to every battery
// device, though a D or 9 V device takes none and a phone, power bank, drone or sat phone only charges (combos.js
// already reads tool.cell). Until ItemUse reads it too, keep those verbs to AA devices: the menu entry is left out,
// "Insert into" picks the emptiest AA device, and a stray call is refused. Applied once, on the class.
export function guardCells( IU ) {
	const P = IU?.prototype;
	if ( ! P || P._techCells || typeof P._toolActions !== 'function' ) return false;
	P._techCells = true;
	const tools = P._toolActions, lowest = P.lowestDevice, replace = P.replaceBatteries;
	P._toolActions = function ( stack, d, add ) {
		const aa = L.cellOf( d ) === 'aa';
		return tools.call( this, stack, d, ( verb, run, notes ) => { if ( verb !== 'Replace batteries' || aa ) add( verb, run, notes ); } );
	};
	if ( typeof lowest === 'function' ) P.lowestDevice = function ( rechargeableOnly = false ) {
		if ( rechargeableOnly ) return lowest.call( this, true );
		const list = this.inv.findAll( ( s, d ) => L.cellOf( d ) === 'aa' && L.fracOf( s, d ) < 0.95 );
		list.sort( ( a, b ) => L.fracOf( a ) - L.fracOf( b ) );
		return list[ 0 ] || null;
	};
	if ( typeof replace === 'function' ) P.replaceBatteries = function ( dev ) {
		const c = L.cellOf( getItem( dev?.id ) );
		if ( c !== 'aa' ) { this.game.toast( L.CELL_NAME[ c ] ? `Takes ${L.CELL_NAME[ c ]} batteries` : 'Charge it instead', 'warn' ); return; }
		return replace.call( this, dev );
	};
	return true;
}
guardCells( ItemUse );

// a fresh cell into a device: full charge, one cell gone
export function insertCell( g, cellStack, dev ) {
	const U = g.itemUse, d = getItem( dev.id );
	timed( U, 'Replacing batteries', 3, 'click', () => {
		if ( ! U.exists( cellStack ) || ! U.exists( dev ) ) return;
		dev.data.charge = d.tool.battery;
		U.consumeOne( cellStack );
		g.skills?.xp?.( 'electrical', 1 );
	} );
}

// ---- radios: a scan marks a place on the map --------------------------------------------------------------------------

const keyOf = ( s ) => s.key || `${s.kind}:${Math.round( s.x )}:${Math.round( s.z )}`;

// the next broadcast worth hearing: a weighted channel, the nearest site of its kind you have not heard of yet
export function findBroadcast( g, stack, list ) {
	const S = g.sites, p = g.player.pos;
	if ( ! S?.find ) return null;
	const heard = stack.data.heard || [], boost = stack.data.antenna ? 1.6 : 1;
	const t0 = Date.now();
	for ( const [ kind, , R ] of L.channelOrder( list ) ) {
		if ( Date.now() - t0 > 700 ) break;
		const maxR = R * boost;
		let s = S.find( kind, p, maxR );
		if ( s && heard.includes( keyOf( s ) ) ) {
			// that one you know: listen out the other way
			const a = Math.random() * Math.PI * 2;
			const c = S.find( kind, { x: p.x + Math.cos( a ) * maxR * 0.55, z: p.z + Math.sin( a ) * maxR * 0.55 }, maxR * 0.5 );
			s = c && ! heard.includes( keyOf( c ) ) && Math.hypot( c.x - p.x, c.z - p.z ) <= maxR ? c : null;
		}
		if ( s ) return { kind, s };
	}
	return null;
}

function listen( g, stack, def, list, verb ) {
	const U = g.itemUse;
	if ( ! needCharge( g, stack, 0.15 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
	timed( U, verb, 6, 'tech_static', () => {
		if ( ! U.exists( stack ) ) return;
		drain( g, stack, 0.3 );
		const hit = findBroadcast( g, stack, list );
		if ( ! hit ) { g.toast( 'Only static', 'info' ); return; }
		g.sites.reveal( hit.kind, { x: hit.s.x, z: hit.s.z }, 4 );
		stack.data.heard = [ ...( stack.data.heard || [] ), keyOf( hit.s ) ].slice( - 16 );
		g.skills?.xp?.( 'electrical', 2 );
		g.toast( ( SITE_KINDS[ hit.kind ]?.label || hit.kind ) + away( g.player.pos, hit.s ), 'good' );
	}, { cancelOnMove: false } );
}

// ---- metal detector ------------------------------------------------------------------------------------------------------

function sweep( g, stack ) {
	const U = g.itemUse;
	if ( ! needCharge( g, stack, 0.05 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
	timed( U, 'Sweeping', 3.5, 'tech_beep', () => {
		if ( ! U.exists( stack ) ) return;
		drain( g, stack, 0.05 );
		const p = g.player.pos;
		const s = g.sites?.find?.( 'stash', p, L.DETECT_R ) || null;
		const dist = s ? Math.hypot( s.x - p.x, s.z - p.z ) : null;
		const r = L.detectorReading( dist );
		if ( r === 'here' ) {
			g.sites.reveal( 'stash', { x: s.x, z: s.z }, 3 );
			playTechSound( g, 'tech_beep', { vol: 0.7, rate: 1.4 } );
			g.toast( 'Strong signal. Dig here', 'good' );
			return;
		}
		if ( r === 'near' ) { g.toast( 'Signal' + away( p, s ), 'info' ); return; }
		// loose metal in the sand or the soil
		const key = L.sweepCell( p.x, p.z ), hour = g.time.hours;
		if ( L.swept( stack.data.swept, key, hour ) ) { g.toast( 'Nothing here', 'info' ); return; }
		const beach = !! g.world?.isBeach?.( p.x, p.z );
		if ( Math.random() >= L.junkChance( beach, g.skills?.level?.( 'foraging' ) || 0 ) ) { stack.data.swept = L.markSwept( stack.data.swept, key, hour ); g.toast( 'Nothing here', 'info' ); return; }
		const spade = U.findKind( 'dig' );
		if ( ! beach && ! spade ) { g.toast( 'Signal. Need a shovel', 'info' ); return; }
		timed( U, 'Digging', beach && ! spade ? 5 : 3.5, null, () => {
			stack.data.swept = L.markSwept( stack.data.swept, key, g.time.hours );
			noise( g, g.player.pos, 8, 'dig' );
			if ( spade ) U.wear( spade, 0.005 );
			const found = rollLoot( 'tech_detect', Math.random, 1 );
			for ( const f of found ) giveStack( g, f );
			g.skills?.xp?.( 'foraging', 2 );
			if ( ! found.length ) g.toast( 'Just a bottle cap', 'info' );
		} );
	} );
}

// ---- magnet fishing --------------------------------------------------------------------------------------------------------

// open water within a throw ahead (from a pier, a harbour wall, the shore)
export function waterAhead( g ) {
	const P = g.player, ph = g.physics;
	if ( ! ph?.waterLevel || ! g.hf?.heightAt ) return null;
	const fx = - Math.sin( P.yaw ), fz = - Math.cos( P.yaw );
	for ( const d of [ 3, 5, 7, 9, 12 ] ) {
		const x = P.pos.x + fx * d, z = P.pos.z + fz * d;
		const lvl = ph.waterLevel( x, z );
		if ( lvl - g.hf.heightAt( x, z ) > 0.6 && lvl < P.pos.y + 1 ) return { x, z, y: lvl };
	}
	return null;
}

function magnetFish( g, stack ) {
	const U = g.itemUse;
	const spot = waterAhead( g );
	if ( ! spot ) { g.toast( 'Face open water', 'warn' ); return; }
	timed( U, 'Magnet fishing', 9, 'cast', () => {
		if ( ! U.exists( stack ) ) return;
		g.audio?.play?.( 'splash', { pos: _v.set( spot.x, spot.y, spot.z ), vol: 0.5 } );
		U.wear( stack, 0.015 );
		const key = L.sweepCell( spot.x, spot.z, 20 );
		if ( L.swept( stack.data.fished, key, g.time.hours, 48 ) || Math.random() > 0.7 ) { stack.data.fished = L.markSwept( stack.data.fished, key, g.time.hours ); g.toast( 'Nothing stuck', 'info' ); return; }
		stack.data.fished = L.markSwept( stack.data.fished, key, g.time.hours );
		for ( const f of rollLoot( 'tech_magnet', Math.random, 1 ) ) {
			// a week underwater: it comes up rusty
			f.cond = Math.min( f.cond, 0.25 + Math.random() * 0.35 );
			giveStack( g, f );
		}
		g.skills?.xp?.( 'fishing', 2 );
	} );
}

// ---- camera flash ------------------------------------------------------------------------------------------------------------

export function flash( g, stack ) {
	if ( ! needCharge( g, stack, 0.03 ) ) { g.toast( 'Batteries dead', 'warn' ); return 0; }
	drain( g, stack, 0.03 );
	playTechSound( g, 'tech_flash', { vol: 0.7 } );
	const P = g.player, eye = _v.set( P.pos.x, P.pos.y + ( P.stanceH || 1.6 ), P.pos.z );
	const fwd = P.lookDir ? P.lookDir( _f ) : _f.set( - Math.sin( P.yaw ), 0, - Math.cos( P.yaw ) );
	g.fx?.light?.( eye.clone().addScaledVector( fwd, 0.5 ), 0xf4f6ff, 900, 16, 0.12 );
	let n = 0;
	for ( const e of g.entities?.near?.( P.pos, 9, 'zombie', [] ) || [] ) {
		if ( ! e.alive ) continue;
		const head = _w.set( e.pos.x, e.pos.y + ( e.height || 1.7 ) * 0.9, e.pos.z );
		const to = head.clone().sub( eye );
		const d = to.length();
		if ( d < 0.1 || to.divideScalar( d ).dot( fwd ) < 0.55 ) continue;
		if ( g.physics?.lineOfSight && ! g.physics.lineOfSight( eye, head ) ) continue;
		// dazzled: the swing is lost and it reels back (Zombie.stagger also delays its next attack)
		e.stagger?.( to.setY( 0 ), 0.75 );
		n ++;
	}
	noise( g, P.pos, 10, 'click' );
	return n;
}

// ---- drone ---------------------------------------------------------------------------------------------------------------------

function fly( g, stack ) {
	const U = g.itemUse, P = g.player;
	if ( g.world?.isIndoors?.( P.pos ) ) { g.toast( 'Go outside', 'warn' ); return; }
	if ( ! needCharge( g, stack, 0.3 ) ) { g.toast( 'Battery low', 'warn' ); return; }
	timed( U, 'Flying drone', 10, 'tech_drone', () => {
		if ( ! U.exists( stack ) ) return;
		drain( g, stack, 0.3 );
		const p = P.pos;
		const sites = ( g.sites?.near?.( p, 450 ) || [] ).filter( ( s ) => s.kind !== 'stash' && SITE_KINDS[ s.kind ] )
			.sort( ( a, b ) => Math.hypot( a.x - p.x, a.z - p.z ) - Math.hypot( b.x - p.x, b.z - p.z ) ).slice( 0, 4 );
		for ( const s of sites ) g.sites.reveal( s.kind, { x: s.x, z: s.z }, 4 );
		const z = ( g.entities?.near?.( p, 150, 'zombie', [] ) || [] ).filter( ( e ) => e.alive ).length;
		// the buzz overhead, out ahead of you, draws them that way
		const fx = - Math.sin( P.yaw ), fz = - Math.cos( P.yaw );
		g.events?.emit?.( 'noise', { pos: _v.set( p.x + fx * 60, p.y, p.z + fz * 60 ).clone(), radius: 35, source: P, kind: 'drone' } );
		g.skills?.xp?.( 'electrical', 3 );
		g.toast( `${sites.length ? sites.length + ' marked' : 'Nothing found'} · ${z} infected near`, 'good' );
	} );
}

// ---- vehicles (through game.vehicles: the list, v.fuel, v.needs, v.touch) -------------------------------------------------

export function nearVehicle( g, r, pred ) {
	const p = g.player.pos;
	let best = null, bd = r;
	for ( const v of g.vehicles?.list || [] ) {
		if ( v.removed || v.burnt || v === g.vehicles.driving ) continue;
		const d = Math.hypot( v.pos.x - p.x, v.pos.z - p.z ) - ( v.radius || 2 ) * 0.6;
		if ( d < bd && pred( v ) ) { bd = d; best = v; }
	}
	return best;
}

function siphon( g, hose, v ) {
	const U = g.itemUse, inv = g.player.inventory;
	const can = inv.findAll( ( s ) => fuelRoom( s ) > 0.1 ).sort( ( a, b ) => fuelRoom( b ) - fuelRoom( a ) )[ 0 ];
	if ( ! can ) { g.toast( 'Need a fuel can or bottle', 'warn' ); return; }
	const want = Math.min( v.fuel - 0.05, fuelRoom( can ), 20 );
	timed( U, 'Siphoning', L.clamp( want / 0.8, 3, 18 ), 'tech_siphon', () => {
		if ( ! U.exists( can ) || v.removed ) return;
		const got = putFuel( can, Math.max( 0, Math.min( v.fuel - 0.05, 20 ) ) );
		v.fuel = Math.max( 0, v.fuel - got );
		v.touch?.();
		U.wear( hose, 0.01 );
		g.skills?.xp?.( 'mechanics', 3 );
		// getting the flow going the old way: a mouthful now and then
		if ( ( g.skills?.level?.( 'mechanics' ) || 0 ) < 3 && Math.random() < 0.2 && g.survival ) { g.survival.sick = Math.min( 1, ( g.survival.sick || 0 ) + 0.3 ); g.toast( 'Swallowed some gas', 'warn' ); }
		g.toast( `+${got.toFixed( 1 )} L fuel`, 'good' );
	} );
}

const carBattery = ( inv, min = 0 ) => inv.findAll( ( s ) => s.id === 'car_battery' ).sort( ( a, b ) => L.carEnergy( b ) - L.carEnergy( a ) ).find( ( s ) => L.carEnergy( s ) >= min ) || null;

function jumpStart( g, v, bat ) {
	const U = g.itemUse;
	timed( U, 'Jump-starting', 6, 'click', () => {
		if ( v.removed || ! U.exists( bat ) || L.carEnergy( bat ) < 0.2 ) return;
		delete v.needs.battery;
		v.touch?.();
		bat.data.energy = Math.max( 0, L.carEnergy( bat ) - 0.2 );
		g.audio?.play?.( 'switch_mode', { pos: v.pos, vol: 0.5 } );
		g.skills?.xp?.( 'mechanics', 6 );
		g.toast( `${v.name || 'Vehicle'}: battery charged`, 'good' );
	} );
}

function chargeFromCar( g, v, bat ) {
	const U = g.itemUse;
	timed( U, 'Charging battery', 15, 'click', () => {
		if ( v.removed || ! U.exists( bat ) || ! v.engine?.running ) return;
		bat.data.energy = Math.min( 1, L.carEnergy( bat ) + 0.5 );
		g.skills?.xp?.( 'electrical', 3 );
		g.toast( `Car battery ${Math.round( bat.data.energy * 100 )}%`, 'good' );
	} );
}

// ---- lockbox ------------------------------------------------------------------------------------------------------------

// the ways you can open one with what you carry: [ [ method, tool stack ] ]
export function lockMethods( inv ) {
	const out = [];
	const cut = toolFor( inv, 'boltcutter' ); if ( cut ) out.push( [ 'cut', cut ] );
	const drill = inv.find( ( s, d ) => provides( s, 'drill' ) && ( ! d.tool?.battery || L.chargeOf( s, d ) > 0.1 ) ); if ( drill ) out.push( [ 'drill', drill ] );
	const pry = toolFor( inv, 'pry' ); if ( pry ) out.push( [ 'pry', pry ] );
	const pick = inv.find( ( s ) => s.id === 'lockpick' ); if ( pick ) out.push( [ 'pick', pick ] );
	return out;
}

// opened now (the verbs and the combos time it themselves): its contents into your bag. Returns false when the pick fails.
export function openLockbox( g, box, method, tool ) {
	const U = g.itemUse, M = L.LOCK[ method ];
	if ( M.noise ) noise( g, g.player.pos, M.noise, method === 'pry' ? 'metal' : 'drill' );
	if ( method === 'pick' ) {
		const k = M.ok + ( g.skills?.level?.( 'mechanics' ) || 0 ) * 0.03;
		if ( Math.random() > k ) {
			if ( Math.random() < M.snap ) { U.consumeOne( tool ); g.toast( 'Lockpick broke', 'warn' ); } else g.toast( 'Didn\'t open', 'info' );
			return false;
		}
	}
	if ( tool ) {
		const td = getItem( tool.id );
		if ( td?.tool?.battery ) drain( g, tool, 0.15 );
		if ( method !== 'pick' ) U.wear( tool, 0.02 );
	}
	const loot = rollLoot( 'tech_lockbox' );
	U.consumeOne( box );
	for ( const s of loot ) { if ( M.damage ) s.cond = Math.max( 0.1, s.cond * ( 1 - M.damage ) ); giveStack( g, s ); }
	giveItem( g, 'scrap_metal', 1 );
	g.skills?.xp?.( 'mechanics', 4 );
	g.toast( loot.length ? 'Opened' : 'Empty', loot.length ? 'good' : 'info' );
	return true;
}

// ---- multimeter, TV, fish finder (added in review) --------------------------------------------------------------------------

// every charge you carry, emptiest first: devices by their cells, a car battery by its energy
export function chargeReadings( inv, skip = null ) {
	const out = [];
	for ( const s of inv.allStacks() ) {
		if ( s === skip ) continue;
		const d = getItem( s.id );
		if ( d?.id === 'car_battery' ) out.push( [ d.name, L.carEnergy( s ) ] );
		else if ( L.cellOf( d ) ) out.push( [ d.name, L.fracOf( s, d ) ] );
	}
	return out.sort( ( a, b ) => a[ 1 ] - b[ 1 ] );
}

function readCharge( g, stack ) {
	if ( ! needCharge( g, stack, 0.02 ) ) { g.toast( 'Battery dead', 'warn' ); return; }
	drain( g, stack, 0.02 );
	const list = chargeReadings( g.player.inventory, stack );
	playTechSound( g, 'tech_beep', { vol: 0.35, rate: 2.2 } );
	g.toast( list.length ? list.slice( 0, 4 ).map( ( [ n, k ] ) => `${n} ${Math.round( k * 100 )}%` ).join( ' · ' ) : 'Nothing to test', 'info' );
}

function watchTv( g, stack, def ) {
	const U = g.itemUse;
	if ( ! needCharge( g, stack, 0.5 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
	ensurePlaceSound( g.audio, 'radio_loop' );
	timed( U, 'Watching', 20, 'tech_static', () => {
		if ( ! U.exists( stack ) ) return;
		drain( g, stack, 0.5 );
		U.applyFun( def, 1, { repeat: 600 } );
		const hit = Math.random() < L.TV_NEWS ? findBroadcast( g, stack, L.TV ) : null;
		if ( ! hit ) return;
		g.sites.reveal( hit.kind, { x: hit.s.x, z: hit.s.z }, 4 );
		stack.data.heard = [ ...( stack.data.heard || [] ), keyOf( hit.s ) ].slice( - 16 );
		g.toast( 'Emergency broadcast · ' + ( SITE_KINDS[ hit.kind ]?.label || hit.kind ) + away( g.player.pos, hit.s ), 'good' );
	}, { cancelOnMove: false } );
}

function sonar( g, stack ) {
	const U = g.itemUse;
	const spot = waterAhead( g );
	if ( ! spot ) { g.toast( 'Face open water', 'warn' ); return; }
	if ( ! needCharge( g, stack, L.SONAR.drain ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
	timed( U, 'Scanning', 4, 'tech_beep', () => {
		if ( ! U.exists( stack ) ) return;
		drain( g, stack, L.SONAR.drain );
		stack.data.until = g.time.hours + L.SONAR.hours;
		g.skills?.xp?.( 'fishing', 1 );
		g.toast( L.sonarRead( spot.y - g.hf.heightAt( spot.x, spot.z ), g.hour ?? 12 ), 'info' );
	} );
}

// while a scan is fresh and the finder has charge, the bite comes faster; each fish costs it a little charge
addFishingMod( ( f ) => {
	const g = f.game, inv = g?.player?.inventory;
	if ( ! inv ) return null;
	const ff = inv.find( ( s, d ) => d?.tool?.kind === 'sonar' && s.data.until > g.time.hours && L.chargeOf( s, d ) > 0.05 );
	if ( ! ff ) return null;
	const deep = ( f.depth ?? 3 ) > 12;
	return {
		bite: L.SONAR.bite, land: L.SONAR.land, weights: deep ? { raw_ahi: 1.3, raw_mahimahi: 1.2, junk: 0.6 } : { junk: 0.6 },
		caught: () => { if ( g.mode !== 'creative' ) ff.data.charge = Math.max( 0, L.chargeOf( ff ) - L.SONAR.perFish ); },
	};
} );

// ---- the verbs ----------------------------------------------------------------------------------------------------------------

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, U = ctx.use, inv = ctx.inv, add = ctx.add;
	const t = def.tool || {};

	// the junk economy: anything with a parts list comes apart
	if ( def.dismantle?.length ) {
		const miss = missingTool( inv, def.dismantleTools, stack );
		add( 'Dismantle', () => dismantle( g, stack, def ), [ miss ? `need ${TOOL_NAME[ miss ]?.replace( /^an? /, '' ) || miss}` : null ] );
	}

	// cells: a loose D or 9 V into the emptiest device that takes it; fresh ones into a device; the old ones out
	const cell = L.cellOf( def );
	if ( t.kind === 'cell' ) {
		const dev = lowestFor( inv, t.cell );
		if ( dev ) add( `Insert into ${getItem( dev.id ).name}`, () => insertCell( g, stack, dev ) );
	}
	if ( ( cell === 'd' || cell === '9v' ) && L.fracOf( stack, def ) < 0.95 ) {
		const fresh = inv.find( ( s ) => s.id === L.CELL_ITEM[ cell ] );
		if ( fresh ) add( `Insert ${L.CELL_NAME[ cell ]} battery`, () => insertCell( g, fresh, stack ) );
	}
	if ( L.cellsOut( def ) && L.fracOf( stack, def ) >= L.CELL_BACK && ! stack.data.on && getItem( L.CELL_ITEM[ cell ] ) ) {
		add( 'Remove batteries', () => timed( U, 'Removing batteries', 2, 'click', () => {
			if ( ! U.exists( stack ) || L.fracOf( stack ) < L.CELL_BACK ) return;
			stack.data.charge = 0;
			U.changed( U.where( stack ) );
			giveItem( g, L.CELL_ITEM[ cell ], 1 );
		} ) );
	}

	switch ( t.kind ) {
		case 'scanner': ctx.first( 'Scan', () => listen( g, stack, def, L.SCANNER, 'Scanning' ), [ stack.data.antenna ? 'antenna' : null ] ); break;
		case 'cb': ctx.first( 'Listen', () => listen( g, stack, def, L.CB, 'Listening' ), [ stack.data.antenna ? 'antenna' : null ] ); break;
		case 'detector': ctx.first( 'Sweep', () => sweep( g, stack ) ); break;
		case 'magnet_fish': ctx.first( 'Magnet fish', () => magnetFish( g, stack ) ); break;
		case 'camera': ctx.first( 'Flash', () => { const n = flash( g, stack ); if ( n ) g.skills?.xp?.( 'stealth', 1 ); } ); break;
		case 'drone': ctx.first( 'Fly', () => fly( g, stack ) ); break;
		case 'walkman':
			ctx.first( 'Listen', () => {
				if ( ! needCharge( g, stack, 0.2 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
				timed( U, 'Listening', 15, null, () => { if ( ! U.exists( stack ) ) return; drain( g, stack, 0.25 ); U.applyFun( def, 1, { repeat: 300 } ); }, { cancelOnMove: false } );
			} );
			break;
		case 'boombox':
			add( 'Play', () => {
				if ( ! needCharge( g, stack, 0.2 ) ) { g.toast( 'Batteries dead', 'warn' ); return; }
				ensurePlaceSound( g.audio, 'radio_loop' );
				noise( g, g.player.pos, 60, 'radio' );
				timed( U, 'Playing music', 12, 'radio_loop', () => { if ( ! U.exists( stack ) ) return; drain( g, stack, 0.2 ); U.applyFun( def, 1, { repeat: 300 } ); }, { cancelOnMove: false } );
			} );
			break;
		case 'smoke_detector':
			add( 'Test', () => {
				if ( ! needCharge( g, stack, 0.1 ) ) { g.toast( 'Battery dead', 'warn' ); return; }
				drain( g, stack, 0.1 );
				playTechSound( g, 'tech_beep', { vol: 1, rate: 1.8 } );
				noise( g, g.player.pos, 30, 'alarm' );
			} );
			break;
		case 'powerbank': {
			const dev = chargeTargets( inv, { skip: stack, banks: false } )[ 0 ];
			if ( dev ) ctx.first( `Charge ${getItem( dev.id ).name}`, () => {
				if ( L.chargeOf( stack, def ) < 0.05 ) { g.toast( 'Power bank empty', 'warn' ); return; }
				timed( U, 'Charging', 5, 'click', () => {
					if ( ! U.exists( stack ) || ! U.exists( dev ) ) return;
					const used = feed( dev, L.chargeOf( stack, def ) );
					stack.data.charge = Math.max( 0, L.chargeOf( stack, def ) - used );
					g.toast( chargeLabel( dev ), 'good' );
				} );
			}, [ `${Math.round( L.fracOf( stack, def ) * 100 )}%` ] );
			break;
		}
		case 'crank': {
			const dev = chargeTargets( inv )[ 0 ];
			if ( dev ) ctx.first( 'Crank', () => timed( U, 'Cranking', 10, 'tech_crank', () => {
				if ( ! U.exists( dev ) ) return;
				g.survival?.useStamina?.( 15 );
				feed( dev, 0.22 * ( 1 + ( g.skills?.level?.( 'electrical' ) || 0 ) * 0.04 ) );
				U.wear( stack, 0.003 );
				g.skills?.xp?.( 'electrical', 1 );
				g.toast( chargeLabel( dev ), 'good' );
			} ), [ getItem( dev.id ).name ] );
			break;
		}
		case 'inverter': {
			const bat = carBattery( inv );
			const list = chargeTargets( inv );
			if ( ! list.length ) break;
			add( 'Charge devices', () => {
				const b = carBattery( inv, 0.02 );
				if ( ! b ) { g.toast( 'Need a car battery', 'warn' ); return; }
				timed( U, 'Charging', 8, 'click', () => {
					if ( ! U.exists( b ) ) return;
					let n = 0;
					for ( const s of chargeTargets( inv ) ) {
						const units = L.carEnergy( b ) * L.CAR_UNITS;
						if ( units <= 0.01 ) break;
						const used = feed( s, units );
						b.data.energy = Math.max( 0, L.carEnergy( b ) - used / L.CAR_UNITS );
						if ( used > 0 ) n ++;
					}
					g.toast( n ? `Charged ${n} · car battery ${Math.round( L.carEnergy( b ) * 100 )}%` : 'Car battery flat', n ? 'good' : 'warn' );
				} );
			}, [ bat ? `${Math.round( L.carEnergy( bat ) * 100 )}%` : 'need car battery' ] );
			break;
		}
		case 'jumper': {
			const v = nearVehicle( g, 4, ( x ) => x.needs?.battery );
			if ( v ) add( 'Jump start', () => {
				const b = carBattery( inv, 0.2 );
				if ( ! b ) { g.toast( 'Need a charged car battery', 'warn' ); return; }
				jumpStart( g, v, b );
			} );
			const run = nearVehicle( g, 4, ( x ) => x.engine?.running );
			const b = carBattery( inv );
			if ( run && b && L.carEnergy( b ) < 0.99 ) add( 'Charge car battery', () => chargeFromCar( g, run, b ) );
			break;
		}
		case 'siphon': {
			const v = nearVehicle( g, 4, ( x ) => x.fuel > 0.3 );
			if ( v ) ctx.first( 'Siphon fuel', () => siphon( g, stack, v ) );
			break;
		}
		case 'satphone':
			ctx.first( 'Call for supply drop', () => {
				const P = g.player;
				if ( g.world?.isIndoors?.( P.pos ) ) { g.toast( 'No signal indoors', 'warn' ); return; }
				if ( ! needCharge( g, stack, 0.5 ) ) { g.toast( 'Battery low', 'warn' ); return; }
				if ( stack.data.called != null && g.time.hours - stack.data.called < 48 && g.mode !== 'creative' ) { g.toast( 'No answer', 'info' ); return; }
				timed( U, 'Calling', 8, 'tech_static', () => {
					if ( ! U.exists( stack ) ) return;
					drain( g, stack, 0.5 );
					if ( Math.random() > 0.7 && g.mode !== 'creative' ) { g.toast( 'No answer', 'info' ); return; }
					const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 200;
					const d = g.sites?.supplyDrop?.( { x: P.pos.x + Math.cos( a ) * r, z: P.pos.z + Math.sin( a ) * r } );
					if ( d ) stack.data.called = g.time.hours; else g.toast( 'No answer', 'info' );
				} );
			} );
			break;
		case 'generator': {
			const can = fuelCan( inv );
			if ( can && genFuel( stack ) < L.GEN.tank - 0.1 ) add( 'Fill tank', () => timed( U, 'Filling tank', 4, 'pour', () => {
				if ( ! U.exists( can ) || ! U.exists( stack ) ) return;
				stack.data.fuel = genFuel( stack ) + takeFuel( can, L.GEN.tank - genFuel( stack ) );
			} ), [ `${genFuel( stack ).toFixed( 1 )} L` ] );
			break;
		}
	}

	switch ( t.kind ) {
		case 'multimeter': ctx.first( 'Check charge', () => readCharge( g, stack ) ); break;
		case 'tv': ctx.first( 'Watch', () => watchTv( g, stack, def ), [ stack.data.antenna ? 'antenna' : null ] ); break;
		case 'sonar': ctx.first( 'Scan water', () => sonar( g, stack ), [ stack.data.until > g.time.hours ? 'on' : null ] ); break;
	}

	// a lockbox: whatever you have that gets it open
	if ( def.id === 'lockbox' ) {
		const ways = lockMethods( inv );
		for ( const [ m, tool ] of ways ) add( L.LOCK[ m ].label, () => timed( U, L.LOCK[ m ].label.replace( /^(\w+)/, ( w ) => ( { Cut: 'Cutting', Drill: 'Drilling', Pry: 'Prying', Pick: 'Picking' }[ w ] || w ) ), L.LOCK[ m ].time, m === 'drill' ? 'tech_drill' : m === 'cut' ? 'snap' : m === 'pry' ? 'hit_metal' : 'click', () => {
			if ( ! U.exists( stack ) || ! U.exists( tool ) ) return;
			openLockbox( g, stack, m, tool );
		} ) );
		if ( ! ways.length ) add( 'Open', () => g.toast( 'Locked. Need bolt cutters or a crowbar', 'warn' ), [ 'locked' ] );
	}
} );
