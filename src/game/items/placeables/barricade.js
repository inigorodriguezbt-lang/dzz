// `barricade`: planks nailed across a closed door (planks + 2 nails + a hammer, up to four). A barricaded door won't
// open, and the infected pounding on it break the planks first (90 hp each) before the door itself takes a blow.
// Planks come off again with a hammer or a crowbar. Built on the buildings' door API (city/buildings/doors.js):
// door.key is stable across streaming, and each live door's bash() is wrapped to feed its barricade. Windows have no
// API to hang this on yet, so only doors can be barricaded.
import * as THREE from 'three';
import { addPlaceable } from './registry.js';
import { makeStack } from '../ItemDB.js';
import { PLANK_HP, MAX_PLANKS, planksLeft } from './logic.js';
import { placedModel } from '../models/ext/placeables.js';
import { provides } from '../util.js';

const _d = new THREE.Vector3();
const tool = ( g, kind ) => g.player.inventory.find( ( s ) => provides( s, kind ) );

// the closed door you are looking at (or standing at), or null
export function doorAhead( g ) {
	const cam = g.camera;
	_d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
	const hit = g.physics.raycastBoxes( cam.position, _d, 2.8 );
	let d = hit?.box?.kind === 'door' ? hit.box.owner : null;
	if ( ! d?.bash ) d = g.city?.doorAt?.( g.player.pos, 1.8 ) || null;
	if ( ! d || d.broken || d.isOpen || ! d.leaves?.length ) return null;
	return d;
}

// where the planks go: across the doorway on the side you stand
function frame( d, g, side = null ) {
	const l = d.leaves[ 0 ], yaw = l.yaw0;
	const nx = Math.sin( yaw ), nz = Math.cos( yaw );
	const c = d.pos;
	const s = side ?? ( ( g.player.pos.x - c.x ) * nx + ( g.player.pos.z - c.z ) * nz >= 0 ? 1 : - 1 );
	const off = ( l.batch?.t ?? 0.045 ) / 2 + 0.018;
	return { pos: { x: c.x + nx * off * s, y: l.y, z: c.z + nz * off * s }, yaw: s > 0 ? yaw : yaw + Math.PI, side: s };
}

export function barricadeDoor( g, stack ) {
	const M = g.placeables, inv = g.player.inventory;
	const d = doorAhead( g );
	if ( ! d ) { g.toast( 'No closed door here', 'warn' ); return; }
	const rec = M.byDoor( d.key );
	if ( rec && rec.data.n >= MAX_PLANKS ) { g.toast( 'Fully barricaded', 'info' ); return; }
	if ( ! tool( g, 'hammer' ) ) { g.toast( 'Need a hammer', 'warn' ); return; }
	if ( inv.count( 'nails' ) < 2 ) { g.toast( 'Need 2 nails', 'warn' ); return; }
	g.app?.ui?.closeScreen?.();
	M.timed( 'Barricading', 6, 'nail', () => {
		if ( d.broken || d.isOpen ) { g.toast( 'Door is open', 'warn' ); return; }
		const plank = g.itemUse?.exists?.( stack ) ? stack : inv.find( ( s ) => s.id === 'planks' );
		if ( ! plank || inv.count( 'nails' ) < 2 ) return;
		g.itemUse.consumeOne( plank );
		inv.consume( 'nails', 2 );
		inv.changed();
		const r = M.byDoor( d.key );
		if ( r ) { r.data.n ++; r.data.hp = Math.min( r.data.n * PLANK_HP, r.data.hp + PLANK_HP ); M.refresh( r ); }
		else {
			const f = frame( d, g );
			M.add( 'barricade', null, f.pos, f.yaw, { door: d.key, n: 1, hp: PLANK_HP, w: d.w, item: 'planks' } );
		}
		wrapDoor( g, d );
		g.skills?.xp?.( 'carpentry', 5 );
		g.events.emit( 'noise', { pos: d.pos.clone(), radius: 20, source: g.player, kind: 'hammer' } );
	} );
}

// the live door's bash() feeds the barricade first (zombies call door.bash; doors are rebuilt as interiors stream)
export function wrapDoor( g, d ) {
	if ( ! d || d._plBarricade ) return;
	const orig = d.bash;
	d._plBarricade = true;
	d.bash = ( amount, info ) => {
		const r = g.placeables?.byDoor( d.key );
		if ( ! r || r.data.n <= 0 ) return orig( amount, info );
		damage( g, r, amount );
		return true;
	};
}

export function damage( g, r, amount ) {
	const M = g.placeables, D = r.data;
	D.hp -= amount;
	const left = planksLeft( D.hp );
	if ( left >= D.n ) return;
	D.n = left;
	M.sound( r, 'door_break', 0.7, { rate: 1.3 } );
	if ( D.n <= 0 ) M.remove( r, { give: false } );
	else M.refresh( r );
}

addPlaceable( 'barricade', {
	model( p ) { return placedModel( 'planks', { w: p.data.w ?? 1, n: p.data.n || 1 } ); },
	label: () => 'Barricade',
	sub( p ) { return `${p.data.n} ${p.data.n === 1 ? 'plank' : 'planks'}`; },
	actions( p, g ) {
		const D = p.data, M = g.placeables, inv = g.player.inventory, A = [];
		A.push( { label: 'Remove plank', run: () => {
			const t = tool( g, 'pry' ) || tool( g, 'hammer' );
			if ( ! t ) { g.toast( 'Need a hammer or crowbar', 'warn' ); return; }
			M.timed( 'Prying off', 5, 'hit_wood', () => {
				if ( ! M.list.has( p.id ) ) return;
				D.n --; D.hp = Math.min( D.hp, D.n * PLANK_HP );
				// the wood splits sometimes; most nails bend
				if ( Math.random() < 0.8 ) M.give( makeStack( 'planks', 1 ) );
				if ( Math.random() < 0.5 ) M.give( makeStack( 'nails', 1 ) );
				g.itemUse?.wear?.( t, 0.01 );
				if ( D.n <= 0 ) M.remove( p, { give: false } ); else M.refresh( p );
			} );
		} } );
		if ( D.n < MAX_PLANKS && inv.count( 'planks' ) > 0 && inv.count( 'nails' ) >= 2 && tool( g, 'hammer' ) ) A.push( { label: 'Add plank', run: () => barricadeDoor( g, inv.find( ( s ) => s.id === 'planks' ) ) } );
		return A;
	},
} );
