// UI harness (not shipped): the real UI from src/ui mounted on a stubbed app and game, so screens and
// HUD states open in a second instead of a full game boot. Open /test/preview/ui.html on the dev server:
//   ?screen=  title | worlds | new | edit | options | keys | about | pause | death | inventory | loot | craft |
//             catalog | map | status | chat | confirm | hud (default) | kit (component gallery)
//   ?hud=     comma list: damaged, aiming, vehicle, heli, boat, swim, jam, empty, loot, hold, action, toasts,
//             pickups, hint, cold, creative, nogun
//   ?bg=      sky | sand | foliage | street | night | dusk (default sky) | any image URL
//   ?gui=0.7..1.6  ?tab=graphics|interface|audio|controls|keys|gameplay  ?hudMode=auto|always
//   ?world=0  skip loading the real map data (the map and minimap then draw a plain sea)
// Sets window.__ready once the screen is up; window.__app, __game and __ui for scripting.
// Screenshots: node test/preview/ui-shots.mjs <port> <outdir> [name=query …]
import * as THREE from 'three';
import '../../src/game/items/defs/index.js';
import { Settings, DEFAULTS } from '../../src/core/Settings.js';
import { Input } from '../../src/core/Input.js';
import { Events } from '../../src/core/Events.js';
import { SaveSystem } from '../../src/core/SaveSystem.js';
import { PlayerInventory } from '../../src/game/Inventory.js';
import { Survival } from '../../src/game/Survival.js';
import { Markers } from '../../src/game/Markers.js';
import { makeStack, getItem } from '../../src/game/items/ItemDB.js';
import { allRecipes } from '../../src/game/items/recipes.js';
import { UI } from '../../src/ui/UI.js';
import { h } from '../../src/ui/dom.js';
import { PATHS, icon } from '../../src/ui/icons.js';
import { seg, toggle, slider, select, popMenu } from '../../src/ui/widgets.js';

const q = new URLSearchParams( location.search );
const screen = q.get( 'screen' ) || 'hud';
const states = new Set( ( q.get( 'hud' ) || '' ).split( ',' ).filter( Boolean ) );
const bgName = q.get( 'bg' ) || 'sky';
const bg = document.getElementById( 'bg' );
if ( /[/.]/.test( bgName ) ) bg.style.backgroundImage = `url(${bgName})`; else bg.className = bgName;

// settings live in memory only, so the harness never touches the game's stored options
class MemSettings extends Settings {
	constructor() { super(); this.values = structuredClone( DEFAULTS ); }
	save() {}
}
const settings = new MemSettings();
if ( q.get( 'gui' ) ) settings.set( 'guiScale', + q.get( 'gui' ) );
if ( q.get( 'hudMode' ) ) settings.set( 'hudMode', q.get( 'hudMode' ) );
settings.set( 'showFps', q.get( 'fps' ) === '1' );
document.documentElement.style.setProperty( '--gui', settings.get( 'guiScale' ) );
settings.on( 'guiScale', v => document.documentElement.style.setProperty( '--gui', v ) );

// ---- world: the real map data when available (map + minimap + place names), else a plain stub ----
async function loadWorld() {
	if ( q.get( 'world' ) !== '0' ) {
		try {
			const { HeightField, loadTerrainBuffer } = await import( '../../src/world/HeightField.js' );
			const { WorkerPool } = await import( '../../src/core/WorkerPool.js' );
			const meta = await ( await fetch( '/data/world.json' ) ).json();
			const buf = await loadTerrainBuffer( '/data/terrain.bin.gz', () => {} );
			const hf = new HeightField( buf, meta );
			const pool = new WorkerPool( 2 );
			const lean = { cities: meta.cities, roads: meta.roads, streets: meta.streets, runways: meta.runways, buildings: meta.buildings };
			await pool.broadcast( { type: 'init', meta: { halfX: meta.halfX, halfZ: meta.halfZ }, world: lean }, buf );
			return { meta, hf, pool, real: true };
		} catch ( e ) { console.warn( 'harness: no world data, using a stub', e ); }
	}
	const meta = { islands: [ { id: 1, name: 'Oʻahu', x: 0, z: 0 } ], cities: [ { name: 'Waikīkī', x: - 3880, z: - 9660, radius: 900, kind: 'city' } ], roads: [], streets: [], runways: [], buildings: { data: [] }, labels: [], halfX: 60000, halfZ: 40000 };
	const hf = { islandAt: () => 1, baseHeight: () => 4, heightAt: () => 4, surfaceAt: () => [], flagsNear: () => 0 };
	return { meta, hf, pool: null, real: false };
}

const canvas = document.getElementById( 'view' );
const world = await loadWorld();
const saves = new SaveSystem(); // never opened: saves stay in memory
const app = {
	q, canvas, settings, world, saves,
	input: new Input( canvas, settings ),
	audio: { init() {}, ui() {}, play() {} },
	fps: 60, frame: 0,
	renderer: { gl: { info: { render: { calls: 812, triangles: 1.9e6 }, memory: { geometries: 540, textures: 212 } } } },
	async startGame( save ) { startGame( save ); },
	async quit() {},
	placeTitleCamera() {},
	thumbnail() { return null; },
};
window.__app = app;

// sample worlds for the world list
const now = Date.now();
for ( const [ i, w ] of [
	{ name: 'Honolulu run', mode: 'survival', difficulty: 'normal', hours: 11 * 24 + 6, play: 5.2 * 3600, ago: 3600e3 },
	{ name: 'Big Island hardcore', mode: 'survival', difficulty: 'hard', hardcore: true, dead: true, hours: 3 * 24, play: 1.1 * 3600, ago: 86400e3 * 2 },
	{ name: 'Creative test', mode: 'creative', difficulty: 'normal', hours: 30, play: 900, ago: 86400e3 * 40 },
].entries() ) {
	const id = 'w' + i;
	saves.memory.set( id, { id, name: w.name, seed: 1234 + i, mode: w.mode, difficulty: w.difficulty, hardcore: !! w.hardcore, dead: !! w.dead, created: now - w.ago - 86400e3,
		lastPlayed: now - w.ago, playTime: w.play, time: { hours: w.hours }, stats: { zombies: 212, deaths: 3, distance: 14200 }, world: {} } );
}

// ---- stub game -----------------------------------------------------------------------------------
function makeInventory( creative ) {
	const inv = new PlayerInventory();
	const put = ( id, qty = 1, o = {} ) => { const s = makeStack( id, qty, o ); if ( o.cond != null ) s.cond = o.cond; return s; };
	inv.equip.torso = put( 'aloha_shirt' );
	inv.equip.legs = put( 'cargo_shorts' ) || put( 'jeans' );
	inv.equip.back = put( 'backpack_hiking' );
	inv.equip.feet = put( 'sneakers' ) || null;
	for ( const k in inv.equip ) if ( ! inv.equip[ k ] ) delete inv.equip[ k ];
	inv.weapons.primary = put( 'm4a1', 1, { full: true } );
	inv.weapons.melee = put( 'machete', 1, { cond: 0.62 } );
	inv.weapons.sidearm = put( 'glock17', 1, { full: true } );
	const add = ( id, qty = 1, o ) => { const s = put( id, qty, o || {} ); if ( s ) inv.add( s, { autoEquip: false } ); return s; };
	add( 'bandage', 3 ); add( 'canned_tuna', 2 ); add( 'ammo_556', 90 ); add( 'mag_stanag30', 1, { full: true } );
	add( 'water_bottle' ) || add( 'soda_cola' ); add( 'lighter' ); add( 'flashlight' ); add( 'painkillers' ); add( 'map_hawaii' ); add( 'compass' );
	const rifle = inv.weapons.primary;
	inv.hands = creative || states.has( 'nogun' ) ? null : rifle?.uid;
	inv.hotbar[ 0 ] = rifle?.uid; inv.hotbar[ 1 ] = inv.weapons.sidearm?.uid; inv.hotbar[ 2 ] = inv.weapons.melee?.uid;
	const band = inv.find( s => s.id === 'bandage' ); if ( band ) inv.hotbar[ 4 ] = band.uid;
	inv.changed();
	return inv;
}

function makeGame( save ) {
	const creative = save.mode === 'creative' || states.has( 'creative' );
	const events = new Events();
	const inv = makeInventory( creative );
	const [ ax, az ] = ( q.get( 'at' ) || '-3880,-9660' ).split( ',' ).map( Number );
	const ground = [];
	const g = {
		app, events, save, mode: creative ? 'creative' : 'survival', difficulty: save.difficulty || 'normal',
		dead: false, paused: false, inputActive: true, justSpawned: true,
		day: 3, hour: 14.33, time: { hours: 2 * 24 + 14.33 },
		stats: { looted: 12, zombies: 31, lifeKills: 7, lives: 2, lifeStart: 24 + 8, deaths: 1 },
		player: { pos: new THREE.Vector3( ax, 3, az ), yaw: 0.35, inventory: inv, vehicle: null, distance: 5320, stance: 'stand', speedNow: 0, sprinting: false, swimming: false, flying: false },
		camera: { fov: 80 },
		hf: world.hf, physics: { waterLevel: () => 0 }, weather: { state: 'clear', rain: 0, cover: 0.2 },
		entities: { list: [], count: () => 0 }, creatures: { stats: () => ( { zombies: 14 } ) },
		interact: { target: null, holdT: 0 },
		actions: { busy: false, progress: 0, current: null, start( a ) { this.busy = true; this.current = { ...a, t: 0 }; this.progress = 0; } },
		vehicles: { hud: () => null, known: () => [], driving: null },
		itemUse: { actions: () => [], use: () => {}, fillFrom: () => {} },
		items3d: { near: () => ground, remove: wi => { const i = ground.indexOf( wi ); if ( i >= 0 ) ground.splice( i, 1 ); } },
		nearFire: () => false,
		toast( text, kind = 'info', icon = null ) { events.emit( 'toast', { text, kind, icon } ); },
		give( id, n = 1 ) { const s = makeStack( id, n ); if ( s && inv.add( s ) > 0 ) g.dropStack( s ); inv.changed(); },
		dropStack( s ) { ground.push( { id: s.id, stack: s } ); },
		respawn() { g.dead = false; },
		async saveNow() {},
		commands: {
			run() {}, teleport() {},
			// enough of Commands.complete() for the suggestion list
			complete( line ) {
				const cmds = { give: 'Give item', gamemode: 'Game mode', tp: 'Teleport', time: 'Set time', weather: 'Weather', locate: 'Find place', summon: 'Spawn', kill: 'Die', help: 'Commands' };
				const q = line.slice( 1 ).split( ' ' )[ 0 ].toLowerCase();
				return line.includes( ' ' ) ? [] : Object.entries( cmds ).filter( ( [ k ] ) => k.startsWith( q ) ).map( ( [ k, d ] ) => ( { text: '/' + k, desc: d, full: '/' + k + ' ' } ) );
			},
		},
	};
	g.markers = new Markers( g );
	g.markers.add( { x: ax + 900, z: az - 700, label: 'Car', kind: 'user' } );
	g.markers.add( { x: ax - 2400, z: az + 300, label: 'Your body', kind: 'death' } );
	g.survival = new Survival( g );
	const heldDef = () => getItem( inv.heldStack()?.id );
	g.hands = {
		aiming: false,
		get held() { return inv.heldStack(); },
		ammoInfo() {
			const st = inv.heldStack(), d = heldDef();
			if ( ! st || ! d?.firearm ) return null;
			let reserve = 0;
			for ( const s of inv.allStacks() ) {
				const dd = getItem( s.id );
				if ( dd?.ammo?.caliber === d.firearm.caliber ) reserve += s.qty;
			}
			return { reserve, mode: st.data.jam ? 'jammed' : d.firearm.modes[ st.data.mode || 0 ] };
		},
		crosshairSpread: () => 0.012, viewFov: () => 80,
		select( s ) { inv.hands = s.uid; inv.changed(); }, holster() { inv.hands = null; inv.changed(); },
		loadMagazine() {}, unloadMagazine() {}, loadWeapon() {}, unloadWeapon() {}, insertMagazine() {}, removeMagazine() {}, attach() {}, detach() {},
	};
	const recipes = allRecipes();
	const canCraft = r => r.in.every( ( [ id, n ] ) => inv.count( id ) >= n ) && ( r.tools || [] ).every( t => inv.hasTool( t ) ) && ! r.station;
	g.crafting = { recipes, canCraft, check: r => ( { ok: canCraft( r ) } ), craft() {}, liquidAvailable: () => 0, boilable: () => false };
	// ground loot for the Nearby column
	for ( const [ id, n ] of [ [ 'canned_beans', 1 ], [ 'hoodie', 1 ], [ 'rags', 4 ], [ 'hunting_knife', 1 ] ] ) { const s = makeStack( id, n ); if ( s ) g.dropStack( s ); }
	applyStates( g );
	return g;
}

function applyStates( g ) {
	const S = g.survival, inv = g.player.inventory;
	if ( states.has( 'damaged' ) ) { S.health = 41; S.blood = 2900; S.bleeding = 2; S.hunger = 25; S.thirst = 44; S.temp = 35.8; S.stamina = 34; }
	if ( states.has( 'cold' ) ) { S.temp = 35.1; S.wet = 0.8; }
	if ( states.has( 'swim' ) ) { S.breath = 45; g.player.swimming = true; }
	if ( states.has( 'aiming' ) ) g.hands.aiming = true;
	const rifle = inv.weapons.primary;
	if ( states.has( 'jam' ) && rifle ) rifle.data.jam = true;
	if ( states.has( 'empty' ) && rifle?.data.mag ) { rifle.data.mag.data.rounds = 0; rifle.data.chamber = 0; }
	if ( states.has( 'loot' ) ) g.interact.target = { label: 'Take Canned tuna ×2' };
	if ( states.has( 'hold' ) ) g.interact.target = { label: 'Search Kitchen cupboard', sub: '3 items', hold: 1.5 };
	if ( states.has( 'action' ) ) g.actions.start( { label: 'Bandaging', time: 4 } );
	const veh = [ 'vehicle', 'heli', 'boat' ].find( k => states.has( k ) );
	if ( veh ) {
		g.player.vehicle = {};
		const v = { vehicle: { name: 'Pickup truck', speed: 23.4, fuel: 0.42, health: 0.88, gear: 3, kind: 'car' }, heli: { name: 'Tour helicopter', speed: 41, fuel: 0.12, health: 0.64, gear: null, kind: 'heli', altitude: 420 }, boat: { name: 'Fishing boat', speed: 9.2, fuel: 0.7, health: 0.25, gear: 'F', kind: 'boat' } }[ veh ];
		g.vehicles.hud = () => ( { ...v, heading: g.player.yaw } );
	}
}

let ui = null;
function startGame( save ) {
	const g = makeGame( save );
	window.__game = g;
	ui.enterGame( g );
	return g;
}

// ---- frame loop ------------------------------------------------------------------------------------
let last = performance.now();
function frame( t ) {
	const dt = Math.min( 0.1, ( t - last ) / 1000 ); last = t;
	app.frame ++;
	const g = ui.game;
	if ( g ) {
		if ( g.interact.target?.hold ) g.interact.holdT = ( g.interact.holdT + dt ) % ( g.interact.target.hold + 0.4 );
		if ( g.actions.busy && g.actions.current ) { const c = g.actions.current; c.t = ( c.t + dt ) % c.time; g.actions.progress = c.t / c.time; }
	}
	try { ui.update( dt ); } catch ( e ) { console.error( e ); }
	app.input.endFrame();
	requestAnimationFrame( frame );
}

// ---- component gallery -----------------------------------------------------------------------------
function kit() {
	const root = document.getElementById( 'ui' );
	const sec = ( title, ...kids ) => h( 'section.panel.static', {}, h( 'h5.t-label.ink-3', { text: title } ), ...kids );
	const r = ( ...kids ) => h( 'div.r', {}, ...kids );
	const k = ( t, cls ) => h( 'span.kc' + ( cls ? '.' + cls : '' ), { text: t } );
	const cell = ( id, o = {} ) => {
		const c = h( 'div.cell' + ( o.cls ? '.' + o.cls : '' ) );
		const img = h( 'img', { alt: '' } );
		import( '../../src/ui/itemIcons.js' ).then( m => m.setIcon( img, id ) );
		c.append( img );
		if ( o.q ) c.append( h( 'span.q', { text: o.q } ) );
		if ( o.n ) c.append( h( 'span.n', { text: o.n } ) );
		if ( o.held ) c.append( h( 'i.dot' ) );
		if ( o.bar != null ) c.append( h( 'div.meter' + ( o.bar < 0.25 ? '.alarm' : o.bar < 0.5 ? '.warn' : '' ), {}, h( 'i', { style: { width: o.bar * 100 + '%' } } ) ) );
		return c;
	};
	const emptySlot = n => h( 'div.cell.empty', { title: n }, icon( n, 24 ) );
	const [ sl, sv ] = slider( { min: 0, max: 100, value: 72, fmt: v => v + '%' } );
	const hold = h( 'span.kc-hold', { style: { '--p': 0.62 } }, k( 'F' ) );
	hold.style.setProperty( '--p', 0.62 );
	const menuBtn = h( 'button.btn', { text: 'Menu', onclick: e => popMenu( [ { label: 'Use', def: true, hint: { key: 'LMB 2×' } }, { label: 'Hold', hint: { key: 'Shift' } }, { label: 'Split', hint: { key: 'Space' } }, null, { label: 'Drop', hint: { key: 'Del' }, danger: true } ], e.currentTarget ) } );
	const grid = h( 'div.kit' );
	const icons = h( 'div.icons' );
	for ( const n of Object.keys( PATHS ) ) icons.append( h( 'div', {}, icon( n, 24 ), icon( n ), h( 'span', { text: n } ) ) );
	grid.append(
		sec( 'Type',
			h( 'div.wordmark', { text: 'DEADTIDE', style: { fontSize: 'calc(40 * var(--u))' } } ),
			h( 'div.t-display', { text: 'Bled out' } ), h( 'div.t-title', { text: 'Options' } ), h( 'div.t-num', { text: '31' } ),
			h( 'div.t-body', { text: 'Canned tuna ×2' } ), h( 'div.t-label.ink-3', { text: 'Carried' } ), h( 'div.t-mono', { text: '/give m4a1 1' } ) ),
		sec( 'Buttons',
			r( h( 'button.btn.primary', { text: 'Play' } ), h( 'button.btn', { text: 'Import' } ), h( 'button.btn.ghost', { text: 'Cancel' } ), h( 'button.btn.danger', { text: 'Delete' } ), h( 'button.btn', { disabled: true, text: 'Off' } ) ),
			r( h( 'button.btn.sm', { text: 'Take all' } ), h( 'button.btn.lg.primary', { text: 'Respawn' } ), h( 'button.btn.icon', { title: 'Close' }, icon( 'close' ) ), h( 'button.btn.icon.sm', { title: 'Sort' }, icon( 'sort' ) ), h( 'button.btn', {}, icon( 'plus' ), h( 'span', { text: 'New world' } ) ) ),
			r( select( [ [ 'random', 'Random' ], [ 'oahu', 'Oʻahu' ], [ 'maui', 'Maui' ] ], 'oahu' ), menuBtn ) ),
		sec( 'Controls',
			r( seg( [ [ 'low', 'Low' ], [ 'med', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ], [ 'custom', 'Custom' ] ], 'high', null, { disabled: new Set( [ 'custom' ] ) } ) ),
			r( toggle( true ), toggle( false ), sl, sv ),
			r( h( 'input.input', { value: 'New World' } ), h( 'div.search', { style: { width: 'calc(200 * var(--u))' } }, icon( 'search' ), h( 'input.input', { placeholder: 'Search' } ), h( 'span.count', { text: '412' } ) ) ) ),
		sec( 'Key caps and chips',
			r( k( 'F' ), k( 'Shift' ), h( 'span.kc', {}, icon( 'mouseL', 12 ) ), k( 'Esc', 'out' ), hold, h( 'span.hint', {}, k( 'R' ), h( 'span', { text: 'Reload' } ) ) ),
			r( h( 'span.chip', {}, icon( 'bleed' ), h( 'span', { text: 'Bleeding' } ) ), h( 'span.chip.req', {}, h( 'span', { text: '2/3 Rags' } ) ), h( 'span.chip.req.miss', {}, h( 'span', { text: '0/1 Stick' } ) ) ),
			r( h( 'div.plate', { style: { padding: '0 8px', height: 'calc(24 * var(--u))', display: 'flex', alignItems: 'center' }, text: 'Plate' } ), h( 'div.plate.warn', { style: { padding: '0 8px', height: 'calc(24 * var(--u))', display: 'flex', alignItems: 'center' }, text: 'Warn' } ), h( 'div.plate.alarm', { style: { padding: '0 8px', height: 'calc(24 * var(--u))', display: 'flex', alignItems: 'center' }, text: 'Alarm' } ) ) ),
		sec( 'Rows and tables',
			h( 'div.sec-head', {}, h( 'span.t-label', { text: 'View' } ), h( 'span.meta', { text: '7.5/40' } ) ),
			h( 'div.row.changed', {}, h( 'div.lab', { text: 'Field of view' } ), h( 'div.ctl', {}, ...slider( { min: 60, max: 110, value: 90, fmt: v => v + '°' } ) ), h( 'div.rst', {}, h( 'button.btn.icon.sm', { title: 'Reset' }, icon( 'reset' ) ) ) ),
			h( 'div.row', {}, h( 'div.lab', { text: 'Grass' } ), h( 'div.ctl', {}, toggle( true ) ), h( 'div.rst' ) ),
			h( 'div.stats', { style: { marginTop: '12px' } }, ...[ [ 'Health', '41' ], [ 'Blood', '58%' ], [ 'Body', '35.8°' ], [ 'Air', '27°' ] ].map( ( [ a, b ] ) => h( 'div', {}, h( 'span', { text: a } ), h( 'span', { text: b } ) ) ) ),
			h( 'div.meter', { style: { marginTop: '12px' } }, h( 'i', { style: { width: '64%' } } ) ) ),
		sec( 'Cells',
			r( cell( 'm4a1', { q: '31', n: '1', held: true, bar: 0.82 } ), cell( 'canned_tuna', { q: '2' } ), cell( 'machete', { bar: 0.4 } ), cell( 'bandage', { q: '3', cls: 'sel' } ), cell( 'lighter', { cls: 'over' } ), cell( 'rags', { cls: 'deny' } ) ),
			r( ...[ 'head', 'eyes', 'face', 'torso', 'vest', 'back', 'gloves', 'legs', 'feet', 'belt' ].map( emptySlot ) ),
			r( h( 'div.cell.empty.w3', {}, icon( 'primary', 24 ) ), h( 'div.cell.empty.w2', {}, icon( 'sidearm', 24 ) ), emptySlot( 'melee' ), h( 'div.cell.empty', {}, icon( 'hands', 24 ) ) ) ),
		sec( 'Tooltip and menu',
			r( h( 'div.pop.tip.static', {},
				h( 'div.ttl', { text: 'M4A1 Carbine' } ), h( 'div.meta.t-label', { text: 'Firearm · 5.56' } ), h( 'hr' ),
				...[ [ 'Condition', 'Worn' ], [ 'Loaded', '31/30' ], [ 'Damage', '34' ], [ 'Rate', '800 rpm' ] ].map( ( [ a, b ] ) => h( 'div.kv', {}, h( 'span', { text: a } ), h( 'span', { text: b } ) ) ),
				h( 'hr' ), h( 'div.foot', {}, h( 'span', { text: '3.40 kg' } ), h( 'span', { text: 'Size 4' } ) ) ),
			h( 'div.pop.menu.static', {}, ...[ [ 'Use', 'def', 'LMB 2×' ], [ 'Hold', '', 'Shift' ], [ 'Bind', '', '1–9' ] ].map( ( [ l, c, kk ] ) => h( 'button' + ( c ? '.' + c : '' ), {}, h( 'span', { text: l } ), h( 'span.kc.out', { text: kk } ) ) ), h( 'div.sep' ), h( 'button.danger', {}, h( 'span', { text: 'Drop' } ), h( 'span.kc.out', { text: 'Del' } ) ) ) ) ),
		sec( 'Toasts and prompt',
			h( 'div.toast.plate', {}, h( 'span', { text: 'Saved' } ) ),
			h( 'div.toast.plate', { style: { marginTop: '4px' } }, h( 'span.sd.warn' ), h( 'span', { text: 'No room' } ), h( 'span.x', { text: '×2' } ) ),
			h( 'div.toast.plate', { style: { marginTop: '4px' } }, h( 'span.sd.bad' ), h( 'span', { text: 'Bleeding' } ) ),
			h( 'div.prompt.plate', { style: { position: 'static', transform: 'none', marginTop: '12px', width: 'max-content' } }, k( 'F' ), h( 'span.lbl', { text: 'Search Kitchen cupboard' } ), h( 'span.sub', { text: '3 items' } ) ) ),
		sec( 'Icons', icons ),
	);
	root.appendChild( grid );
}

// ---- boot -------------------------------------------------------------------------------------------
if ( screen === 'kit' ) kit();
else {
	ui = new UI( app );
	window.__ui = ui;
	requestAnimationFrame( frame );
	const inGame = ! [ 'title', 'worlds', 'new', 'edit', 'about', 'confirm', 'kit' ].includes( screen ) && ! ( screen === 'options' && q.get( 'from' ) === 'title' );
	if ( inGame ) {
		const save = { name: 'Honolulu run', mode: states.has( 'creative' ) || screen === 'catalog' ? 'creative' : 'survival', difficulty: 'normal', hardcore: q.get( 'hardcore' ) === '1', seed: 1234 };
		startGame( save );
	}
	const tab = q.get( 'tab' );
	if ( tab ) ui.menus._optTab = { interface: 'video', keys: 'keys' }[ tab ] || tab;
	const back = () => ( ui.game ? ui.menus.pause() : ui.menus.title() );
	switch ( screen ) {
		case 'title': ui.showTitle(); break;
		case 'worlds': await ui.menus.worlds(); break;
		case 'new': ui.menus.createWorld(); break;
		case 'edit': await ui.menus.editWorld( 'w0' ); break;
		case 'about': ( ui.menus.about || ui.menus.credits ).call( ui.menus ); break;
		case 'options': ui.menus.options( back ); break;
		case 'keys': ui.menus._optTab = 'keys'; ui.menus.options( back ); break;
		case 'pause': ui.menus.pause(); break;
		case 'death': ui.game.dead = true; ui.showDeath( { cause: q.get( 'cause' ) || 'Bled out', days: 2.4, kills: 7 } ); break;
		case 'inventory': ui.openInventory(); break;
		case 'loot': ui.openContainer( { key: 'fridge', label: 'Fridge', capacity: 20, items: [ makeStack( 'spam', 2 ), makeStack( 'soda_cola', 3 ), makeStack( 'milk', 1 ) ].filter( Boolean ), kind: 'container' } ); break;
		case 'craft': ui.inventory.leftTab = 'craft'; ui.openInventory(); break;
		case 'catalog': ui.inventory.leftTab = 'catalog'; ui.openInventory(); break;
		case 'map': ui.map.open(); break;
		case 'status': ui.journal(); break;
		case 'chat': for ( const [ t, k ] of [ [ 'Day 3 · 14:20' ], [ 'Unknown: /tpp', 'err' ], [ '/give m4a1', 'cmd' ] ] ) ui.chat.add( t, k || '' ); ui.chat.show( '/gi' ); break;
		case 'confirm': ui.showTitle(); ui.confirm( 'Delete “Honolulu run”?', null, 'Delete', 'danger' ); break;
		case 'hud': default: break;
	}
}
await document.fonts?.ready;
// timed HUD events go last so they are still on screen when the shot is taken
const g = ui?.game;
if ( g && states.has( 'toasts' ) ) { g.toast( 'No room', 'warn' ); g.toast( 'Bleeding', 'bad' ); g.toast( 'Slept 6 h' ); }
if ( g && states.has( 'pickups' ) ) for ( const id of [ 'canned_tuna', 'ammo_556' ] ) { const s = makeStack( id, id === 'ammo_556' ? 30 : 2 ); g.events.emit( 'item:pick', { stack: s } ); }
setTimeout( () => { window.__ready = true; }, 700 );
