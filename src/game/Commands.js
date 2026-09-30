// Chat commands: /give /tp /time /weather /locate /summon /gamemode /kill /heal … with tab completion.
// Other modules add entity spawners with game.spawnables[ name ] = { spawn( pos, opts ) -> entity, desc }.
import * as THREE from 'three';
import { ITEMS, getItem, makeStack } from './items/ItemDB.js';
import { WEATHERS } from './Weather.js';

const norm = s => s.toLowerCase().normalize( 'NFD' ).replace( /[̀-ͯʻ‘’']/g, '' ).replace( /[^a-z0-9]+/g, '' );

export function install( game ) {
	game.spawnables = game.spawnables || {};
	game.commands = new Commands( game );
}

export class Commands {
	constructor( game ) {
		this.game = game;
		this.history = [];
		const g = game;
		const say = ( t, kind = 'ok' ) => g.events.emit( 'chat', { text: t, kind } );
		this.say = say;
		this.cmds = {
			help: {
				usage: '/help [command]', desc: 'List commands', args: [ () => Object.keys( this.cmds ) ],
				run: ( a ) => {
					if ( a[ 0 ] && this.cmds[ a[ 0 ] ] ) { const c = this.cmds[ a[ 0 ] ]; say( `${c.usage} — ${c.desc}`, 'sys' ); return; }
					say( 'Commands: ' + Object.keys( this.cmds ).map( k => '/' + k ).join( ' ' ), 'sys' );
				},
			},
			give: {
				usage: '/give <item> [count]', desc: 'Give item', args: [ () => [ ...ITEMS.keys() ], () => [ '1', '5', '10', '30', '100' ] ],
				run: ( a ) => {
					const id = this.resolveItem( a[ 0 ] );
					if ( ! id ) return say( `Unknown item: ${a[ 0 ] || ''}`, 'err' );
					const n = Math.max( 1, Math.min( 999, parseInt( a[ 1 ] || '1', 10 ) || 1 ) );
					g.give( id, n );
					say( `Gave ${n} × ${getItem( id ).name}` );
				},
			},
			tp: {
				usage: '/tp <x> <z> | <x> <y> <z> | <place> | ~dx ~dz', desc: 'Teleport', args: [ () => this.placeNames() ],
				run: ( a ) => {
					if ( ! a.length ) return say( this.cmds.tp.usage, 'err' );
					const p = g.player.pos;
					const num = ( s, base ) => s.startsWith( '~' ) ? base + ( parseFloat( s.slice( 1 ) ) || 0 ) : parseFloat( s );
					let x, y = null, z;
					if ( a.length >= 2 && a.every( s => /^~?-?\d*\.?\d*$/.test( s ) ) ) {
						if ( a.length === 2 ) { x = num( a[ 0 ], p.x ); z = num( a[ 1 ], p.z ); } else { x = num( a[ 0 ], p.x ); y = num( a[ 1 ], p.y ); z = num( a[ 2 ], p.z ); }
					} else {
						const place = this.findPlace( a.join( ' ' ) );
						if ( ! place ) return say( `No place called "${a.join( ' ' )}"`, 'err' );
						x = place.x; z = place.z;
						say( `Teleported to ${place.name}` );
					}
					if ( ! isFinite( x ) || ! isFinite( z ) ) return say( 'Bad coordinates', 'err' );
					this.teleport( x, y, z );
				},
			},
			time: {
				usage: '/time set <day|noon|sunset|night|midnight|sunrise|HH:MM> | add <hours> | freeze | unfreeze | speed <min/day> | query',
				desc: 'Time of day', args: [ () => [ 'set', 'add', 'freeze', 'unfreeze', 'speed', 'query' ], ( a ) => a[ 0 ] === 'set' ? [ 'day', 'noon', 'sunrise', 'sunset', 'night', 'midnight', '06:00', '12:00', '18:30' ] : a[ 0 ] === 'speed' ? [ '12', '24', '48', '96', '144' ] : [] ],
				run: ( a ) => {
					const T = g.time;
					const named = { day: 8, morning: 8, noon: 12, sunrise: 6.2, dawn: 5.8, sunset: 18.6, dusk: 19, night: 21, midnight: 0, evening: 17.5 };
					if ( a[ 0 ] === 'set' || ( a[ 0 ] && ( named[ a[ 0 ] ] !== undefined || /\d/.test( a[ 0 ] ) ) ) ) {
						const v = a[ 0 ] === 'set' ? a[ 1 ] : a[ 0 ];
						let h = named[ v ];
						if ( h === undefined && v ) { const m = v.match( /^(\d{1,2})(?::(\d{2}))?$/ ); if ( m ) h = + m[ 1 ] + ( + m[ 2 ] || 0 ) / 60; }
						if ( h === undefined || h > 24 ) return say( 'Usage: /time set noon | 18:30', 'err' );
						const day = Math.floor( T.hours / 24 );
						T.hours = day * 24 + h + ( h < g.hour ? 24 : 0 );
						return say( `Time set to ${fmtHour( h )}` );
					}
					if ( a[ 0 ] === 'add' ) { T.hours += parseFloat( a[ 1 ] ) || 1; return say( `Time is ${fmtHour( g.hour )}` ); }
					if ( a[ 0 ] === 'freeze' ) { g.timeFrozen = true; return say( 'Time frozen' ); }
					if ( a[ 0 ] === 'unfreeze' ) { g.timeFrozen = false; return say( 'Time resumes' ); }
					if ( a[ 0 ] === 'speed' ) { const m = parseFloat( a[ 1 ] ); if ( ! ( m > 0 ) ) return say( 'Usage: /time speed <real minutes per day>', 'err' ); T.dayMinutes = m; return say( `Day length ${m} min` ); }
					say( `Day ${g.day}, ${fmtHour( g.hour )} (a day lasts ${T.dayMinutes} min)`, 'sys' );
				},
			},
			weather: {
				usage: '/weather <clear|fair|cloudy|showers|overcast|storm> [lock]', desc: 'Weather', args: [ () => Object.keys( WEATHERS ), () => [ 'lock', 'unlock' ] ],
				run: ( a ) => {
					if ( a[ 0 ] === 'unlock' ) { g.weather.locked = false; return say( 'Weather unlocked' ); }
					if ( ! g.weather.set( a[ 0 ], true ) ) return say( 'Usage: ' + this.cmds.weather.usage, 'err' );
					g.weather.locked = a[ 1 ] === 'lock';
					say( `Weather: ${a[ 0 ]}${g.weather.locked ? ' (locked)' : ''}` );
				},
			},
			locate: {
				usage: '/locate <place | building type>', desc: 'Find a place or building', args: [ () => [ ...this.placeNames(), ...this.buildingTypes() ] ],
				run: ( a ) => {
					const q = a.join( ' ' );
					if ( ! q ) return say( this.cmds.locate.usage, 'err' );
					let found = null;
					const bt = this.buildingTypes().find( t => norm( t ) === norm( q ) || norm( t ) === norm( q ).replace( /s$/, '' ) );
					if ( bt && g.city?.locate ) found = g.city.locate( bt, g.player.pos );
					if ( ! found ) found = this.findPlace( q );
					if ( ! found ) return say( `Couldn't find "${q}"`, 'err' );
					const dx = found.x - g.player.pos.x, dz = found.z - g.player.pos.z;
					const d = Math.hypot( dx, dz );
					const bearing = ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360;
					say( `${found.name}: ${d > 1000 ? ( d / 1000 ).toFixed( 1 ) + ' km' : Math.round( d ) + ' m'} ${compass( bearing )} (${Math.round( bearing )}°) at ${Math.round( found.x )} ${Math.round( found.z )}. Marked on your map.` );
					g.markers?.add( { x: found.x, z: found.z, label: found.name, kind: 'locate' } );
				},
			},
			summon: {
				usage: '/summon <entity> [count]', desc: 'Spawn creature or vehicle', args: [ () => Object.keys( g.spawnables ), () => [ '1', '5', '10', '25' ] ],
				run: ( a ) => {
					const name = Object.keys( g.spawnables ).find( k => norm( k ) === norm( a[ 0 ] || '' ) );
					if ( ! name ) return say( `Unknown entity "${a[ 0 ] || ''}". Try: ${Object.keys( g.spawnables ).slice( 0, 12 ).join( ', ' )}`, 'err' );
					const n = Math.max( 1, Math.min( 50, parseInt( a[ 1 ] || '1', 10 ) || 1 ) );
					const p = g.player;
					for ( let i = 0; i < n; i ++ ) {
						const r = 4 + i * 0.6 + ( g.spawnables[ name ].distance || 0 );
						const ang = p.yaw + ( n > 1 ? ( i / n - 0.5 ) * 1.4 : 0 );
						const pos = new THREE.Vector3( p.pos.x - Math.sin( ang ) * r, 0, p.pos.z - Math.cos( ang ) * r );
						pos.y = g.physics.ground( pos.x, pos.z, p.pos.y + 3 ).y;
						try { g.spawnables[ name ].spawn( pos, { yaw: p.yaw + Math.PI, summoned: true } ); } catch ( e ) { console.error( e ); return say( 'Spawn failed: ' + e.message, 'err' ); }
					}
					say( `Summoned ${n} × ${name}` );
				},
			},
			gamemode: {
				usage: '/gamemode <survival|creative>', desc: 'Game mode', args: [ () => [ 'survival', 'creative' ] ],
				run: ( a ) => {
					const m = { s: 'survival', survival: 'survival', 0: 'survival', c: 'creative', creative: 'creative', 1: 'creative' }[ ( a[ 0 ] || '' ).toLowerCase() ];
					if ( ! m ) return say( this.cmds.gamemode.usage, 'err' );
					g.mode = m;
					if ( m === 'survival' ) { g.player.flying = false; g.player.noclip = false; }
					say( `Mode: ${m}` );
				},
			},
			kill: { usage: '/kill', desc: 'Die', run: () => { g.survival.health = 0; g.onPlayerDeath( 'suicide' ); } },
			heal: {
				usage: '/heal', desc: 'Full heal', run: () => {
					const S = g.survival; S.health = 100; S.blood = 5000; S.bleeding = 0; S.infected = false; S.infection = 0; S.fracture = false; S.splint = false; S.sick = 0; S.temp = 36.8; S.wet = 0; S.stamina = 100; S.breath = 100; S.pain = 0;
					say( 'Healed' );
				},
			},
			feed: { usage: '/feed', desc: 'Fill food, water, energy', run: () => { const S = g.survival; S.hunger = 100; S.thirst = 100; S.energy = 100; say( 'Fed' ); } },
			clear: {
				usage: '/clear [confirm]', desc: 'Empty your inventory', args: [ () => [ 'confirm' ] ],
				run: ( a ) => {
					if ( a[ 0 ] !== 'confirm' ) return say( 'Type /clear confirm', 'err' );
					const inv = g.player.inventory; inv.equip = {}; inv.weapons = {}; inv.pockets = []; inv.hands = null; inv.hotbar.fill( null ); inv.changed();
					say( 'Inventory cleared' );
				},
			},
			god: { usage: '/god', desc: 'Invulnerable', run: () => { g.survival.godMode = ! g.survival.godMode; say( `God mode ${g.survival.godMode ? 'on' : 'off'}` ); } },
			fly: { usage: '/fly', desc: 'Fly', run: () => { if ( g.mode !== 'creative' ) return say( 'Creative only', 'err' ); g.player.flying = ! g.player.flying; say( `Flying ${g.player.flying ? 'on' : 'off'}` ); } },
			noclip: { usage: '/noclip', desc: 'Fly through walls', run: () => { if ( g.mode !== 'creative' ) return say( 'Creative only', 'err' ); g.player.noclip = ! g.player.noclip; g.player.flying = g.player.noclip || g.player.flying; say( `No-clip ${g.player.noclip ? 'on' : 'off'}` ); } },
			speed: { usage: '/speed <multiplier>', desc: 'Flight speed', args: [ () => [ '0.5', '1', '2', '5', '10' ] ], run: ( a ) => { g.creativeSpeed = Math.max( 0.1, Math.min( 20, parseFloat( a[ 0 ] ) || 1 ) ); say( `Flight speed ×${g.creativeSpeed}` ); } },
			pos: { usage: '/pos', desc: 'Position', run: () => { const p = g.player.pos; say( `x ${p.x.toFixed( 1 )}  y ${p.y.toFixed( 1 )}  z ${p.z.toFixed( 1 )} — ${this.describe( p )}`, 'sys' ); } },
			seed: { usage: '/seed', desc: 'World seed', run: () => say( `Seed: ${g.seed}`, 'sys' ) },
			difficulty: { usage: '/difficulty <easy|normal|hard>', desc: 'Difficulty', args: [ () => [ 'easy', 'normal', 'hard' ] ], run: ( a ) => { if ( ! [ 'easy', 'normal', 'hard' ].includes( a[ 0 ] ) ) return say( 'Usage: /difficulty easy|normal|hard', 'err' ); g.difficulty = a[ 0 ]; g.save.difficulty = a[ 0 ]; say( `Difficulty: ${a[ 0 ]}` ); } },
			killall: {
				usage: '/killall [zombie|animal|vehicle|item]', desc: 'Remove nearby entities', args: [ () => [ 'zombie', 'animal', 'npc', 'vehicle', 'item' ] ],
				run: ( a ) => {
					let n = 0;
					for ( const e of g.entities.list ) {
						if ( a[ 0 ] ? e.type === a[ 0 ] : ( e.type === 'zombie' || e.type === 'animal' || e.type === 'npc' ) ) { if ( e.alive && e.type !== 'vehicle' && e.type !== 'item' ) e.damage?.( 1e6, { source: 'command', kind: 'command' } ); else g.entities.remove( e ); n ++; }
					}
					say( `Removed ${n}` );
				},
			},
			repair: { usage: '/repair', desc: 'Repair held item', run: () => { const s = g.player.inventory.heldStack(); if ( ! s ) return say( 'Nothing held', 'err' ); s.cond = 1; say( 'Repaired' ); } },
			ammo: {
				usage: '/ammo', desc: 'Refill ammo', run: () => {
					for ( const s of g.player.inventory.allStacks() ) {
						const d = getItem( s.id );
						if ( d.cat === 'magazine' ) s.data.rounds = d.magazine.capacity;
						if ( d.cat === 'firearm' ) {
							if ( d.firearm.feed === 'mag' ) { if ( ! s.data.mag && d.firearm.mags?.length ) s.data.mag = makeStack( d.firearm.mags[ 0 ], 1, { full: true } ); else if ( s.data.mag ) s.data.mag.data.rounds = getItem( s.data.mag.id ).magazine.capacity; s.data.chamber = 1; } else s.data.rounds = d.firearm.capacity;
						}
					}
					g.player.inventory.changed(); say( 'Reloaded' );
				},
			},
			save: { usage: '/save', desc: 'Save', run: async () => { await g.saveNow( true ); say( 'Saved' ); } },
			markers: { usage: '/markers clear', desc: 'Clear markers', args: [ () => [ 'clear' ] ], run: ( a ) => { if ( a[ 0 ] === 'clear' ) { g.markers?.clear(); say( 'Markers cleared' ); } } },
		};
	}

	// ---- places -----------------------------------------------------------------------------------

	places() {
		if ( this._places ) return this._places;
		const m = this.game.world.meta;
		const out = [];
		for ( const c of m.cities ) out.push( { name: c.name, x: c.x, z: c.z, kind: 'town' } );
		for ( const l of m.labels ) out.push( { name: l.name, x: l.x, z: l.z, kind: l.kind } );
		for ( const i of m.islands ) out.push( { name: i.name, x: i.x, z: i.z, kind: 'island' } );
		const alias = { oahu: 'Oʻahu', kauai: 'Kauaʻi', maui: 'Maui', bigisland: 'Hawaiʻi', hawaii: 'Hawaiʻi', molokai: 'Molokaʻi', lanai: 'Lānaʻi', niihau: 'Niʻihau', kahoolawe: 'Kahoʻolawe', kona: 'Kailua-Kona', waikiki: 'Waikīkī' };
		for ( const [ a, n ] of Object.entries( alias ) ) { const p = out.find( o => o.name === n ); if ( p ) out.push( { ...p, alias: a } ); }
		this._places = out;
		return out;
	}
	placeNames() { return [ ...new Set( this.places().map( p => p.alias || p.name.replace( /\s+/g, '_' ) ) ) ]; }
	findPlace( q ) {
		const n = norm( q.replace( /_/g, ' ' ) );
		if ( ! n ) return null;
		const ps = this.places();
		return ps.find( p => norm( p.alias || '' ) === n || norm( p.name ) === n ) || ps.find( p => norm( p.name ).startsWith( n ) ) || ps.find( p => norm( p.name ).includes( n ) ) || null;
	}
	buildingTypes() { return this.game.city?.types?.() || []; }

	describe( p ) {
		const hf = this.game.hf;
		const isl = this.game.world.meta.islands.find( i => i.id === hf.islandAt( p.x, p.z ) );
		let near = null, nd = Infinity;
		for ( const c of this.game.world.meta.cities ) { const d = Math.hypot( c.x - p.x, c.z - p.z ); if ( d < nd ) { nd = d; near = c; } }
		return `${isl ? isl.name : 'at sea'}${near ? `, ${nd < near.radius * 1.2 ? 'in' : Math.round( nd ) + ' m from'} ${near.name}` : ''}`;
	}

	teleport( x, y, z ) {
		const g = this.game, p = g.player;
		if ( p.vehicle ) g.vehicles?.exit?.( true );
		const gy = g.physics.ground( x, z, 1e5 ).y;
		p.pos.set( x, y === null ? Math.max( gy, g.physics.waterLevel( x, z ) - 1.4 ) + 0.1 : y, z );
		p.vel.set( 0, 0, 0 );
		p.fallStart = null;
		g.world.terrain.update( p.pos );
		// a storey that hasn't streamed in yet would otherwise push the player out of the building
		g.city?.relocate?.( p.pos );
	}

	resolveItem( q ) {
		if ( ! q ) return null;
		if ( ITEMS.has( q ) ) return q;
		const n = norm( q );
		for ( const [ id, d ] of ITEMS ) if ( norm( id ) === n || norm( d.name ) === n ) return id;
		for ( const [ id, d ] of ITEMS ) if ( norm( d.name ).startsWith( n ) || norm( id ).startsWith( n ) ) return id;
		return null;
	}

	// ---- running / completion ----------------------------------------------------------------------

	run( line ) {
		line = line.trim();
		if ( ! line ) return;
		this.history.push( line );
		if ( this.history.length > 100 ) this.history.shift();
		if ( ! line.startsWith( '/' ) ) { this.game.events.emit( 'chat', { text: `<You> ${line}`, kind: 'me' } ); return; }
		this.game.events.emit( 'chat', { text: line, kind: 'cmd' } );
		const [ name, ...args ] = line.slice( 1 ).split( /\s+/ );
		const c = this.cmds[ name.toLowerCase() ] || this.cmds[ { tele: 'tp', teleport: 'tp', i: 'give', item: 'give', gm: 'gamemode', w: 'weather', loc: 'locate', spawn: 'summon', where: 'pos' }[ name.toLowerCase() ] ];
		if ( ! c ) { this.say( `Unknown command /${name}. Type /help`, 'err' ); return; }
		const creativeOnly = [ 'give', 'tp', 'time', 'weather', 'summon', 'heal', 'feed', 'god', 'fly', 'noclip', 'killall', 'repair', 'ammo', 'speed' ];
		if ( creativeOnly.includes( name ) && this.game.save.hardcore ) { this.say( 'No cheats in hardcore', 'err' ); return; }
		if ( creativeOnly.includes( name ) && this.game.mode !== 'creative' ) this.game.stats.cheated = true;
		try { const r = c.run( args ); if ( r && r.catch ) r.catch( e => this.say( String( e.message || e ), 'err' ) ); } catch ( e ) { console.error( e ); this.say( 'Error: ' + e.message, 'err' ); }
	}

	// suggestions for the current input line
	complete( line ) {
		if ( ! line.startsWith( '/' ) ) return [];
		const parts = line.slice( 1 ).split( ' ' );
		if ( parts.length === 1 ) {
			const q = parts[ 0 ].toLowerCase();
			return Object.entries( this.cmds ).filter( ( [ k ] ) => k.startsWith( q ) ).map( ( [ k, c ] ) => ( { text: '/' + k, desc: c.desc, full: '/' + k + ' ' } ) );
		}
		const c = this.cmds[ parts[ 0 ].toLowerCase() ];
		if ( ! c || ! c.args ) return [];
		const ai = parts.length - 2;
		const gen = c.args[ Math.min( ai, c.args.length - 1 ) ];
		if ( ai >= c.args.length && c !== this.cmds.tp && c !== this.cmds.locate ) return [];
		const q = norm( parts[ parts.length - 1 ] );
		const opts = gen( parts.slice( 1, - 1 ) ) || [];
		const head = '/' + parts.slice( 0, - 1 ).join( ' ' ) + ' ';
		const scored = [];
		for ( const o of opts ) {
			const n = norm( o );
			const d = parts[ 0 ] === 'give' ? getItem( o )?.name : null;
			if ( ! q || n.startsWith( q ) || ( d && norm( d ).includes( q ) ) || ( q.length > 2 && n.includes( q ) ) ) scored.push( { text: o, desc: d || '', full: head + o + ' ', s: n.startsWith( q ) ? 0 : 1 } );
		}
		scored.sort( ( a, b ) => a.s - b.s || a.text.localeCompare( b.text ) );
		return scored.slice( 0, 40 );
	}
}

export function fmtHour( h ) {
	h = ( ( h % 24 ) + 24 ) % 24;
	const hh = Math.floor( h ), mm = Math.floor( ( h - hh ) * 60 );
	return String( hh ).padStart( 2, '0' ) + ':' + String( mm ).padStart( 2, '0' );
}
function compass( b ) { return [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][ Math.round( b / 45 ) % 8 ]; }
