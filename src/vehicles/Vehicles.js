// Vehicles ("like GTA"): cars, pickups, SUVs, vans, police cruisers, sports cars, jeeps, buses, Humvees and
// motorcycles on the roads; speedboats, fishing boats and jet skis in the harbours; tour helicopters and light
// aircraft at the airports. game.vehicles is the manager:
//   streaming    deterministic sites (spawner.js) and saved records become Vehicle entities within ~360 m of the
//                player, nearest first (at most MAX_ACTIVE), and go back to records (if touched) beyond ~440 m
//   driving      enter / exit / seats, the controls per kind, the camera (camera.js), the player kept in the seat,
//                the engine (start, hotwire, stall, fuel), lights and horn, noise for the infected, the HUD numbers
//   the world    running the infected over, knocking the player down, gas station pumps, jerrycans, repairs,
//                trunks and gloveboxes, flipping, pushing a boat off the sand
//   save         touched vehicles in save.world.vehicles (with the seat the player sat in)
// API: update(dt), enter(v, seat), exit(force), seatInteraction(), hud(), driving, known(), serialize(save),
// load(save), dispose(), summon(type, pos, opts), plus the hooks the vehicles call back (stall, onDestroyed, throwOff).
import * as THREE from 'three';
import { Vehicle, NO_INPUT } from './Vehicle.js';
import { SPECS, TYPES } from './specs.js';
import { loadModel, hasModel } from './models/index.js';
import { Spawner, vehicleState } from './spawner.js';
import { VehicleCamera } from './camera.js';
import { ensureVehicleSounds } from './sounds.js';
import { getItem } from '../game/items/ItemDB.js';

const V3 = THREE.Vector3;
const SPAWN_R = 360, DESPAWN_R = 450, MAX_ACTIVE = 40, PER_TICK = 4;
const REACH = 2.6;
const PUMP_RATE = 3.5; // litres per second from a gas pump
const CAN_RATE = 1.4; // ... from a jerrycan
const _v = new V3(), _w = new V3(), _o = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _ents = [], _boxes = [], _sites = [];
const clamp = ( x, a, b ) => x < a ? a : x > b ? b : x;
const AIR = { heli: 1, plane: 1 };

// problems that keep an engine from starting, as the seat prompt shows them
const PROBLEM = { burnt: 'Burnt out', dead: 'Engine wrecked', flooded: 'Engine flooded', battery: 'Dead battery', spark: 'Needs a spark plug', fuel: 'No fuel' };

export class Vehicles {
	constructor( game ) {
		this.game = game;
		this.spawner = null;
		try { this.spawner = new Spawner( game.world.meta, game.hf ); } catch ( e ) { console.error( 'vehicle sites', e ); }
		this.records = new Map(); // key -> saved record (touched vehicles not in the world right now)
		this.gone = new Set(); // site keys whose vehicle is gone for good
		this.skip = new Set(); // sites blocked by something this session
		this.active = new Map(); // key -> Vehicle
		this.list = [];
		this.pendingSummons = [];
		this.pendingEnter = null;
		this.driving = null; this.seat = - 1; this.isDriver = false;
		this.cam = new VehicleCamera( game );
		this.camPref = { car: 'first', bike: 'third', boat: 'third', heli: 'third', plane: 'third' };
		this.inp = { ...NO_INPUT };
		this.t = 0;
		this.streamT = 0;
		this.summonN = 0;
		this.pumpUsed = new Map(); // station -> litres pumped
		this.rollLoot = null;
		this.handlesImpacts = true; // the creatures module can leave running people over to us
		this.hornT = - 9; this.hornLoop = null; this.lastHornPress = - 9;
		this.startCd = 0;
		this.soundsOk = false;
		import( '../game/items/Loot.js' ).then( m => { this.rollLoot = m.rollLoot; } ).catch( () => {} );
		// the driven vehicle's headlights: one spot light, always in the scene so the light count (and every
		// shader) never changes; dark while unused
		this.spot = new THREE.SpotLight( 0xfff4e6, 0, 110, 0.72, 0.6, 1.4 );
		this.spot.castShadow = false;
		this.spot.visible = true;
		game.scene.add( this.spot, this.spot.target );
		this.unprovide = game.interact.addProvider( ( ray ) => this.provide( ray ) );
		this.offDeath = game.events.on( 'playerDeath', () => { if ( game.player.vehicle ) this.exit( true ); } );
		// the models people are most likely to meet first, built in the background
		for ( const [ i, t ] of [ 'sedan', 'pickup', 'suv', 'van', 'police_car', 'jeep', 'motorbike' ].entries() ) loadModel( SPECS[ t ].model, 5 + i );
	}

	// ---- queries -----------------------------------------------------------------------------------------------

	center() { return this.driving ? this.driving.pos : this.game.player.pos; }

	// vehicles the player has sat in, for the map: [ { pos: { x, z }, name, type } ]
	known() {
		const out = [];
		for ( const v of this.list ) if ( v.known && ! v.removed ) out.push( { pos: v.pos, name: v.name, type: v.typeName } );
		for ( const [ k, r ] of this.records ) if ( r.known && ! this.active.has( k ) ) out.push( { pos: { x: r.p[ 0 ], y: r.p[ 1 ], z: r.p[ 2 ] }, name: SPECS[ r.t ]?.name || r.t, type: r.t } );
		return out;
	}

	stats() { return { vehicles: this.list.length, awake: this.list.filter( v => ! v.sleeping ).length, records: this.records.size, sites: this.spawner?.sites.length || 0 }; }

	// ---- streaming ---------------------------------------------------------------------------------------------

	_stream() {
		const g = this.game, c = this.center();
		const sp = this.spawner;
		if ( sp ) sp.harbours( c.x, c.z, 2400 );
		// back to records beyond the despawn radius (never the one the player is in, nor a burning one)
		for ( const v of this.list.slice() ) {
			if ( v === this.driving || v.burning > 0 ) continue;
			const d = Math.hypot( v.pos.x - c.x, v.pos.z - c.z );
			if ( d > DESPAWN_R && ( v.sleeping || d > DESPAWN_R + 250 ) ) this._deactivate( v );
		}
		// what should be here, nearest first
		const cand = [];
		if ( sp ) for ( const s of sp.near( c.x, c.z, SPAWN_R, _sites ) ) {
			if ( this.active.has( s.key ) || this.records.has( s.key ) || this.gone.has( s.key ) || this.skip.has( s.key ) ) continue;
			cand.push( { d: Math.hypot( s.x - c.x, s.z - c.z ), site: s } );
		}
		for ( const [ k, r ] of this.records ) {
			if ( this.active.has( k ) ) continue;
			const d = Math.hypot( r.p[ 0 ] - c.x, r.p[ 2 ] - c.z );
			if ( d < SPAWN_R ) cand.push( { d: d - 60, rec: r } ); // the player's own cars first
		}
		cand.sort( ( a, b ) => a.d - b.d );
		let made = 0;
		for ( const cd of cand ) {
			if ( this.list.length >= MAX_ACTIVE ) {
				// full: trade the farthest untouched parked vehicle for a nearer one
				let far = null, fd = cd.d + 40;
				for ( const v of this.list ) {
					if ( v === this.driving || v.touched || ! v.sleeping ) continue;
					const d = Math.hypot( v.pos.x - c.x, v.pos.z - c.z );
					if ( d > fd ) { fd = d; far = v; }
				}
				if ( ! far ) break;
				this._deactivate( far );
			}
			const type = cd.rec ? cd.rec.t : cd.site.type;
			if ( ! SPECS[ type ] ) { if ( cd.rec ) this.records.delete( cd.rec.k ); continue; }
			const model = SPECS[ type ].model;
			if ( ! hasModel( model ) ) { loadModel( model, 1 + cd.d / 100 ); continue; }
			if ( made >= PER_TICK ) break;
			this._activate( cd.rec, cd.site );
			made ++;
		}
		// sites placed before the street furniture around them streamed in: check them again, unseen
		for ( const v of this.list ) {
			if ( ! v.validateAt || this.t < v.validateAt ) continue;
			v.validateAt = 0;
			if ( v.touched || v === this.driving ) continue;
			const d = g.camera.position.distanceTo( v.pos );
			if ( d > 70 && this._blocked( v ) ) { this.skip.add( v.key ); this._deactivate( v ); }
		}
	}

	_activate( rec, site ) {
		const g = this.game;
		let v;
		try {
			if ( rec ) {
				v = Vehicle.fromRecord( g, rec );
				if ( rec.run || rec.v ) this._restoreMotion( v, rec );
			} else {
				const st = vehicleState( site );
				v = new Vehicle( g, site.type, {
					key: site.key, site: site.key, look: st.look, fuel: st.fuel, health: st.health, crack: st.crack, needs: st.needs, keysIn: st.keysIn,
					pos: new V3( site.x, g.physics.ground( site.x, site.z, 1e4 ).y, site.z ), yaw: site.yaw,
				} );
				for ( const i of st.flat ) if ( i < v.wheels.length ) { v.tyres[ i ] = 1; v.wheels[ i ].flat = true; }
				v.settle();
				if ( this._blocked( v ) ) { this.skip.add( site.key ); v.visual.dispose(); return null; }
				v.validateAt = this.t + 3;
			}
		} catch ( e ) {
			console.error( 'vehicle', rec?.t || site?.type, e );
			if ( site ) this.skip.add( site.key ); else if ( rec ) this.records.delete( rec.k );
			return null;
		}
		this.records.delete( v.key );
		this._addBoxes( v );
		g.entities.add( v );
		this.active.set( v.key, v );
		this.list.push( v );
		return v;
	}

	_deactivate( v ) {
		if ( v.touched && ! v.removed ) this.records.set( v.key, v.serialize() );
		this._forget( v );
		this.game.entities.remove( v );
	}

	_forget( v ) {
		this.active.delete( v.key );
		const i = this.list.indexOf( v );
		if ( i >= 0 ) this.list.splice( i, 1 );
	}

	// a saved vehicle that was moving (the one the player sat in when the game was saved)
	_restoreMotion( v, r ) {
		if ( r.v ) v.body.v.fromArray( r.v );
		if ( r.w ) v.body.w.fromArray( r.w );
		v.engine.running = !! r.run && ! v.burnt;
		v.rotor = r.rot || 0;
		v.throttleSet = r.thr || 0;
		if ( v.engine.running ) v.engine.rpm = v.spec.engine.idle || 1;
		v.wake();
	}

	// ---- collision boxes (the player and the infected bump into vehicles; bullets still hit the entity first) ------

	_localBoxes( v ) {
		const b = v.bounds, k = v.kind;
		if ( k === 'heli' ) return [ [ 0, 1.65, - 0.35, 1.02, 1.05, 2.05 ], [ 0, 2.0, 4.3, 0.22, 0.32, 2.6 ] ];
		if ( k === 'plane' ) return [ [ 0, 1.45, 0.9, 0.52, 0.62, 3.4 ], [ 0, 2.26, - 0.2, 5.4, 0.1, 0.78 ] ];
		const cx = ( b.min.x + b.max.x ) / 2, cz = ( b.min.z + b.max.z ) / 2;
		const y0 = k === 'boat' ? b.min.y : Math.max( b.min.y, 0.18 ), y1 = b.max.y - 0.05;
		const inset = k === 'bike' ? 0.12 : 0.1;
		return [ [ cx, ( y0 + y1 ) / 2, cz, ( b.max.x - b.min.x ) / 2 - inset, ( y1 - y0 ) / 2, ( b.max.z - b.min.z ) / 2 - inset ] ];
	}

	_addBoxes( v ) {
		const P = this.game.physics;
		v.boxLocal = this._localBoxes( v );
		for ( const l of v.boxLocal ) {
			v.body.toWorld( _v.set( l[ 0 ], l[ 1 ], l[ 2 ] ), _w );
			v.boxes.push( P.add( { x: _w.x, y: _w.y, z: _w.z, hx: l[ 3 ], hy: l[ 4 ], hz: l[ 5 ], yaw: v.yaw, mat: 'metal', kind: 'solid', owner: v } ) );
		}
		v.boxAt = v.pos.clone(); v.boxYaw = v.yaw;
	}

	_updateBoxes( v ) {
		if ( v.boxAt.distanceToSquared( v.pos ) < 4e-4 && Math.abs( v.boxYaw - v.yaw ) < 0.004 ) return;
		const P = this.game.physics;
		v.boxes.forEach( ( bx, i ) => {
			const l = v.boxLocal[ i ];
			v.body.toWorld( _v.set( l[ 0 ], l[ 1 ], l[ 2 ] ), _w );
			bx.x = _w.x; bx.y = _w.y; bx.z = _w.z; bx.yaw = v.yaw;
			P.update( bx );
		} );
		v.boxAt.copy( v.pos ); v.boxYaw = v.yaw;
	}

	// does the vehicle's footprint overlap something solid (street furniture, a wreck, a wall, another vehicle)?
	_blocked( v ) {
		const P = this.game.physics;
		const ls = this._localBoxes( v );
		const y = v.pos.y;
		for ( const l of ls ) {
			v.body.toWorld( _v.set( l[ 0 ], l[ 1 ], l[ 2 ] ), _w );
			const c = Math.cos( v.yaw ), s = Math.sin( v.yaw );
			const r = Math.hypot( l[ 3 ], l[ 5 ] );
			for ( const b of P.near( _w.x, _w.z, r, _boxes ) ) {
				if ( b.owner === v ) continue;
				if ( b.maxY < y + 0.35 || b.minY > _w.y + l[ 4 ] ) continue; // kerbs, ramps, floors under it; branches over it
				if ( obbOverlap( _w.x, _w.z, l[ 3 ] - 0.05, l[ 5 ] - 0.05, c, s, b ) ) return true;
			}
		}
		return false;
	}

	// ---- summoning (/summon) ---------------------------------------------------------------------------------------

	summon( type, pos, o = {} ) {
		const spec = SPECS[ type ];
		if ( ! spec ) return null;
		if ( ! hasModel( spec.model ) ) {
			this.pendingSummons.push( { type, pos: pos.clone(), o } );
			loadModel( spec.model, 0 ).then( () => this._flushSummons() ).catch( e => console.error( e ) );
			return null;
		}
		return this._summonNow( type, pos, o );
	}

	_flushSummons() {
		const left = [];
		for ( const s of this.pendingSummons ) {
			if ( hasModel( SPECS[ s.type ].model ) ) this._summonNow( s.type, s.pos, s.o );
			else left.push( s );
		}
		this.pendingSummons = left;
	}

	_summonNow( type, pos, o ) {
		const g = this.game, spec = SPECS[ type ], p = g.player;
		const r = Math.random;
		// side-on to the player, the driver's door towards them
		const yaw = ( o.yaw !== undefined ? o.yaw - Math.PI : p.yaw ) + Math.PI / 2;
		const at = pos.clone();
		const dir = new V3( at.x - p.pos.x, 0, at.z - p.pos.z );
		if ( dir.lengthSq() < 1e-4 ) dir.set( - Math.sin( p.yaw ), 0, - Math.cos( p.yaw ) );
		dir.normalize();
		// big ones further out; boats look for water ahead
		const extra = { bus: 5, plane: 7, helicopter: 6, fishing_boat: 4, van: 1, humvee: 1 }[ type ] || 0;
		at.addScaledVector( dir, extra );
		if ( spec.kind === 'boat' ) {
			for ( let d = 0; d < 120; d += 3 ) {
				const x = at.x + dir.x * d, z = at.z + dir.z * d;
				if ( g.hf.heightAt( x, z ) < ( type === 'fishing_boat' ? - 2 : - 1.2 ) ) { at.set( x, 0, z ); break; }
			}
		}
		at.y = g.physics.ground( at.x, at.z, Math.max( p.pos.y, at.y ) + 4 ).y;
		const paints = spec.paints || [ 0xb0b4b8 ];
		const look = {
			paint: paints[ Math.floor( r() * paints.length ) ], paint2: spec.paints2 ? spec.paints2[ Math.floor( r() * spec.paints2.length ) ] : 0xf2f2f0,
			metallic: spec.metallic ? spec.metallic[ 0 ] + r() * ( spec.metallic[ 1 ] - spec.metallic[ 0 ] ) : 0.3, dirt: 0.04, gdirt: 0.03,
		};
		const key = `u:${Date.now().toString( 36 )}:${this.summonN ++}`;
		const v = new Vehicle( g, type, { key, look, fuel: spec.fuel.tank, health: spec.health, keysIn: true, touched: true, persistent: true, summoned: true, known: true, pos: at, yaw } );
		v.settle();
		// step out of anything in the way
		for ( let i = 0; i < 16 && this._blocked( v ); i ++ ) {
			at.addScaledVector( dir, 2.5 );
			at.y = g.physics.ground( at.x, at.z, at.y + 4 ).y;
			v.setPose( at, null, yaw );
			v.settle();
		}
		this._addBoxes( v );
		g.entities.add( v );
		this.active.set( key, v );
		this.list.push( v );
		return v;
	}

	// ---- per frame ---------------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game, p = g.player;
		this.t += dt;
		if ( ! this.soundsOk ) this.soundsOk = ensureVehicleSounds( g.audio );
		// vehicles removed from outside (/killall): gone for good
		for ( const v of this.list.slice() ) if ( v.removed ) { this._forget( v ); this.gone.add( v.key ); this.records.delete( v.key ); if ( v === this.driving ) this._clearSeat( true ); }
		// the seat the player was saved in
		if ( this.pendingEnter ) this._resumeSeat();
		this.streamT -= dt;
		if ( this.streamT <= 0 ) { this.streamT = 0.5; try { this._stream(); } catch ( e ) { console.error( 'vehicle streaming', e ); } }
		if ( this.pendingSummons.length ) this._flushSummons();
		const v = this.driving;
		this.startCd = Math.max( 0, this.startCd - dt );
		// the driver's controls
		const I = this.inp;
		Object.assign( I, NO_INPUT );
		if ( v && this.isDriver && g.inputActive && ! g.dead ) this._controls( v, I );
		else this._horn( null, false );
		// physics and the systems of every vehicle in the world
		const camPos = g.camera.position;
		const night = g.world.sky?.night ?? 0;
		for ( const u of this.list ) {
			if ( u.removed ) continue;
			if ( u.startT > 0 ) { u.startT -= dt; if ( u.startT <= 0 ) this._running( u ); }
			if ( ! u.sleeping ) {
				u.simulate( dt, u === v && this.isDriver ? I : null );
				this._burn( u, dt );
				this._noise( u, dt );
				this._hits( u );
				this._updateBoxes( u );
			}
			if ( u.removed ) continue;
			u.updateLamps( this.t, night );
			u.updateEffects( dt, camPos );
		}
		// the player rides along (drawn in the seat: whole from outside, without the head from inside)
		if ( v && p.vehicle && ! v.removed ) {
			this._ride( v, dt );
			if ( this.driving === v ) v.visual.setRider( v.seats, v.kind, this.seat, this.cam.mode === 'third' );
		}
		for ( const u of this.list ) {
			if ( u.removed ) continue;
			const inside = u === v && this.cam.mode === 'first';
			u.updateVisual( dt, camPos, u === v );
			u.updateSounds( dt, camPos, inside );
		}
		this._lights( v, night );
	}

	// ---- the controls ------------------------------------------------------------------------------------------------

	_controls( v, I ) {
		const g = this.game, input = g.input;
		const busy = g.actions.busy;
		if ( ! busy ) {
			I.forward = input.is( 'forward' ); I.back = input.is( 'back' );
			I.left = input.is( 'left' ); I.right = input.is( 'right' );
			I.steer = ( I.left ? 1 : 0 ) - ( I.right ? 1 : 0 );
			I.hand = input.is( 'handbrake' );
			I.up = input.is( 'vehicleUp' ); I.down = input.is( 'vehicleDown' );
			I.rollL = input.is( 'leanLeft' ); I.rollR = input.is( 'leanRight' );
			if ( v.kind === 'heli' || v.kind === 'plane' ) I.hand = false;
		}
		// a stopped engine starts with the throttle (or the collective)
		const wants = I.forward || I.back || ( AIR[ v.kind ] && I.up );
		if ( wants && ! v.engine.running && ! ( v.startT > 0 ) && ! busy && this.startCd <= 0 ) this.tryStart( v );
		if ( input.pressed( 'camera' ) ) { this.cam.toggle( v ); this.camPref[ v.kind ] = this.cam.mode; }
		if ( input.pressed( 'headlights' ) ) {
			v.lights = ! v.lights;
			g.audio?.play( 'switch_mode', { pos: v.pos, vol: 0.4 } );
		}
		// hotwiring: the interact key stops it (the next press gets you out)
		if ( busy && g.actions.current?.vehicle === v && input.pressed( 'interact' ) ) { g.actions.cancel(); return; }
		this._horn( v, input.is( 'horn' ) && ! busy, input.pressed( 'horn' ) );
	}

	_horn( v, on, pressed = false ) {
		const g = this.game;
		if ( v && pressed ) {
			// a double tap works the siren and the light bar
			if ( v.spec.siren && this.t - this.lastHornPress < 0.35 ) { v.siren = ! v.siren; on = false; this.hornT = - 9; }
			this.lastHornPress = this.t;
		}
		if ( on && v && ! v.burnt && ! v.needs.battery ) {
			if ( ! this.hornLoop && g.audio?.ctx ) {
				const low = v.kind === 'boat' || v.typeName === 'bus' || v.typeName === 'humvee';
				this.hornLoop = g.audio.loop( low ? 'veh_horn_low' : 'veh_horn', { pos: v.pos, vol: 0.7, bus: 'sfx', ref: 10 } );
			}
			this.hornLoop?.set( 0.7, 1, v.pos );
			if ( this.t - this.hornT > 0.5 ) { this.hornT = this.t; g.events.emit( 'noise', { pos: v.pos.clone(), radius: 170, source: g.player, kind: 'horn' } ); }
		} else if ( this.hornLoop ) { this.hornLoop.stop(); this.hornLoop = null; }
	}

	// ---- engine, fuel, noise ----------------------------------------------------------------------------------------

	tryStart( v ) {
		const g = this.game;
		this.startCd = 2.5;
		const pb = v.startProblem( g.player );
		if ( ! pb ) {
			g.audio?.play( 'engine_start', { pos: v.pos, vol: 0.8, max: 150, rate: v.kind === 'bike' ? 1.4 : v.kind === 'heli' ? 0.8 : 1 } );
			v.startT = AIR[ v.kind ] ? 1.2 : 0.75;
			return true;
		}
		if ( pb === 'keys' ) { this.hotwire( v ); return false; }
		// the starter turns over (or just clicks with a flat battery)
		if ( pb === 'battery' || pb === 'burnt' ) g.audio?.play( 'switch_mode', { pos: v.pos, vol: 0.5, rate: 0.6 } );
		else g.audio?.play( 'veh_crank', { pos: v.pos, vol: 0.7 } );
		if ( v === this.driving ) g.toast( PROBLEM[ pb ], 'warn' );
		return false;
	}

	_running( v ) {
		if ( v.burnt || v.startProblem( this.game.player ) === 'fuel' ) return;
		v.engine.running = true;
		v.engine.rpm = v.spec.engine.idle || 1;
		if ( v.engine.gear === 0 ) v.engine.gear = 1;
		v.wake();
	}

	hotwire( v ) {
		const g = this.game;
		const tools = g.player.inventory.hasTool?.( 'toolbox' ) || g.player.inventory.hasTool?.( 'multitool' ) || g.player.inventory.find?.( s => s.id === 'multitool' || s.id === 'toolbox' );
		const a = g.actions.start( {
			label: 'Hotwiring', time: tools ? 3.5 : 6, cancelOnMove: false,
			onDone: () => { if ( v === this.driving && ! v.removed ) { v.hotwired = true; v.touch(); this.startCd = 0; this.tryStart( v ); } },
		} );
		if ( a ) a.vehicle = v;
	}

	// an engine that dies: out of fuel, flooded, wrecked
	stall( v, why ) {
		if ( ! v.engine.running && ! ( v.startT > 0 ) ) return;
		v.engine.running = false; v.startT = 0;
		if ( v === this.driving && why ) this.game.toast( why, 'warn' );
	}

	_burn( v, dt ) {
		if ( ! v.engine.running ) return;
		const F = v.spec.fuel;
		if ( this.game.mode !== 'creative' ) v.fuel = Math.max( 0, v.fuel - ( F.idleBurn + F.burn * ( v.kind === 'heli' ? v.throttle : v.throttle * v.throttle * 0.7 + v.throttle * 0.3 ) ) * dt );
		if ( v.fuel <= 0 ) this.stall( v, 'Out of fuel' );
		else if ( v.health < v.maxHealth * 0.08 && Math.random() < dt * 0.08 ) this.stall( v, 'Engine stalled' );
		else if ( v.flooded ) this.stall( v, 'Engine flooded' );
	}

	// the infected hear engines: louder with the revs, a long way for rotors and propellers
	_noise( v, dt ) {
		const on = v.engine.running || v.rotor > 0.3;
		if ( ! on && ! v.siren ) return;
		v.noiseT -= dt;
		if ( v.noiseT > 0 ) return;
		v.noiseT = 1;
		const g = this.game, E = v.spec.engine;
		const rpmK = v.kind === 'heli' ? v.rotor : clamp( v.engine.rpm / ( E.redline || 1 ), 0, 1 );
		let r = { heli: 320, plane: 380, boat: 90 }[ v.kind ] ?? ( E.sound === 'engine_truck' ? 70 : v.kind === 'bike' ? 65 : 50 );
		r *= 0.7 + rpmK * 0.6;
		if ( v.siren && ! v.needs.battery ) r = Math.max( r, 350 );
		if ( ! on && ! v.siren ) return;
		g.events.emit( 'noise', { pos: v.pos.clone(), radius: r, source: v.driver ? g.player : v, kind: 'engine' } );
	}

	// ---- running into things with a body: the infected, animals, survivors, the player on foot -------------------------

	_hits( v ) {
		const speed = v.speed;
		if ( speed < 2.5 || v.kind === 'plane' && v.altitudeAGL > 3 ) return;
		const g = this.game, b = v.body, bb = v.bounds;
		const org = b.origin( _o );
		_q.copy( b.q ).invert();
		const src = v.driver ? g.player : v;
		const test = ( pos, r, h ) => {
			const l = _v.subVectors( pos, org ).applyQuaternion( _q );
			if ( l.x < bb.min.x - r || l.x > bb.max.x + r || l.z < bb.min.z - r || l.z > bb.max.z + r ) return 0;
			if ( l.y + h < bb.min.y + 0.1 || l.y > bb.max.y ) return 0;
			// how fast that part of the vehicle closes on the body
			_d.set( pos.x - b.pos.x, 0, pos.z - b.pos.z ).normalize();
			b.pointVel( _w.set( pos.x, pos.y + h * 0.5, pos.z ), _w );
			return _w.x * _d.x + _w.z * _d.z;
		};
		for ( const e of g.entities.near( v.pos, v.radius + 1.5, null, _ents ) ) {
			if ( e === v || ! e.alive || e.removed || ( e.type !== 'zombie' && e.type !== 'animal' && e.type !== 'npc' ) ) continue;
			if ( this.t - ( e._vehHitT ?? - 9 ) < 0.8 ) continue;
			// the creatures module may have rammed it this frame already (it runs first)
			if ( g.creatures && g.creatures.time - ( e.vehicleHitT ?? - 10 ) < 0.9 ) continue;
			const closing = test( e.pos, e.radius || 0.35, e.height || 1.8 );
			if ( closing < 2.2 ) continue;
			e._vehHitT = this.t;
			if ( g.creatures ) e.vehicleHitT = g.creatures.time; // the creatures module skips its own ram check for a second
			const dir = _d.clone().multiplyScalar( 1 ).setY( 0.25 ).normalize();
			const point = new V3( e.pos.x, e.pos.y + ( e.height || 1.8 ) * 0.55, e.pos.z );
			const dmg = closing * closing * 1.3 * ( v.spec.mass > 3000 ? 1.4 : v.kind === 'bike' ? 0.7 : 1 );
			e.damage( dmg, { source: src, kind: 'vehicle', dir, zone: 'torso', weapon: 'vehicle', point } );
			const killed = ! e.alive;
			g.events.emit( 'damage', { target: e, amount: dmg, source: src, zone: 'torso', kind: 'vehicle' } );
			if ( killed ) g.events.emit( 'kill', { target: e, source: src, weapon: 'vehicle' } );
			if ( src === g.player && killed ) g.events.emit( 'hitmarker', { kill: true, headshot: false } );
			if ( ! killed ) e.knockback?.( dir, closing * 0.7 );
			// the body takes some of the vehicle's speed and dents it
			const m = e.type === 'animal' ? ( e.size || 1 ) * 70 : 75;
			b.v.addScaledVector( _d, - closing * Math.min( 0.5, m / v.spec.mass ) );
			v.damage( Math.min( 30, closing * m / 180 ), { kind: 'impact', source: e } );
			g.audio?.play( 'hit_flesh', { pos: point, vol: 1, max: 70 } );
			if ( closing > 10 ) g.audio?.play( 'crash', { pos: point, vol: 0.45, max: 70, rate: 1.3 } );
			g.fx?.blood?.( point, dir, 1.5 );
			if ( v === this.driving ) g.player.shake = Math.max( g.player.shake || 0, Math.min( 0.6, closing / 20 ) );
		}
		// the player, on foot
		const P = g.player;
		if ( ! P.vehicle && P.alive !== false && ! g.dead && this.t - ( this.playerHitT || - 9 ) > 0.8 ) {
			const closing = test( P.pos, 0.3, P.height || 1.8 );
			if ( closing > 2.5 ) {
				this.playerHitT = this.t;
				const dir = _d.clone().setY( 0.3 ).normalize();
				g.survival?.hurt( closing * closing * 0.9, 'vehicle', { dir, cause: 'a vehicle' } );
				P.vel?.addScaledVector( dir, closing * 0.8 );
				P.shake = Math.max( P.shake || 0, 0.8 );
				g.audio?.play( 'hit_flesh', { pos: P.pos, vol: 1 } );
			}
		}
	}

	// ---- in the seat ------------------------------------------------------------------------------------------------

	enter( v, seatIndex = 0, o = {} ) {
		const g = this.game, p = g.player;
		if ( ! v || v.burnt || v.removed || this.driving ) return false;
		let i = seatIndex;
		if ( ! v.seats[ i ] || v.occupant[ i ] ) i = v.occupant.findIndex( ( x, k ) => ! x && v.seats[ k ] );
		if ( i < 0 ) return false;
		const seat = v.seats[ i ];
		g.actions.cancel();
		p.vehicle = { vehicle: v, seat: i, driver: !! seat.driver };
		this.driving = v; this.seat = i; this.isDriver = !! seat.driver;
		v.occupant[ i ] = p;
		if ( seat.driver ) v.driver = p;
		v.touch(); v.known = true; v.wake();
		if ( v.kind === 'bike' ) v.lean = v.upY() > 0.8 ? 0 : v.lean;
		p.stance = 'stand'; p.vel.set( 0, 0, 0 ); p.swimming = false; p.underwater = false; p.flying = false; p.fallStart = null;
		this.cam.mode = this.camPref[ v.kind ] || 'first';
		this.cam.reset( v );
		if ( ! o.restore ) g.audio?.play( v.spec.open ? 'vault' : 'veh_door', { pos: v.pos, vol: 0.55 } );
		if ( seat.driver && ! v.engine.running && ! o.restore ) { this.startCd = 0; this.tryStart( v ); }
		this._ride( v, 0.016 );
		g.events.emit( 'vehicle:enter', { vehicle: v, seat: i } );
		return true;
	}

	// leave the seat; `force` skips the checks (teleports, death)
	exit( force = false ) {
		const g = this.game, p = g.player;
		if ( ! p.vehicle ) return false;
		const v = this.driving;
		if ( ! v || v.removed ) { this._clearSeat( true ); return true; }
		const air = AIR[ v.kind ] && v.altitudeAGL > 2.5;
		const speed = v.speed;
		const bail = speed > ( v.kind === 'boat' ? 5 : 6 ) || air;
		const spot = this._exitSpot( v, this.seat, force || bail );
		if ( ! spot ) { g.toast( 'No room to get out', 'warn' ); return false; }
		g.actions.cancel();
		const camYaw = p.yaw;
		this._clearSeat( false );
		p.pos.copy( spot );
		p.vel.set( 0, 0, 0 );
		p.onGround = false;
		p.fallStart = null;
		p.yaw = camYaw; p.pitch = clamp( p.pitch, - 0.6, 0.6 );
		if ( bail ) {
			// thrown out with the vehicle's speed; the ground does the rest
			p.vel.copy( v.body.v ).multiplyScalar( 0.6 );
			if ( air ) p.fallStart = p.pos.y;
			if ( ! air && speed > 6 && ! force ) g.survival?.hurt( Math.pow( speed - 5, 1.5 ) * 2.2, 'fall', { cause: 'jumping from a vehicle' } );
		} else {
			// park it: engine off (the bike on its side stand)
			this.stall( v );
			v.rotor = Math.min( v.rotor, 0.99 );
			if ( v.kind === 'bike' && v.upY() > 0.8 && speed < 2 ) { v.lean = 0.16; v.settle(); v.sleeping = true; }
		}
		g.audio?.play( v.spec.open ? 'vault' : 'veh_door', { pos: v.pos, vol: 0.55, rate: 0.9 } );
		g.events.emit( 'vehicle:exit', { vehicle: v } );
		return true;
	}

	_clearSeat( resetPlayer ) {
		const g = this.game, p = g.player, v = this.driving;
		if ( v ) {
			const i = this.seat;
			v.visual.setRider( v.seats, v.kind, - 1 );
			if ( v.occupant[ i ] === p ) v.occupant[ i ] = null;
			if ( v.driver === p ) v.driver = null;
			v.wake();
		}
		p.vehicle = null;
		this.driving = null; this.seat = - 1; this.isDriver = false;
		this._horn( null, false );
		if ( resetPlayer ) { p.vel.set( 0, 0, 0 ); p.fallStart = null; }
		p.stanceH = 1.66;
	}

	// a free place beside the seat's door (then the other side, behind, in front, on top); in the water off a boat
	_exitSpot( v, seatIndex, anywhere = false ) {
		const g = this.game, P = g.physics, b = v.body;
		const seat = v.seats[ seatIndex ] || v.seats[ 0 ];
		const bb = v.bounds;
		const side = seat.exit || - 1;
		const hw = ( bb.max.x - bb.min.x ) / 2;
		const z = seat.pos[ 2 ];
		const cands = [
			[ side * ( hw + 0.5 ), z ], [ - side * ( hw + 0.5 ), z ], [ side * ( hw + 0.5 ), z + 1 ], [ side * ( hw + 0.5 ), z - 1 ],
			[ 0, bb.max.z + 0.7 ], [ 0, bb.min.z - 0.7 ], [ side * ( hw + 1.4 ), z ], [ - side * ( hw + 1.4 ), z ],
		];
		const hip = b.toWorld( _o.set( ...seat.pos ), new V3() );
		const test = new V3();
		for ( const [ x, zz ] of cands ) {
			const w = b.toWorld( _v.set( x, seat.pos[ 1 ], zz ), new V3() );
			const water = P.waterLevel( w.x, w.z );
			const gy = P.ground( w.x, w.z, hip.y + 0.6, 0.45, 0.3 ).y;
			const deep = water - g.hf.heightAt( w.x, w.z ) > 1.35;
			let y = deep ? Math.max( gy, water - 1.45 ) : gy;
			if ( AIR[ v.kind ] && v.altitudeAGL > 2.5 ) y = Math.max( y, hip.y - 1 ); // out into the air
			if ( ! anywhere && ! deep && hip.y - y > 2.2 ) continue; // a drop off a cliff or a bridge
			if ( y - hip.y > 1.2 ) continue; // a wall of rock
			test.set( w.x, y, w.z );
			const before = test.clone();
			P.resolveCylinder( test, 0.3, 1.7, 0.45 );
			if ( test.distanceToSquared( before ) > 0.01 ) continue;
			return test.clone();
		}
		if ( anywhere ) {
			// on the roof as a last resort
			const top = b.toWorld( _v.set( 0, bb.max.y + 0.05, z ), new V3() );
			return top;
		}
		return null;
	}

	// the player sits in the seat: position, the camera, the compass heading, under water in a sinking car
	_ride( v, dt ) {
		const g = this.game, p = g.player;
		const seat = v.seats[ this.seat ];
		if ( ! seat ) return;
		const [ mx, my ] = g.inputActive ? g.input.consumeMouse() : [ 0, 0 ];
		const look = this.cam.update( dt, v, seat, mx, my );
		const hip = _v.set( ...seat.pos ).applyQuaternion( v.object.quaternion ).add( v.object.position );
		p.pos.set( hip.x, hip.y - 0.45, hip.z );
		p.vel.copy( v.body.v );
		p.yaw = look.yaw; p.pitch = look.pitch;
		const eye = _w.set( ...seat.eye ).applyQuaternion( v.object.quaternion ).add( v.object.position );
		p.stanceH = eye.y - p.pos.y;
		p.onGround = true; p.fallStart = null; p.swimming = false;
		const water = g.physics.waterLevel( eye.x, eye.z );
		p.underwater = eye.y < water - 0.05 && g.hf.heightAt( eye.x, eye.z ) < water;
		// a rider on something open gets wet in a sinking boat, a crash throws a biker clear
		if ( v.kind === 'bike' && v.upY() < 0.45 ) this.exit( true );
	}

	// get back into the seat the game was saved in (the model may still be building)
	_resumeSeat() {
		const pe = this.pendingEnter, g = this.game;
		pe.t = ( pe.t || 0 ) + 1;
		const rec = this.records.get( pe.k );
		const v = this.active.get( pe.k );
		if ( v ) { this.pendingEnter = null; g.player.vehicle = null; this.enter( v, pe.seat, { restore: true } ); return; }
		if ( ! rec || pe.t > 1200 ) { this.pendingEnter = null; g.player.vehicle = null; return; }
		const model = SPECS[ rec.t ]?.model;
		if ( ! model ) { this.pendingEnter = null; g.player.vehicle = null; return; }
		if ( ! hasModel( model ) ) { loadModel( model, 0 ); return; }
		const nv = this._activate( rec, null );
		this.pendingEnter = null;
		g.player.vehicle = null;
		if ( nv ) this.enter( nv, pe.seat, { restore: true } );
	}

	// F while seated: the glovebox when looking at it, else get out
	seatInteraction() {
		const g = this.game, v = this.driving;
		if ( ! v ) return null;
		if ( v.speed < 1 && v.spec.containers.glovebox && this.cam.mode === 'first' && this._lookingAtGlovebox( v ) ) {
			return { id: 'veh-glove-' + v.id, t: 0.5, label: v.kind === 'car' ? 'Search glovebox' : 'Search console', action: () => this.openContainer( v, 'glovebox' ) };
		}
		const air = AIR[ v.kind ] && v.altitudeAGL > 2.5;
		const bail = air || v.speed > ( v.kind === 'boat' ? 5 : 6 );
		let sub;
		if ( this.isDriver && ! v.engine.running && ! ( v.startT > 0 ) ) {
			const pb = v.startProblem( g.player );
			sub = pb && pb !== 'keys' ? PROBLEM[ pb ] : undefined;
		}
		return { id: 'veh-exit-' + v.id, t: 0.5, label: bail ? 'Jump out' : 'Exit', sub, action: () => this.exit() };
	}

	_lookingAtGlovebox( v ) {
		const P = v.model.P, cam = this.game.camera;
		let local;
		if ( v.kind === 'car' && P.steer && P.driver ) local = _o.set( - P.driver.x, P.steer.y - 0.14, - ( P.steer.f + 0.17 ) );
		else {
			// boats and aircraft: the console in front of the seat, low
			const s = v.seats[ this.seat ];
			local = _o.set( s.eye[ 0 ], s.eye[ 1 ] - 0.55, s.eye[ 2 ] - 0.55 );
		}
		const w = local.applyQuaternion( v.object.quaternion ).add( v.object.position );
		_d.subVectors( w, cam.position ).normalize();
		_v.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		return _v.dot( _d ) > 0.955;
	}

	// ---- the headlights (the driven vehicle's), siren glow -------------------------------------------------------------

	_lights( v, night ) {
		const s = this.spot;
		const on = v && v.lights && ! v.burnt && ! v.needs.battery && ( v.engine.running || v.driver );
		if ( ! on ) { if ( s.intensity ) s.intensity = 0; }
		else {
			const b = v.body, bb = v.bounds;
			const front = AIR[ v.kind ] ? ( v.kind === 'heli' ? _v.set( 0, 0.55, - 1.5 ) : _v.set( - 2.0, 2.15, - 0.9 ) ) : _v.set( 0, Math.min( 1.0, bb.max.y * 0.45 ), bb.min.z + 0.1 );
			b.toWorld( front, s.position );
			const aim = AIR[ v.kind ] ? _w.set( 0, v.kind === 'heli' ? - 6 : - 2, - 30 ) : _w.set( 0, - 1.2, bb.min.z - 22 );
			b.toWorld( aim, s.target.position );
			s.target.updateMatrixWorld();
			s.intensity = ( v.kind === 'bike' ? 180 : 340 ) * ( 0.35 + night * 0.65 );
			s.angle = v.kind === 'bike' ? 0.55 : 0.72;
		}
		// the light bar lights up the street at night
		const fx = this.game.fx;
		if ( fx?.lightNow && night > 0.2 ) {
			const cam = this.game.camera.position;
			for ( const u of this.list ) {
				if ( ! u.siren || ! u.spec.siren || u.burnt || u.needs.battery || u.pos.distanceToSquared( cam ) > 90 * 90 ) continue;
				const ph = ( this.t * 2.6 ) % 1;
				const red = ph < 0.25 || ( ph > 0.5 && ph < 0.6 );
				fx.lightNow( u.body.toWorld( _o.set( red ? - 0.4 : 0.4, u.bounds.max.y + 0.2, - 0.3 ), new V3() ), red ? RED : BLUE, 35 * night, 22 );
			}
		}
	}

	// ---- the world: prompts on foot --------------------------------------------------------------------------------

	provide( ray ) {
		const g = this.game, p = g.player;
		if ( p.vehicle || g.dead ) return null;
		const out = [];
		for ( const v of this.list ) {
			if ( v.removed ) continue;
			if ( v.pos.distanceToSquared( ray.origin ) > ( v.radius + 3.5 ) ** 2 ) continue;
			const h = v.hitTest( ray.origin, ray.dir, REACH + 1 );
			if ( ! h ) continue;
			const c = this._prompt( v, h.t, h.local.clone() );
			if ( c ) out.push( c );
		}
		this._pumpPrompt( ray, out );
		return out;
	}

	_prompt( v, t, L ) {
		const g = this.game, inv = g.player.inventory, k = v.kind, spec = v.spec;
		const base = ( id, label, action, extra ) => Object.assign( { t, owner: v, id: `veh-${v.id}-${id}`, label, action }, extra );
		const C = spec.containers;
		const trunkLabel = 'Search ' + ( C.trunkLabel || 'Trunk' ).toLowerCase();
		const zone = this._zone( v, L );
		if ( v.burnt ) return C.trunk && zone === 'rear' ? base( 'trunk', trunkLabel, () => this.openContainer( v, 'trunk' ) ) : null;
		// on its roof or side
		if ( v.upY() < 0.4 && spec.mass < 4000 && v.speed < 1 ) return base( 'flip', 'Flip vehicle', () => this.flip( v ), { hold: 1.2 } );
		// what's in the hands comes first
		const held = inv.hands ? inv.findUid( inv.hands ) : null;
		const hd = held ? getItem( held.id ) : null;
		const tank = spec.fuel.tank;
		if ( hd?.fuel && hd.fuel.kind !== 'propane' && ( held.data?.amount || 0 ) > 0.05 && v.fuel < tank - 0.3 ) return base( 'refuel', 'Refuel', () => this.refuelFromCan( v, held ) );
		const fix = this._fixFor( v, held );
		if ( fix ) return base( fix.id, fix.label, fix.run );
		// then by where you look
		if ( zone === 'fuel' ) {
			const can = this._fuelCan();
			if ( can && v.fuel < tank - 0.3 ) return base( 'refuel', 'Refuel', () => this.refuelFromCan( v, can ) );
		}
		if ( zone === 'wheel' || zone === 'front' ) {
			const f = this._fixFor( v, null, zone );
			if ( f ) return base( f.id, f.label, f.run );
		}
		if ( zone === 'rear' && C.trunk ) return base( 'trunk', trunkLabel, () => this.openContainer( v, 'trunk' ) );
		// a boat on the sand
		if ( k === 'boat' && v.inWater < 0.3 && spec.mass < 2500 && zone !== 'side' ) return base( 'push', 'Push', () => this.push( v ), { hold: 0.8 } );
		const si = this._seatFor( v, L );
		if ( si < 0 ) return null;
		const seat = v.seats[ si ];
		const label = seat.driver ? ( AIR[ k ] ? 'Fly ' : 'Drive ' ) + v.name : 'Passenger';
		return base( 'seat' + si, label, () => this.enter( v, si ) );
	}

	// repairs and parts: `held` (the stack in the hands) or, by zone, anything carried
	_fixFor( v, held, zone = null ) {
		const g = this.game, inv = g.player.inventory;
		const has = ( id ) => held ? ( held.id === id ? held : null ) : inv.find( s => s.id === id );
		const front = zone === null || zone === 'front';
		if ( front && v.needs.battery ) { const s = has( 'car_battery' ); if ( s ) return { id: 'battery', label: 'Install battery', run: () => this.fit( v, s, 'battery' ) }; }
		if ( front && v.needs.spark ) { const s = has( 'spark_plug' ); if ( s ) return { id: 'spark', label: 'Install spark plug', run: () => this.fit( v, s, 'spark' ) }; }
		if ( front && ( v.health < v.maxHealth * 0.97 || v.flooded || v.leak ) ) { const s = has( 'repair_kit' ); if ( s ) return { id: 'repair', label: v.kind === 'boat' ? 'Repair hull' : 'Repair engine', run: () => this.repair( v, s ) }; }
		if ( ( zone === null || zone === 'wheel' ) && v.tyres.some( Boolean ) ) { const s = has( 'tire' ); if ( s ) return { id: 'tyre', label: 'Change tyre', run: () => this.changeTyre( v, s ) }; }
		return null;
	}

	_zone( v, L ) {
		const bb = v.bounds, len = bb.max.z - bb.min.z, k = v.kind, P = v.model.P;
		if ( k !== 'heli' && v._wheelAt( L ) != null ) return 'wheel';
		const fp = this._fuelPoint( v );
		if ( fp ) {
			// boats and aircraft fill from either side
			const dx = k === 'boat' || AIR[ k ] ? Math.abs( L.x ) - Math.abs( fp[ 0 ] ) : L.x - fp[ 0 ];
			if ( Math.hypot( dx, L.y - fp[ 1 ], L.z - fp[ 2 ] ) < 0.75 ) return 'fuel';
		}
		if ( k === 'car' ) {
			const bed = P.wells?.[ 1 ];
			if ( bed ) { if ( - L.z < bed.f0 + 0.1 ) { if ( L.z < bb.min.z + len * 0.24 ) return 'front'; return 'side'; } return 'rear'; }
			if ( L.z > bb.max.z - len * 0.22 ) return 'rear';
			if ( L.z < bb.min.z + len * 0.24 ) return 'front';
			return 'side';
		}
		if ( k === 'bike' ) return L.z > bb.max.z - 0.45 ? 'rear' : Math.abs( L.z + ( P.axleF + P.axleR ) / 2 ) < 0.3 && L.y < 0.75 ? 'front' : 'side';
		if ( k === 'boat' ) return L.z > bb.max.z - len * 0.28 ? 'rear' : L.z < bb.min.z + len * 0.25 ? 'front' : 'side';
		if ( k === 'heli' ) return L.z > 0.8 && L.z < 2.6 ? 'rear' : L.z < - 1.7 ? 'front' : 'side';
		return L.z > 0.6 && L.z < 2.2 ? 'rear' : L.z < - 1.8 ? 'front' : 'side';
	}

	_fuelPoint( v ) {
		const m = v.model.meta, bb = v.bounds;
		if ( m.fuel ) return m.fuel;
		if ( v.kind === 'boat' ) return [ ( bb.max.x - bb.min.x ) * 0.36, Math.min( bb.max.y, 0.9 ), bb.max.z - 1.2 ];
		if ( v.kind === 'heli' ) return [ 0.95, 1.2, 0.9 ];
		if ( v.kind === 'plane' ) return [ 0.55, 1.35, 0.4 ];
		return null;
	}

	_fuelCan() {
		const inv = this.game.player.inventory;
		let best = null;
		for ( const s of inv.findAll ? inv.findAll( ( s, d ) => d?.fuel && d.fuel.kind !== 'propane' && ( s.data?.amount || 0 ) > 0.05 ) : [] ) if ( ! best || s.data.amount > best.data.amount ) best = s;
		return best;
	}

	_seatFor( v, L ) {
		const free = ( i ) => ! v.occupant[ i ] && v.seats[ i ];
		const di = v.seats.findIndex( s => s.driver );
		if ( v.kind !== 'car' ) {
			if ( di >= 0 && free( di ) ) return di;
			let best = - 1, bd = Infinity;
			v.seats.forEach( ( s, i ) => { if ( free( i ) ) { const d = Math.abs( s.pos[ 2 ] - L.z ); if ( d < bd ) { bd = d; best = i; } } } );
			return best;
		}
		// the bus: through the front door to the driver's seat
		if ( v.typeName === 'bus' && L.z < v.bounds.min.z + 3.2 && free( di ) ) return di;
		const side = Math.sign( L.x ) || - 1;
		let best = - 1, bd = Infinity;
		v.seats.forEach( ( s, i ) => {
			if ( ! free( i ) ) return;
			let d = Math.abs( s.pos[ 2 ] - L.z );
			if ( Math.sign( s.exit ) !== side ) d += 5;
			if ( d < bd ) { bd = d; best = i; }
		} );
		return best;
	}

	// ---- actions on a vehicle -----------------------------------------------------------------------------------------

	openContainer( v, which ) {
		const c = v.container( which );
		if ( c ) this.game.app?.ui?.openContainer?.( c );
	}

	refuelFromCan( v, can ) {
		const g = this.game, inv = g.player.inventory;
		const want = Math.min( v.spec.fuel.tank - v.fuel, can.data?.amount || 0 );
		if ( want < 0.05 ) return;
		g.actions.start( {
			label: 'Refuelling', time: clamp( want / CAN_RATE, 2, 16 ), sound: 'veh_pour',
			onDone: () => {
				if ( ! inv.findUid( can.uid ) || v.removed ) return;
				const got = Math.min( v.spec.fuel.tank - v.fuel, can.data.amount || 0 );
				v.fuel += got;
				can.data.amount = Math.max( 0, ( can.data.amount || 0 ) - got );
				v.touch();
				inv.changed();
				g.toast( `Added ${Math.max( 1, Math.round( got ) )} L of fuel`, 'good' );
			},
		} );
	}

	fit( v, stack, part ) {
		const g = this.game, inv = g.player.inventory;
		g.actions.start( {
			label: part === 'battery' ? 'Installing battery' : 'Installing spark plug', time: part === 'battery' ? 5 : 4, sound: 'craft',
			onDone: () => {
				if ( ! inv.findUid( stack.uid ) || v.removed ) return;
				this._consume( stack );
				delete v.needs[ part ];
				v.touch();
				g.audio?.play( 'switch_mode', { pos: v.pos, vol: 0.5 } );
			},
		} );
	}

	repair( v, kit ) {
		const g = this.game, inv = g.player.inventory;
		const tools = inv.hasTool?.( 'toolbox' );
		g.actions.start( {
			label: v.kind === 'boat' ? 'Repairing hull' : 'Repairing engine', time: tools ? 8 : 12, sound: 'craft',
			onDone: () => {
				if ( ! inv.findUid( kit.uid ) || v.removed ) return;
				v.health = Math.min( v.maxHealth, v.health + v.maxHealth * 0.5 );
				v.flooded = false; v.leak = false;
				v.burning = 0;
				v.touch();
				// a kit does three jobs
				kit.cond = Math.max( 0, ( kit.cond ?? 1 ) - 0.34 );
				if ( kit.cond <= 0.01 ) this._consume( kit ); else inv.changed();
				g.audio?.play( 'hit_metal', { pos: v.pos, vol: 0.4, rate: 1.3 } );
			},
		} );
	}

	changeTyre( v, tire ) {
		const g = this.game, inv = g.player.inventory;
		const i = v.tyres.findIndex( Boolean );
		if ( i < 0 ) return;
		g.actions.start( {
			label: 'Changing tyre', time: 10, sound: 'craft',
			onDone: () => {
				if ( ! inv.findUid( tire.uid ) || v.removed ) return;
				this._consume( tire );
				v.tyres[ i ] = 0;
				v.wheels[ i ].flat = false;
				v.touch();
			},
		} );
	}

	_consume( stack ) {
		const inv = this.game.player.inventory;
		if ( stack.qty > 1 ) { stack.qty --; inv.changed(); } else inv.remove( stack );
	}

	flip( v ) {
		const g = this.game;
		const yaw = v.yawAngle();
		v.setPose( _v.copy( v.pos ).setY( v.pos.y + 0.8 ), null, yaw );
		v.settle();
		v.body.v.set( 0, 0, 0 ); v.body.w.set( 0, 0, 0 );
		if ( v.kind === 'bike' ) v.lean = 0.16;
		v.touch();
		v.wake();
		g.audio?.play( 'land', { pos: v.pos, vol: 0.8 } );
	}

	// shove a boat off the sand towards deeper water
	push( v ) {
		const g = this.game, hf = g.hf;
		let best = null, bh = Infinity;
		for ( let k = 0; k < 12; k ++ ) {
			const a = k / 12 * Math.PI * 2, x = v.pos.x + Math.cos( a ) * 6, z = v.pos.z + Math.sin( a ) * 6;
			const h = hf.heightAt( x, z );
			if ( h < bh ) { bh = h; best = [ Math.cos( a ), Math.sin( a ) ]; }
		}
		if ( ! best ) return;
		v.wake();
		v.body.v.x += best[ 0 ] * 2.4; v.body.v.z += best[ 1 ] * 2.4; v.body.v.y += 0.4;
		v.touch();
		g.survival?.useStamina?.( 10 );
		g.audio?.play( v.inWater > 0.05 ? 'splash' : 'step_sand', { pos: v.pos, vol: 0.7 } );
	}

	// ---- gas stations -----------------------------------------------------------------------------------------------

	_pumpReserve( p ) {
		const seed = ( p.station.length * 7919 + p.station.charCodeAt( p.station.length - 1 ) * 104729 ) % 1000;
		const cap = 120 + ( seed / 1000 ) * 480;
		return Math.max( 0, cap - ( this.pumpUsed.get( p.station ) || 0 ) );
	}

	_pumpPrompt( ray, out ) {
		const sp = this.spawner;
		if ( ! sp ) return;
		const o = ray.origin, d = ray.dir;
		for ( const p of sp.pumps ) {
			const dx = p.x - o.x, dz = p.z - o.z;
			if ( dx * dx + dz * dz > 16 ) continue;
			// ray against the pump body (a 0.45 m cylinder, 1.7 m tall)
			const a = d.x * d.x + d.z * d.z;
			if ( a < 1e-6 ) continue;
			const bq = - ( dx * d.x + dz * d.z ), c = dx * dx + dz * dz - 0.45 * 0.45;
			const disc = bq * bq - a * c;
			if ( disc < 0 ) continue;
			const t = ( - bq - Math.sqrt( disc ) ) / a;
			if ( t < 0 || t > REACH ) continue;
			const y = o.y + d.y * t;
			if ( y < p.y || y > p.y + 1.9 ) continue;
			const reserve = this._pumpReserve( p );
			if ( reserve < 0.5 ) continue;
			// a vehicle at the pump, else a can to fill
			let veh = null, vd = 8;
			for ( const v of this.list ) {
				if ( v.burnt || v.removed || v.fuel > v.spec.fuel.tank - 0.5 ) continue;
				const dd = Math.hypot( v.pos.x - p.x, v.pos.z - p.z ) - v.radius * 0.5;
				if ( dd < vd ) { vd = dd; veh = v; }
			}
			if ( veh ) { out.push( { t, id: 'pump-' + p.key + '-' + veh.id, label: 'Refuel ' + veh.name.toLowerCase(), noOcclusion: true, action: () => this.pumpInto( p, veh ) } ); continue; }
			const inv = this.game.player.inventory;
			const can = inv.find( ( s, dd ) => dd?.fuel && dd.fuel.kind !== 'propane' && ( s.data?.amount || 0 ) < dd.fuel.litres - 0.1 );
			if ( can ) out.push( { t, id: 'pump-' + p.key + '-can', label: 'Fill ' + getItem( can.id ).name.toLowerCase(), noOcclusion: true, action: () => this.pumpInto( p, null, can ) } );
		}
	}

	pumpInto( p, v, can = null ) {
		const g = this.game;
		const reserve = this._pumpReserve( p );
		const room = v ? v.spec.fuel.tank - v.fuel : getItem( can.id ).fuel.litres - ( can.data?.amount || 0 );
		const amt = Math.min( reserve, room );
		if ( amt < 0.1 ) return;
		g.actions.start( {
			label: v ? 'Refuelling' : 'Filling', time: clamp( amt / PUMP_RATE, 1.5, 25 ), sound: 'veh_pour', cancelOnMove: true,
			onDone: () => {
				const r2 = Math.min( this._pumpReserve( p ), v ? v.spec.fuel.tank - v.fuel : getItem( can.id ).fuel.litres - ( can.data?.amount || 0 ) );
				if ( r2 <= 0 ) return;
				if ( v ) { if ( v.removed ) return; v.fuel += r2; v.touch(); }
				else { if ( ! g.player.inventory.findUid( can.uid ) ) return; can.data.liquid = 'fuel'; can.data.amount = ( can.data.amount || 0 ) + r2; g.player.inventory.changed(); }
				this.pumpUsed.set( p.station, ( this.pumpUsed.get( p.station ) || 0 ) + r2 );
				g.toast( this._pumpReserve( p ) < 0.5 ? 'The pump ran dry' : `Pumped ${Math.max( 1, Math.round( r2 ) )} L`, 'good' );
			},
		} );
	}

	// ---- callbacks from the vehicles --------------------------------------------------------------------------------

	onDestroyed( v, info ) {
		const g = this.game;
		if ( v === this.driving ) {
			g.survival?.hurt( 70 + Math.random() * 40, 'explosion', { cause: 'an exploding vehicle' } );
			this.exit( true );
		}
		v.siren = false; v.lights = false;
		void info;
	}

	// a motorcycle crash throws the rider off
	throwOff( v ) {
		if ( v === this.driving ) this.exit( true );
	}

	// ---- the HUD ---------------------------------------------------------------------------------------------------

	hud() {
		const v = this.driving, p = this.game.player;
		if ( ! v || ! p.vehicle || v.removed ) return null;
		const k = v.kind, air = AIR[ k ];
		const gear = v.wheeled && ( v.engine.running || v.startT > 0 ) ? ( v.engine.gear < 0 ? 'R' : v.engine.gear === 0 ? 'N' : String( v.engine.gear ) ) : null;
		return {
			name: v.name, speed: air ? v.speed : ( v.fwdSpeed || 0 ), fuel: v.fuel / v.spec.fuel.tank, health: v.health / v.maxHealth,
			gear, kind: k, altitude: air ? Math.max( 0, v.pos.y ) : undefined, heading: v.yawAngle(),
		};
	}

	// ---- save ------------------------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		const list = [];
		for ( const v of this.list ) {
			if ( ! v.touched || v.removed ) continue;
			const r = v.serialize();
			if ( v === this.driving || ! v.sleeping ) {
				r.v = v.body.v.toArray().map( x => + x.toFixed( 3 ) ); r.w = v.body.w.toArray().map( x => + x.toFixed( 3 ) );
				r.run = v.engine.running ? 1 : 0; r.rot = + v.rotor.toFixed( 3 ); r.thr = + ( v.throttleSet || 0 ).toFixed( 3 );
			}
			list.push( r );
		}
		for ( const [ k, r ] of this.records ) if ( ! this.active.has( k ) ) list.push( r );
		const occ = this.driving && ! this.driving.removed ? { k: this.driving.key, seat: this.seat } : this.pendingEnter ? { k: this.pendingEnter.k, seat: this.pendingEnter.seat } : null;
		save.world.vehicles = { v: 1, list, gone: [ ...this.gone ], pumps: Object.fromEntries( this.pumpUsed ), occupied: occ, cam: this.camPref, n: this.summonN };
	}

	load( save ) {
		const d = save.world?.vehicles;
		if ( ! d ) return;
		this.records.clear();
		for ( const r of d.list || [] ) if ( r && r.k && SPECS[ r.t ] && Array.isArray( r.p ) ) this.records.set( r.k, r );
		this.gone = new Set( d.gone || [] );
		this.pumpUsed = new Map( Object.entries( d.pumps || {} ) );
		if ( d.cam ) Object.assign( this.camPref, d.cam );
		this.summonN = d.n || 0;
		const o = d.occupied;
		if ( o && this.records.has( o.k ) ) {
			this.pendingEnter = { k: o.k, seat: o.seat || 0 };
			// hold the player still (Player.update stands down while `vehicle` is set) until the model is in
			this.game.player.vehicle = { pending: true, vehicle: null };
			loadModel( SPECS[ this.records.get( o.k ).t ].model, 0 );
		}
	}

	dispose() {
		this.unprovide?.();
		this.offDeath?.();
		this._horn( null, false );
		this.game.scene.remove( this.spot, this.spot.target );
		this.spot.dispose?.();
		for ( const v of this.list ) v.stopSounds();
		this.list.length = 0;
		this.active.clear();
	}
}

const RED = new THREE.Color( 1, 0.1, 0.08 ), BLUE = new THREE.Color( 0.1, 0.25, 1 );

// 2-D overlap of an oriented rectangle (centre x, z, half extents hx, hz, rotation cos c / sin s as a physics box
// yaw) with a physics box, by separating axes
function obbOverlap( x, z, hx, hz, c, s, b ) {
	const ax = [ [ c, - s ], [ s, c ], [ b.c, - b.s ], [ b.s, b.c ] ];
	const dx = b.x - x, dz = b.z - z;
	for ( const [ ux, uz ] of ax ) {
		const ra = hx * Math.abs( c * ux - s * uz ) + hz * Math.abs( s * ux + c * uz );
		const rb = b.hx * Math.abs( b.c * ux - b.s * uz ) + b.hz * Math.abs( b.s * ux + b.c * uz );
		if ( Math.abs( dx * ux + dz * uz ) > ra + rb ) return false;
	}
	return true;
}

export function install( game ) {
	const mgr = new Vehicles( game );
	game.vehicles = mgr;
	game.register( mgr );
	game.spawnables = game.spawnables || {};
	for ( const t of TYPES ) {
		const s = SPECS[ t ];
		game.spawnables[ t ] = { spawn: ( pos, o ) => mgr.summon( t, pos, o ), desc: s.name, distance: s.kind === 'boat' ? 2 : 0 };
	}
	game.spawnables.boat = { spawn: ( pos, o ) => mgr.summon( 'speedboat', pos, o ), desc: 'Speedboat', distance: 2 };
	return mgr;
}
