// The movement modes the mobility equipment puts you in. While `player.mode` is set, Player.update hands the body to it
// each frame (mode.update( player, dt, ctx ) -> true; false gives that frame back to walking): it moves the feet,
// turns the view, decides when it ends, and says what the HUD and the first-person hands show.
//
//   GlideMode   a paraglider (or the round reserve): airspeed, brakes and speed bar, turns, wind, ridge lift and
//               thermals, a flare to land; the canopy flies overhead (runtime.js draws it)
//   ClimbMode   up and down a hung rope, a ladder leant on a wall or a rope ladder; over the edge at the top
//   RideMode    a skateboard, a longboard, a kick scooter, inline skates or a hōlua sled: rolling on the surface under
//               you, pumping down slopes, carving, hopping curbs and bailing on grass or into things
//   PaddleMode  a paddleboard (standing or kneeling, a paddle in your hands) or a surfboard / bodyboard paddled prone
//   HaulMode    pushing a cart, a barrow or a hand truck in front of you, or a beach wagon pulled behind; hop on a cart
//               rolling downhill
//   ZipMode     down a zipline on a trolley, or hand over hand along it
// Node-safe: three.js maths only; the world comes in through game.physics / game.hf and the system (runtime.js).
import * as THREE from 'three';
import { getItem } from '../../ItemDB.js';
import {
	GLIDE, CHUTE, glideStep, chuteStep, RIDE, rideAccel, turnLimit, PADDLE, waveKnock, HAUL, loadK, ZIP, zipShape, zipGrade, zipAccel,
	climbRates, ROPE_BURN, FALL_G, G, clamp, wrap, approach, lerp, boardOf,
} from './logic.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c = {}, _c2 = {};
const R = 0.3; // the player's radius (Player.js)

// key hints (HUD.setHint format: [ [ actions ], verb, suffix? ]); one object each, so the HUD rebuilds only on a change
export const HINTS = {
	glide: { keys: [ [ [ 'left', 'right' ], 'Steer' ], [ [ 'back' ], 'Brake · flare' ], [ [ 'forward' ], 'Speed bar' ] ] },
	chute: { keys: [ [ [ 'left', 'right' ], 'Steer' ], [ [ 'back' ], 'Slow' ] ] },
	climb: { keys: [ [ [ 'forward', 'back' ], 'Climb' ], [ [ 'jump' ], 'Let go' ] ] },
	rope: { keys: [ [ [ 'forward', 'back' ], 'Climb' ], [ [ 'sprint', 'back' ], 'Slide' ], [ [ 'jump' ], 'Let go' ] ] },
	ride: { keys: [ [ [ 'forward' ], 'Push' ], [ [ 'back' ], 'Brake' ], [ [ 'jump' ], 'Ollie' ], [ [ 'crouch' ], 'Tuck' ], [ [ 'interact' ], 'Step off' ] ] },
	sled: { keys: [ [ [ 'left', 'right' ], 'Lean' ], [ [ 'back' ], 'Drag feet' ], [ [ 'interact' ], 'Get off' ] ] },
	skates: { keys: [ [ [ 'forward' ], 'Stride' ], [ [ 'back' ], 'Heel brake' ], [ [ 'jump' ], 'Hop' ] ] },
	paddle: { keys: [ [ [ 'forward' ], 'Paddle' ], [ [ 'left', 'right' ], 'Turn' ], [ [ 'crouch' ], 'Kneel' ], [ [ 'interact' ], 'Get off' ] ] },
	prone: { keys: [ [ [ 'forward' ], 'Paddle' ], [ [ 'left', 'right' ], 'Turn' ], [ [ 'interact' ], 'Get off' ] ] },
	push: { keys: [ [ [ 'forward', 'back' ], 'Push' ], [ [ 'inventory' ], 'Open' ], [ [ 'interact' ], 'Let go' ] ] },
	pushCart: { keys: [ [ [ 'forward', 'back' ], 'Push' ], [ [ 'jump' ], 'Hop on' ], [ [ 'inventory' ], 'Open' ], [ [ 'interact' ], 'Let go' ] ] },
	cartRide: { keys: [ [ [ 'back' ], 'Brake' ], [ [ 'left', 'right' ], 'Lean' ], [ [ 'jump' ], 'Hop off' ] ] },
	pull: { keys: [ [ [ 'inventory' ], 'Open' ], [ [ 'interact' ], 'Let go' ] ] },
	zip: { keys: [ [ [ 'back' ], 'Brake' ], [ [ 'jump' ], 'Let go' ] ] },
	hand: { keys: [ [ [ 'forward', 'back' ], 'Move' ], [ [ 'jump' ], 'Let go' ] ] },
};

// a grip for the first-person hands (ViewModel: p where the hand closes, a the axis it closes round, n the back of the
// hand, r the radius held)
export const grip = ( p, a, n, r ) => ( { p: new THREE.Vector3( ...p ), a: new THREE.Vector3( ...a ).normalize(), n: new THREE.Vector3( ...n ).normalize(), r } );
const setGrip = ( g, x, y, z, ax, ay, az, nx, ny, nz ) => { g.p.set( x, y, z ); g.a.set( ax, ay, az ).normalize(); g.n.set( nx, ny, nz ).normalize(); };

// what you wear and carry that changes how a mode goes
export function gearOf( g ) {
	const inv = g.player.inventory, eq = inv.equip || {};
	const find = ( fn ) => inv.find ? inv.find( fn ) : null;
	const head = eq.head ? getItem( eq.head.id ) : null;
	return {
		harness: eq.belt?.id === 'climbing_harness',
		gloves: !! eq.hands,
		ascender: !! find( ( s ) => s.id === 'ascender' && s.cond > 0 ),
		descender: !! find( ( s ) => s.id === 'descender' && s.cond > 0 ),
		chalk: find( ( s ) => s.id === 'chalk_bag' && ( s.data?.uses ?? 20 ) > 0 ),
		pads: !! eq.legs?.data?.pads,
		helmet: !! head && /helmet/.test( head.id ),
		leash: !! find( ( s ) => s.id === 'board_leash' ),
		paddle: find( ( s, d ) => d?.tool?.kind === 'paddle' || !! d?.melee?.tools?.includes( 'paddle' ) ),
		trolley: find( ( s ) => s.id === 'zip_trolley' && s.cond > 0 ),
		vario: !! find( ( s ) => s.id === 'variometer' && s.data?.on && ( s.data.charge ?? 1 ) > 0 ),
	};
}

const keys = ( ctx ) => {
	const I = ctx.input, on = ctx.active;
	return {
		fwd: on && I.is( 'forward' ), back: on && I.is( 'back' ), left: on && I.is( 'left' ), right: on && I.is( 'right' ),
		sprint: on && I.is( 'sprint' ), jump: on && I.pressed( 'jump' ), crouch: on && I.is( 'crouch' ),
	};
};

export class Mode {
	constructor( sys, kind ) {
		this.sys = sys;
		this.game = sys.game;
		this.kind = kind;
		this.t = 0;
		this.view = null; // first-person hands (ViewModel.setMode): { obj, grips: { R, L } }
		this.busyHands = false; // the held item is put away while it lasts, and the hands' keys are ignored
		this.eye = null; // eye height above the feet (m), or null for the stance's
		this.hint = null; // key hints for the HUD
		this.ended = false;
	}
	begin() {}
	// true: this frame is handled
	update() { return true; }
	// the HUD's readout { name, speed (m/s), altitude?, climb?, health? } or null
	hud() { return null; }
	// the F prompt while in the mode: { label, sub, action } or null
	prompt() { return null; }
	finish() {}
	end( how = 'done' ) { if ( ! this.ended ) this.sys.endMode( this, how ); }
}

// =====================================================================================================================
// gliding
// =====================================================================================================================

export class GlideMode extends Mode {
	// stack: the paraglider or the reserve, carried; o: { chute, open (0..1 already open) }
	constructor( sys, stack, o = {} ) {
		super( sys, o.chute ? 'chute' : 'glide' );
		const p = this.game.player;
		this.stack = stack;
		this.P = o.chute ? CHUTE : GLIDE;
		const hs = Math.hypot( p.vel.x, p.vel.z );
		this.s = { heading: o.heading ?? p.yaw, V: o.chute ? 0 : clamp( o.V ?? hs, 3, 9 ), vy: Math.min( 0, p.vel.y ), bank: 0, open: o.open ?? 0, turnRate: 0 };
		this.busyHands = true;
		this.hint = o.chute ? HINTS.chute : HINTS.glide;
		this.brakeT = 0; this.liftT = 0; this.lift = 0; this.alt = 0; this.vh = 0;
		this.wind = { x: 0, z: 0 };
		this.view = { obj: null, grips: { R: grip( [ 0.24, 0.02, - 0.32 ], [ 0, 1, 0.2 ], [ 0.6, 0, 0.8 ], 0.012 ), L: grip( [ - 0.24, 0.02, - 0.32 ], [ 0, 1, 0.2 ], [ - 0.6, 0, 0.8 ], 0.012 ) }, kind: 'brakes' };
		this.input = { bar: 0, brake: 0, brakeT: 0, turn: 0 };
	}

	update( p, dt, ctx ) {
		const g = this.game, P = g.physics, k = keys( ctx );
		this.t += dt;
		let turn = 0;
		if ( k.left ) turn -= 1;
		if ( k.right ) turn += 1;
		this.brakeT = k.back ? this.brakeT + dt : 0;
		const inp = this.input;
		inp.bar = approach( inp.bar, k.fwd ? 1 : 0, dt * 3 ); inp.brake = approach( inp.brake, k.back ? 1 : 0, dt * 5 );
		inp.brakeT = Math.max( 0, this.brakeT - 1.2 ); inp.turn = approach( inp.turn, turn, dt * 4 );
		// the air around: wind, and the lift of ridges and thermals (a few times a second)
		this.liftT -= dt;
		if ( this.liftT <= 0 ) { this.liftT = 0.2; this.lift = this.kind === 'glide' ? this.sys.liftAt( p.pos ) : 0; this.wind = this.sys.wind(); }
		const env = { wind: this.wind, lift: this.lift, loadK: ( 78 + ( p.inventory.totalWeight?.() || 0 ) ) / 90, cond: this.stack.cond };
		const h0 = this.s.heading;
		const v = this.kind === 'glide' ? glideStep( this.s, inp, env, dt, this.P ) : chuteStep( this.s, inp, env, dt, this.P );
		// the view swings round with the wing; the mouse looks about on top of that
		p.yaw += wrap( this.s.heading - h0 );
		p.roll = - ( this.s.bank || 0 ) * 0.35;
		const ox = p.pos.x, oz = p.pos.z;
		p.pos.x += v.vx * dt; p.pos.z += v.vz * dt; p.pos.y += this.s.vy * dt;
		p.vel.set( v.vx, this.s.vy, v.vz );
		const vh = this.vh = Math.hypot( v.vx, v.vz );
		// into a wall, a tree, the edge of a roof
		if ( P.resolveCylinder( p.pos, R, 1.8, 0.3 ) ) {
			const lost = Math.hypot( ox + v.vx * dt - p.pos.x, oz + v.vz * dt - p.pos.z ) / Math.max( dt, 1e-4 );
			if ( lost > 3.5 ) { this.sys.crash( this, Math.min( vh, lost ) ); return true; }
		}
		const gr = P.ground( p.pos.x, p.pos.z, p.pos.y + 0.05, 0.35, R );
		const water = P.waterLevel( p.pos.x, p.pos.z );
		if ( water > gr.y + 1.3 && p.pos.y < water - 0.6 ) { this.sys.splash( this ); return true; }
		if ( p.pos.y <= gr.y ) { p.pos.y = gr.y; this.sys.land( this, this.s.vy, vh, gr ); return true; }
		this.alt = p.pos.y - Math.max( gr.y, water );
		p.speedNow = vh; p.onGround = false; p.fallStart = null; p.moving = vh > 0.5; p.sprinting = false; p.swimming = false;
		p.distance += vh * dt;
		// the wing wears with use, and a long flight's work shows on the arms
		if ( this.kind === 'glide' ) this.stack.cond = Math.max( 0, this.stack.cond - GLIDE.wearMin / 60 * dt );
		this.sys.useStamina( ( 0.4 + inp.brake * 1.6 ) * dt );
		// the hands follow the brakes: pulled down to the hips, up to the risers; a turn pulls one side
		const gb = this.view.grips;
		const bR = clamp( inp.brake + Math.max( 0, inp.turn ) * 0.8, 0, 1 ), bL = clamp( inp.brake + Math.max( 0, - inp.turn ) * 0.8, 0, 1 );
		const up = this.kind === 'chute' ? 0.12 : 0.02;
		setGrip( gb.R, 0.25 - bR * 0.02, up - bR * 0.28, - 0.34 + bR * 0.12, 0, 1, 0.15, 0.7, 0, 0.7 );
		setGrip( gb.L, - 0.25 + bL * 0.02, up - bL * 0.28, - 0.34 + bL * 0.12, 0, 1, 0.15, - 0.7, 0, 0.7 );
		return true;
	}

	hud() {
		return { name: this.kind === 'glide' ? 'Paraglider' : 'Reserve', speed: this.vh, altitude: this.alt, climb: this.s.vy, health: this.kind === 'glide' ? this.stack.cond : null };
	}
}

// =====================================================================================================================
// climbing
// =====================================================================================================================

// path: { kind: 'rope'|'ladder'|'rope_ladder', bot, top (Vector3: the line climbed), face (yaw that looks at the wall),
// ledge (Vector3 where you stand at the top, or null), rec (the placed thing), off (m out from the line) }
export class ClimbMode extends Mode {
	constructor( sys, path, u0, o = {} ) {
		super( sys, 'climb' );
		this.path = path;
		this.L = path.top.distanceTo( path.bot );
		this.dir = path.top.clone().sub( path.bot ).normalize();
		this.out = new THREE.Vector3( Math.sin( path.face ), 0, Math.cos( path.face ) ); // away from the wall
		this.u = clamp( u0, 0, this.L );
		this.busyHands = true;
		this.gear = gearOf( this.game );
		this.rates = climbRates( path.kind, this.gear );
		this.hint = path.kind === 'rope' ? HINTS.rope : HINTS.climb;
		this.mantle = null;
		this.enter = o.from ? { from: o.from.clone(), t: 0 } : null;
		this.tiredT = 0; this.stepD = 0; this.hand = 0;
		this.chalked = false;
		if ( this.gear.chalk && path.kind === 'rope' ) { this.sys.useUp( this.gear.chalk ); this.chalked = true; }
		this.view = { obj: null, grips: { R: grip( [ 0.12, 0.1, - 0.3 ], [ 0, 1, 0 ], [ 0, 0, 1 ], 0.014 ), L: grip( [ - 0.12, - 0.1, - 0.3 ], [ 0, 1, 0 ], [ 0, 0, 1 ], 0.014 ) }, cam: true, kind: 'climb' };
		this._w = [ new THREE.Vector3(), new THREE.Vector3() ];
	}

	// the feet at u along the line
	at( u, out = _v ) {
		const off = this.path.off ?? ( this.path.kind === 'rope' ? 0.34 : 0.3 );
		return out.copy( this.path.bot ).addScaledVector( this.dir, u ).addScaledVector( this.out, off );
	}

	update( p, dt, ctx ) {
		const g = this.game, S = g.survival, k = keys( ctx ), path = this.path;
		this.t += dt;
		p.onGround = false; p.fallStart = null; p.sprinting = false; p.swimming = false; p.vel.set( 0, 0, 0 );
		// coming over the edge from the top
		if ( this.enter ) {
			const e = this.enter;
			e.t += dt / 0.7;
			this.at( this.u );
			p.pos.lerpVectors( e.from, _v, smooth( e.t ) );
			if ( e.t >= 1 ) this.enter = null;
			this._hands( p );
			return true;
		}
		// over the top onto the ledge
		if ( this.mantle ) {
			const m = this.mantle;
			m.t += dt / 0.75;
			const t = smooth( m.t );
			p.pos.lerpVectors( m.from, m.to, t );
			p.pos.y += Math.sin( Math.min( 1, m.t ) * Math.PI ) * 0.35;
			if ( m.t >= 1 ) { p.pos.copy( m.to ); p.onGround = true; this.end( 'top' ); }
			return true;
		}
		if ( k.jump ) { this.sys.letGo( this, this.out.clone().multiplyScalar( 1.6 ).setY( 1.5 ) ); return true; }
		const st = S?.stamina ?? 100;
		let du = 0;
		if ( k.fwd ) { if ( st > 3 ) du = this.rates.up; else this.sys.tired(); }
		else if ( k.back ) du = - ( k.sprint && this.rates.slide ? this.rates.slide : this.rates.down );
		// a rope held without a harness wears the arms out, and the hands give: you slide
		if ( path.kind === 'rope' && ! this.gear.harness && st <= 1 && ! k.fwd ) du = Math.min( du, - 0.7 );
		const up = du > 0, slide = du < - this.rates.down - 0.1;
		const cost = up ? this.rates.stamina : du < 0 ? this.rates.stamina / 3 : ( path.kind === 'rope' && ! this.gear.harness ? 1.6 : 0 );
		this.sys.useStamina( cost * dt );
		if ( slide && ! this.gear.gloves && ! ( this.gear.descender && this.gear.harness ) ) S?.hurt?.( ROPE_BURN * dt, 'burn', { cause: 'rope burn' } );
		const u0 = this.u;
		this.u = clamp( this.u + du * dt, 0, this.L );
		// the top: over the edge onto the roof or the cliff
		if ( this.u >= this.L - 0.05 && k.fwd && path.ledge ) {
			this.mantle = { from: p.pos.clone(), to: path.ledge.clone(), t: 0 };
			this.sys.sound( 'mob_scuff', p.pos, 0.6 );
			this.sys.useStamina( 6 );
			return true;
		}
		// the bottom: step off
		if ( this.u <= 0.02 && k.back ) {
			this.at( 0 );
			const gr = g.physics.ground( _v.x, _v.z, _v.y + 0.4, 0.6, R );
			p.pos.set( _v.x, gr.y, _v.z );
			p.onGround = true;
			this.end( 'bottom' );
			return true;
		}
		this.at( this.u, p.pos );
		// ladders clank, ropes creak
		this.stepD += Math.abs( this.u - u0 );
		if ( this.stepD > ( path.kind === 'ladder' ? 0.3 : 0.45 ) ) {
			this.stepD = 0;
			this.sys.sound( path.kind === 'ladder' ? 'mob_rung' : 'mob_rope', p.pos, 0.35 );
			if ( path.kind === 'ladder' ) this.sys.noise( p.pos, 7, 'climb' );
		}
		p.speedNow = Math.abs( du ); p.moving = du !== 0;
		this.hand += ( this.u - u0 ) * ( path.kind === 'ladder' ? 3.3 : 2.4 );
		this._hands( p );
		return true;
	}

	// hand over hand: the hands reach up the line in front of you, alternately (world points mapped to the view)
	_hands( p ) {
		const w = this._w, ph = this.hand;
		const lift = ( k ) => 0.5 + 0.18 * Math.sin( ph * Math.PI + k * Math.PI );
		const side = this.path.kind === 'ladder' ? ( this.path.w || 0.42 ) * 0.5 : 0.04;
		for ( let i = 0; i < 2; i ++ ) {
			const s = i === 0 ? 1 : - 1;
			// on the line, a little above the eye or at chest height
			this.at( Math.min( this.L + 0.2, this.u + 1.25 + lift( i ) ), w[ i ] );
			w[ i ].addScaledVector( this.out, - ( this.path.off ?? 0.3 ) );
			w[ i ].x += Math.cos( this.path.face ) * side * s; w[ i ].z -= Math.sin( this.path.face ) * side * s;
		}
		this.view.world = w;
	}

	prompt() {
		if ( this.mantle || this.enter ) return null;
		return { label: 'Let go', sub: this.path.kind === 'rope' ? 'Rope' : this.path.kind === 'ladder' ? 'Ladder' : 'Rope ladder', action: () => this.sys.letGo( this, this.out.clone().multiplyScalar( 0.6 ) ) };
	}
	hud() { return null; }
}
const smooth = ( t ) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );

// =====================================================================================================================
// boards, skates, a scooter, a sled
// =====================================================================================================================

export class RideMode extends Mode {
	// stack: the board (carried) or the worn skates; kind: a RIDE key
	constructor( sys, stack, kind, o = {} ) {
		super( sys, 'ride' );
		const p = this.game.player;
		this.stack = stack;
		this.rkind = kind;
		this.P = RIDE[ kind ];
		this.heading = p.yaw;
		this.v = Math.max( 0, o.v ?? Math.hypot( p.vel.x, p.vel.z ) * 0.8 );
		this.vy = 0; this.air = false; this.airTop = 0; this.hopT = 0;
		this.eye = this.P.eye;
		this.busyHands = false;
		this.hint = this.P.prone ? HINTS.sled : this.P.auto ? HINTS.skates : HINTS.ride;
		this.gear = gearOf( this.game );
		this.noiseT = 0; this.surface = 'paved'; this.grade = 0; this.slowT = 0; this.pushT = 0; this.tilt = 0; this.pitch = 0;
		this.dist = 0;
	}

	update( p, dt, ctx ) {
		const g = this.game, P = g.physics, B = this.P, k = keys( ctx );
		this.t += dt;
		this.hopT = Math.max( 0, this.hopT - dt );
		// the board's way: the view leads it within what the wheels can carve at this speed; A / D lean into it
		let lean = 0;
		if ( k.left ) lean += 1;
		if ( k.right ) lean -= 1;
		const tuck = k.crouch && ! B.prone;
		if ( ! this.air ) {
			const target = p.yaw + lean * 0.45;
			const lim = turnLimit( B, this.v, tuck ) * dt;
			this.heading += this.v < 0.4 ? wrap( target - this.heading ) * Math.min( 1, dt * 6 ) : clamp( wrap( target - this.heading ), - lim, lim );
		}
		const hx = - Math.sin( this.heading ), hz = - Math.cos( this.heading );
		// what is under the wheels, and the slope along the board
		const box = P.ground( p.pos.x, p.pos.z, p.pos.y + 0.05, 0.12, 0.2 ).box;
		this.surface = this.sys.surface( p.pos.x, p.pos.z, box );
		const ya = this._y( p.pos.x + hx * 0.45, p.pos.z + hz * 0.45, p.pos.y ), yb = this._y( p.pos.x - hx * 0.45, p.pos.z - hz * 0.45, p.pos.y );
		this.grade = clamp( ( ya - yb ) / 0.9, - 1.2, 1.2 );
		// rough ground at speed throws you
		if ( ! this.air && this.v > ( B.bail[ this.surface ] ?? 99 ) ) { this.sys.bail( this, this.surface === 'grass' ? 'Hit the grass' : this.surface === 'sand' ? 'Dug into the sand' : 'Too rough', this.v ); return true; }
		const push = k.fwd && ( g.survival?.stamina ?? 100 ) > 5 && ! this.air;
		if ( push ) { this.sys.useStamina( B.stamina * dt ); this.pushT += dt; } else this.pushT = 0;
		const a = this.air ? - 0.002 * this.v * this.v : rideAccel( B, this.v, this.grade, this.surface, { push, brake: k.back, tuck }, this.stack?.cond ?? 1 );
		this.v = clamp( this.v + a * dt, 0, B.top );
		if ( k.back && this.v < 0.25 ) this.v = 0;
		// hop: an ollie, a scooter's bunny hop, a skater's jump
		if ( k.jump && ! this.air && B.ollie > 0 ) {
			this.vy = B.ollie; this.air = true; this.airTop = p.pos.y; this.hopT = 0.35;
			this.sys.sound( 'mob_pop', p.pos, 0.6 );
			this.sys.useStamina( 4 );
		}
		// move, and what we run into
		const ox = p.pos.x, oz = p.pos.z, oy = p.pos.y;
		p.pos.x += hx * this.v * dt; p.pos.z += hz * this.v * dt;
		// (anything under a quarter metre is a kerb or a step, met below; higher is a wall)
		if ( P.resolveCylinder( p.pos, R, 1.7, 0.25 ) ) {
			const dx = p.pos.x - ox - hx * this.v * dt, dz = p.pos.z - oz - hz * this.v * dt, dl = Math.hypot( dx, dz );
			const into = dl > 1e-5 ? - ( dx * hx + dz * hz ) / dl : 0; // how square on it was
			if ( this.v * into > B.bail.hit ) { this.sys.bail( this, 'Crashed', this.v ); return true; }
			this.v *= 1 - clamp( into, 0, 1 ) * 0.9;
		}
		// up and down: kerbs, steps, drops; airborne after an ollie or off a ledge
		const gr = P.ground( p.pos.x, p.pos.z, ( this.air ? p.pos.y : oy ) + ( this.air ? 0.05 : 0.45 ), 0.0, R * 0.5 );
		if ( this.air ) {
			this.vy -= FALL_G * dt;
			p.pos.y += this.vy * dt;
			this.airTop = Math.max( this.airTop, p.pos.y );
			if ( p.pos.y <= gr.y ) {
				p.pos.y = gr.y; this.air = false;
				const drop = this.airTop - gr.y;
				if ( drop > B.bail.drop + ( B.ollie > 0 ? 0.45 : 0 ) ) { this.sys.bail( this, 'Bad landing', this.v + drop ); return true; }
				this.sys.sound( 'mob_land', p.pos, Math.min( 0.8, 0.25 + drop * 0.3 ) );
				this.vy = 0;
			}
		} else {
			const rise = gr.y - oy;
			if ( rise > 0.07 ) {
				// a kerb or a step: hopped is fine, rolled into fast throws you, slowly it bumps up
				if ( rise > 0.45 ) { p.pos.x = ox; p.pos.z = oz; p.pos.y = oy; this.v = 0; }
				else if ( this.hopT > 0 ) p.pos.y = gr.y;
				else if ( this.v > B.bail.curb ) { this.sys.bail( this, 'Hit a kerb', this.v ); return true; }
				else { p.pos.y = gr.y; this.v *= 0.35; this.sys.sound( 'mob_land', p.pos, 0.3 ); }
			} else if ( rise < - 0.3 ) { this.air = true; this.vy = - 0.5; this.airTop = oy; p.pos.y = oy; }
			else p.pos.y = gr.y;
		}
		// into deep water
		const water = P.waterLevel( p.pos.x, p.pos.z );
		if ( water > p.pos.y + 0.35 ) { this.sys.bail( this, 'Fell in', this.v * 0.5 ); return true; }
		// a sled stops on the flat; boards wait for you
		if ( B.slope && this.v < 0.15 && this.grade > - 0.05 ) { this.slowT += dt; if ( this.slowT > 2.5 ) { this.end( 'stopped' ); return true; } } else this.slowT = 0;
		p.vel.set( hx * this.v, this.air ? this.vy : 0, hz * this.v );
		p.speedNow = this.v; p.moving = this.v > 0.2; p.sprinting = false; p.swimming = false; p.onGround = ! this.air; p.fallStart = null;
		p.distance += this.v * dt;
		this.dist += this.v * dt;
		// the wheels wear, and roll loud enough for the infected to hear
		if ( this.stack && B.wear ) this.stack.cond = Math.max( 0.05, this.stack.cond - B.wear * this.v * dt );
		this.noiseT -= dt;
		if ( this.noiseT <= 0 && this.v > 1 ) { this.noiseT = 0.5; this.sys.noise( p.pos, ( 5 + this.v * 2.1 ) * B.noise * ( this.surface === 'paved' ? 1 : 0.7 ), 'skate' ); }
		// the body leans into a carve, crouches in a tuck
		const carve = this.v > 0.5 ? clamp( wrap( p.yaw + lean * 0.45 - this.heading ) * 2, - 1, 1 ) : 0;
		this.tilt = approach( this.tilt, carve * Math.min( 1, this.v / 6 ), dt * 5 );
		p.roll = this.tilt * 0.07;
		this.eye = B.eye - ( tuck ? 0.45 : 0 ) - ( this.pushT > 0 ? Math.abs( Math.sin( this.t * 6 ) ) * 0.05 : 0 );
		return true;
	}

	// the walkable height near x, z (for the slope along the board)
	_y( x, z, y ) { return this.game.physics.ground( x, z, y + 0.3, 0.3, 0 ).y; }

	prompt() {
		if ( this.P.auto ) return null;
		return { label: this.P.prone ? 'Get off' : 'Step off', sub: this.P.name, action: () => this.end( 'off' ) };
	}
	hud() { return this.P.auto ? null : { name: this.P.name, speed: this.v, health: this.stack?.cond }; }
}

// =====================================================================================================================
// paddling
// =====================================================================================================================

export class PaddleMode extends Mode {
	// stack: the board; o: { prone (a surfboard or bodyboard, or no paddle), heading }
	constructor( sys, stack, o = {} ) {
		super( sys, 'paddle' );
		const p = this.game.player;
		this.stack = stack;
		this.def = getItem( stack.id );
		this.gear = gearOf( this.game );
		this.prone = !! o.prone || ! this.gear.paddle || !! boardOf( this.def )?.prone;
		this.stance = this.prone ? 'prone' : 'stand';
		this.heading = o.heading ?? p.yaw;
		this.v = o.v ?? 0;
		this.busyHands = true;
		this.hint = this.prone ? HINTS.prone : HINTS.paddle;
		this.stroke = 0; this.side = 1; this.strokes = 0; this.knockT = 0; this.noiseT = 0; this.bob = 0;
		this.depth = 5;
		this.view = this.prone
			? { obj: null, grips: { R: grip( [ 0.2, - 0.3, - 0.4 ], [ 1, 0, 0 ], [ 0, 1, 0 ], 0.03 ), L: grip( [ - 0.2, - 0.3, - 0.4 ], [ 1, 0, 0 ], [ 0, 1, 0 ], 0.03 ) }, kind: 'prone' }
			: { obj: null, grips: { R: grip( [ 0.12, - 0.05, - 0.36 ], [ 0, 1, 0 ], [ 1, 0, 0 ], 0.014 ), L: grip( [ 0.02, - 0.45, - 0.4 ], [ 0, 1, 0 ], [ - 1, 0, 0 ], 0.014 ) }, kind: 'paddle', paddle: this.gear.paddle?.id || null };
	}

	update( p, dt, ctx ) {
		const g = this.game, P = g.physics, k = keys( ctx );
		this.t += dt;
		// kneel: lower and steadier, a little slower
		if ( ! this.prone ) this.stance = k.crouch ? 'kneel' : 'stand';
		const S = PADDLE[ this.stance ];
		const water = P.waterLevel( p.pos.x, p.pos.z );
		const bed = g.hf.heightAt( p.pos.x, p.pos.z );
		this.depth = water - bed;
		// aground: off at the beach, the board left on the sand
		if ( this.depth < PADDLE.beach ) { this.end( 'beach' ); return true; }
		let turn = 0;
		if ( k.left ) turn += 1;
		if ( k.right ) turn -= 1;
		const sprint = k.sprint && ( g.survival?.stamina ?? 100 ) > 8;
		const vmax = sprint ? S.sprint : S.v;
		// strokes: forward drives it, a sweep on one side turns it (the view leads, like a board on land)
		let a = 0;
		if ( k.fwd ) a += S.accel * ( 1 - this.v / vmax );
		if ( k.back ) a -= this.v > 0 ? S.accel * 1.2 : S.accel * 0.6;
		this.v += a * dt;
		this.v -= ( PADDLE.drag * this.v * Math.abs( this.v ) + 0.02 * this.v ) * dt;
		this.v = clamp( this.v, - S.back, vmax );
		const target = p.yaw + turn * 0.6;
		const lim = S.turn * ( 0.5 + ( k.fwd || turn ? 0.5 : 0 ) ) * dt;
		this.heading += clamp( wrap( target - this.heading ), - lim, lim );
		if ( k.fwd || k.back || turn ) this.sys.useStamina( ( sprint ? S.sprintStamina : S.stamina ) * dt );
		// the wind pushes a board about
		const w = this.sys.wind();
		const hx = - Math.sin( this.heading ), hz = - Math.cos( this.heading );
		p.pos.x += ( hx * this.v + w.x * 0.06 ) * dt; p.pos.z += ( hz * this.v + w.z * 0.06 ) * dt;
		if ( P.resolveCylinder( p.pos, 0.45, 1.6, 0.2 ) ) this.v *= 0.6;
		// riding the swell
		const wl = P.waterLevel( p.pos.x, p.pos.z );
		p.pos.y = wl - PADDLE.draft + ( boardOf( this.def )?.deck ?? 0.12 );
		p.vel.set( hx * this.v, 0, hz * this.v );
		p.speedNow = Math.abs( this.v ); p.moving = Math.abs( this.v ) > 0.1; p.sprinting = false; p.swimming = false; p.underwater = false; p.onGround = false; p.fallStart = null;
		p.distance += Math.abs( this.v ) * dt;
		this.eye = S.eye;
		// the sea throws you off now and then (surf in the shallows, a storm's chop)
		this.knockT -= dt;
		if ( this.knockT <= 0 ) {
			this.knockT = 0.5;
			const c = waveKnock( this.stance, g.weather?.sea ?? 0.4, this.depth, g.weather?.wind ?? 0.4, Math.abs( this.v ) );
			if ( Math.random() < c * 0.5 ) { this.sys.knockOff( this, 'Knocked off' ); return true; }
		}
		// a paddle stroke: in at the front, pulled back past the feet; the side swaps every few strokes or to turn
		const working = k.fwd || k.back || turn;
		const rate = sprint ? 1.25 : 0.95;
		if ( working ) {
			const was = this.stroke;
			this.stroke = ( this.stroke + dt * rate ) % 1;
			if ( this.stroke < was ) {
				this.strokes ++;
				this.side = turn ? - turn : this.strokes % 3 === 0 ? - this.side : this.side;
				this.sys.sound( 'mob_paddle', p.pos, 0.35 );
			}
		} else this.stroke = approach( this.stroke, 0, dt * 2 );
		this.noiseT -= dt;
		if ( this.noiseT <= 0 && working ) { this.noiseT = 1; this.sys.noise( p.pos, 6, 'paddle' ); }
		this._hands( k.back );
		return true;
	}

	// the paddle (or the arms, prone) through the stroke, in view space
	_hands( back ) {
		const gr = this.view.grips, s = this.stroke, side = this.side;
		if ( this.prone ) {
			// alternate arm strokes into the water beside the board, down out of view
			for ( const [ g0, sg, ph ] of [ [ gr.R, 1, 0 ], [ gr.L, - 1, 0.5 ] ] ) {
				const t = ( s + ph ) % 1, a = t * Math.PI * 2;
				setGrip( g0, sg * ( 0.24 + 0.05 * Math.cos( a ) ), - 0.28 + 0.14 * Math.sin( a ), - 0.42 - 0.2 * Math.cos( a ), 1, 0, 0, 0, 1, - 0.2 );
			}
			return;
		}
		// standing: the top hand on the T-grip, the lower hand down the shaft; the blade goes in ahead on one side and
		// comes back past the feet
		const t = back ? 1 - s : s;
		const reach = Math.cos( t * Math.PI * 2 ) * 0.5 + 0.5; // 1 forward .. 0 back
		const x = side * ( 0.1 + 0.04 * reach );
		setGrip( gr.R, x + side * 0.05, 0.02 - 0.12 * ( 1 - reach ), - 0.42 - 0.12 * reach, - side * 0.25, 1, 0.3, side, 0.1, 0 );
		setGrip( gr.L, x + side * 0.15, - 0.38 - 0.06 * reach, - 0.36 - 0.22 * reach, - side * 0.25, 1, 0.3, - side, 0.1, 0 );
		this.view.paddleSide = side;
	}

	prompt() { return { label: 'Get off', sub: this.def?.name || 'Board', action: () => this.end( 'off' ) }; }
	hud() { return { name: this.def?.name || 'Board', speed: Math.abs( this.v ), health: this.stack.cond }; }
}

// =====================================================================================================================
// hauling
// =====================================================================================================================

export class HaulMode extends Mode {
	// rec: the placed cart (a mob_hauler record); it follows you while this lasts
	constructor( sys, rec ) {
		super( sys, 'haul' );
		const p = this.game.player;
		this.rec = rec;
		this.H = HAUL[ rec.stack?.id ] || HAUL.shopping_cart;
		this.pull = this.H.at < 0;
		this.heading = this.pull ? Math.atan2( rec.pos.x - p.pos.x, rec.pos.z - p.pos.z ) + Math.PI : p.yaw;
		this.busyHands = ! this.pull;
		this.hint = this.pull ? HINTS.pull : this.H.rideable ? HINTS.pushCart : HINTS.push;
		this.v = 0; this.riding = false; this.noiseT = 0; this.pitch = 0; this.surface = 'paved';
		this.cart = new THREE.Vector3( rec.pos.x, rec.pos.y, rec.pos.z );
		this.view = this.pull ? null : { obj: null, grips: { R: grip( [ 0.2, - 0.3, - 0.5 ], [ 1, 0, 0 ], [ 0, 1, 0.3 ], 0.014 ), L: grip( [ - 0.2, - 0.3, - 0.5 ], [ 1, 0, 0 ], [ 0, 1, 0.3 ], 0.014 ) }, cam: true, kind: 'haul' };
		this._w = [ new THREE.Vector3(), new THREE.Vector3() ];
		this.kg = 0; this.kgT = 0;
	}

	update( p, dt, ctx ) {
		const g = this.game, P = g.physics, k = keys( ctx ), H = this.H, mods = ctx.mods || { speed: 1 };
		this.t += dt;
		if ( ! g.placeables?.list?.has( this.rec.id ) ) { this.end( 'gone' ); return true; }
		this.kgT -= dt;
		if ( this.kgT <= 0 ) { this.kgT = 1; this.kg = this.sys.loadOf( this.rec ); }
		if ( this.pull ) return this._pull( p, dt, ctx, k, mods );
		if ( this.riding ) return this._ride( p, dt, k );
		// the cart's way: it follows the view, as fast as its wheels turn
		let turn = 0;
		if ( k.left ) turn += 1;
		if ( k.right ) turn -= 1;
		const target = p.yaw + turn * 0.5;
		const lim = H.turn * dt;
		this.heading += clamp( wrap( target - this.heading ), - lim, lim );
		const hx = - Math.sin( this.heading ), hz = - Math.cos( this.heading );
		const box = P.ground( this.cart.x, this.cart.z, this.cart.y + 0.05, 0.1, 0.1 ).box;
		this.surface = this.sys.surface( this.cart.x, this.cart.z, box );
		const pace = 3.8 * ( H.speed[ this.surface ] ?? 0.5 ) * loadK( this.kg ) * ( mods.speed ?? 1 );
		const want = k.fwd ? pace : k.back ? - pace * 0.5 : 0;
		this.v = approach( this.v, want, dt * 4 );
		if ( k.jump && H.rideable && this.v > 1.2 && this.surface === 'paved' ) { this._hopOn( p ); return true; }
		// the cart goes first: if it can't, neither can you
		const nx = p.pos.x + hx * ( this.v * dt + H.at ), nz = p.pos.z + hz * ( this.v * dt + H.at );
		const c = _v.set( nx, this.cart.y, nz );
		const blocked = P.resolveCylinder( c, 0.42, 0.9, H.step );
		const cy = P.ground( c.x, c.z, this.cart.y + H.step, H.step, 0.3 ).y;
		if ( blocked || cy > this.cart.y + H.step || cy < this.cart.y - 0.6 ) {
			this.v = 0;
			if ( k.fwd && ! this._bumpT ) { this._bumpT = 0.6; this.sys.sound( 'mob_bump', this.cart, 0.4 ); }
		} else {
			p.pos.x += hx * this.v * dt; p.pos.z += hz * this.v * dt;
		}
		this._bumpT = Math.max( 0, ( this._bumpT || 0 ) - dt );
		P.resolveCylinder( p.pos, R, 1.8, 0.45 );
		const gr = P.ground( p.pos.x, p.pos.z, p.pos.y + 0.45, 0.45, R );
		if ( gr.y < p.pos.y - 0.6 ) { this.sys.letGoHaul( this, 'Lost your grip' ); return true; }
		p.pos.y = gr.y;
		this._place( p, hx, hz, dt );
		// uphill with a load is work
		if ( this.v > 0.2 ) {
			const up = Math.max( 0, ( this.cart.y - this._lastCy ) / Math.max( 1e-3, this.v * dt ) );
			this.sys.useStamina( ( 0.6 + up * 14 * ( 0.5 + this.kg / 80 ) ) * dt );
		}
		this._lastCy = this.cart.y;
		this._common( p, dt, this.v );
		return true;
	}

	// the cart in front of you (or the wagon behind), its wheels on the ground, tipped to the slope
	_place( p, hx, hz, dt ) {
		const P = this.game.physics, H = this.H;
		const cx = p.pos.x + hx * H.at, cz = p.pos.z + hz * H.at;
		const gy = P.ground( cx, cz, Math.max( p.pos.y, this.cart.y ) + H.step + 0.05, H.step + 0.4, 0.2 ).y;
		this.cart.set( cx, approach( this.cart.y, gy, dt * 14 ), cz );
		const fy = P.ground( cx + hx * 0.45, cz + hz * 0.45, this.cart.y + 0.3, 0.5, 0 ).y, by = P.ground( cx - hx * 0.45, cz - hz * 0.45, this.cart.y + 0.3, 0.5, 0 ).y;
		this.pitch = approach( this.pitch, Math.atan2( fy - by, 0.9 ), dt * 8 );
		this.sys.moveRecord( this.rec, this.cart, this.heading + ( this.pull ? 0 : 0 ), this.pitch, this.pull );
		// the hands on the handle (world points mapped into the view)
		if ( this.view ) {
			const hy = this.cart.y + ( this.rec.stack?.id === 'wheelbarrow' ? 0.72 : this.rec.stack?.id === 'hand_truck' ? 1.12 : 1.0 );
			const back = H.at - ( this.rec.stack?.id === 'wheelbarrow' ? 0.85 : this.rec.stack?.id === 'hand_truck' ? 0.45 : 0.5 );
			const sx = Math.cos( this.heading ), sz = - Math.sin( this.heading );
			const half = this.rec.stack?.id === 'wheelbarrow' ? 0.28 : 0.22;
			for ( let i = 0; i < 2; i ++ ) {
				const s = i === 0 ? 1 : - 1;
				this._w[ i ].set( p.pos.x + hx * back + sx * half * s, hy, p.pos.z + hz * back + sz * half * s );
			}
			this.view.world = this._w;
		}
	}

	// a wagon on its handle behind you: you walk as usual, a little slower; it trails along
	_pull( p, dt, ctx, k, mods ) {
		const g = this.game, P = g.physics, H = this.H;
		// walking is Player's: this frame goes back to it, with the move mods slowing it (runtime.js)
		const L = Math.abs( H.at );
		const dx = this.cart.x - p.pos.x, dz = this.cart.z - p.pos.z, d = Math.hypot( dx, dz ) || 1;
		if ( d > L ) { this.cart.x = p.pos.x + dx / d * L; this.cart.z = p.pos.z + dz / d * L; }
		const c = _v.copy( this.cart );
		P.resolveCylinder( c, 0.35, 0.8, H.step );
		const box = P.ground( c.x, c.z, this.cart.y + 0.05, 0.1, 0.1 ).box;
		this.surface = this.sys.surface( c.x, c.z, box );
		this.cart.x = c.x; this.cart.z = c.z;
		this.cart.y = approach( this.cart.y, P.ground( c.x, c.z, Math.max( p.pos.y, this.cart.y ) + H.step + 0.05, H.step + 0.6, 0.2 ).y, dt * 12 );
		this.heading = Math.atan2( dx, dz ); // the handle points at you
		if ( Math.hypot( this.cart.x - p.pos.x, this.cart.z - p.pos.z ) > L + 1.5 || this.cart.y > p.pos.y + 1.2 ) { this.sys.letGoHaul( this, 'Stuck' ); return false; }
		this.sys.moveRecord( this.rec, this.cart, this.heading, 0, true );
		this._common( p, dt, p.speedNow || 0 );
		return false;
	}

	_hopOn( p ) {
		this.riding = true;
		this.rv = Math.max( this.v, 1.5 );
		this.eye = 1.95;
		this.hint = HINTS.cartRide;
		this.view = null;
		this.sys.sound( 'mob_bump', this.cart, 0.5 );
	}

	// riding the back of a shopping cart down a hill: no steering to speak of, a foot to brake, a crash if it hits
	_ride( p, dt, k ) {
		const g = this.game, P = g.physics, H = this.H;
		if ( k.jump || ( this.rv < 0.3 && this.t > 1 ) ) { this.riding = false; this.eye = null; this.hint = HINTS.pushCart; this.v = 0; this.view = new HaulMode( this.sys, this.rec ).view; return true; }
		let turn = 0;
		if ( k.left ) turn += 1;
		if ( k.right ) turn -= 1;
		this.heading += turn * 0.5 * dt;
		const hx = - Math.sin( this.heading ), hz = - Math.cos( this.heading );
		const ya = P.ground( this.cart.x + hx * 0.4, this.cart.z + hz * 0.4, this.cart.y + 0.3, 0.3, 0 ).y, yb = P.ground( this.cart.x - hx * 0.4, this.cart.z - hz * 0.4, this.cart.y + 0.3, 0.3, 0 ).y;
		const grade = clamp( ( ya - yb ) / 0.8, - 1, 1 );
		const box = P.ground( this.cart.x, this.cart.z, this.cart.y + 0.05, 0.1, 0.1 ).box;
		this.surface = this.sys.surface( this.cart.x, this.cart.z, box );
		const roll = H.roll[ this.surface ] ?? 0.3;
		this.rv += ( - G * grade - roll * G - 0.004 * this.rv * this.rv - ( k.back ? 2.2 : 0 ) ) * dt;
		this.rv = clamp( this.rv, 0, 14 );
		const ox = p.pos.x, oz = p.pos.z;
		p.pos.x += hx * this.rv * dt; p.pos.z += hz * this.rv * dt;
		const c = _v.set( p.pos.x + hx * H.at, this.cart.y, p.pos.z + hz * H.at );
		if ( P.resolveCylinder( c, 0.42, 0.9, 0.1 ) || P.resolveCylinder( p.pos, R, 1.8, 0.1 ) ) {
			if ( this.rv > 3.2 ) { this.sys.cartCrash( this, this.rv ); return true; }
			p.pos.x = ox; p.pos.z = oz; this.rv = 0;
		}
		p.pos.y = P.ground( p.pos.x, p.pos.z, p.pos.y + 0.3, 0.35, R ).y;
		this._place( p, hx, hz, dt );
		p.yaw += wrap( this.heading - p.yaw ) * Math.min( 1, dt * 1.5 ) * 0; // (the view stays yours)
		this._common( p, dt, this.rv );
		return true;
	}

	_common( p, dt, v ) {
		p.speedNow = Math.abs( v ); p.moving = Math.abs( v ) > 0.1; p.sprinting = false; p.onGround = true; p.fallStart = null;
		if ( ! this.pull ) { p.vel.set( - Math.sin( this.heading ) * v, 0, - Math.cos( this.heading ) * v ); p.distance += Math.abs( v ) * dt; }
		this.noiseT -= dt;
		if ( this.noiseT <= 0 && Math.abs( v ) > 0.4 ) {
			this.noiseT = 0.6;
			const loud = this.H.noise * clamp( Math.abs( v ) / 2.5, 0.4, 1.6 ) * ( this.surface === 'paved' ? 1 : 0.7 );
			this.sys.noise( this.cart, loud, 'cart' );
		}
		this.sys.haulSound( this, Math.abs( v ) );
	}

	prompt() { return { label: 'Let go', sub: getItem( this.rec.stack?.id )?.name || 'Cart', action: () => this.sys.letGoHaul( this ) }; }
	hud() { return this.riding ? { name: 'Shopping cart', speed: this.rv } : null; }
}

// =====================================================================================================================
// zipline
// =====================================================================================================================

export class ZipMode extends Mode {
	// rec: the zipline (data.a the higher end, data.b the lower); s0: where on it (0..1); trolley: the stack, or null to
	// go hand over hand
	constructor( sys, rec, s0, trolley ) {
		super( sys, 'zip' );
		this.rec = rec;
		this.a = rec.data.a; this.b = rec.data.b;
		this.L = Math.hypot( this.b.x - this.a.x, this.b.y - this.a.y, this.b.z - this.a.z );
		this.s = clamp( s0, 0, 1 );
		this.v = 0;
		this.trolley = trolley;
		this.busyHands = true;
		this.hint = trolley ? HINTS.zip : HINTS.hand;
		this.sag = rec.data.sag ?? ZIP.sag;
		this.view = { obj: null, grips: { R: grip( [ 0.08, 0.3, - 0.2 ], [ 1, 0, 0 ], [ 0, 0, 1 ], 0.015 ), L: grip( [ - 0.08, 0.3, - 0.2 ], [ 1, 0, 0 ], [ 0, 0, 1 ], 0.015 ) }, cam: true, kind: 'zip' };
		this._w = [ new THREE.Vector3(), new THREE.Vector3() ];
		this.noiseT = 0; this.hand = 0;
		this.dir = new THREE.Vector3( this.b.x - this.a.x, 0, this.b.z - this.a.z ).normalize();
	}

	update( p, dt, ctx ) {
		const g = this.game, P = g.physics, k = keys( ctx );
		this.t += dt;
		if ( ! g.placeables?.list?.has( this.rec.id ) ) { this.sys.letGo( this ); return true; }
		if ( k.jump ) { this.sys.letGo( this, new THREE.Vector3( this.dir.x * this.v, 0, this.dir.z * this.v ) ); return true; }
		const grade = zipGrade( this.a, this.b, this.s, this.sag );
		let dv = 0;
		if ( this.trolley ) {
			this.v = Math.max( 0, this.v + zipAccel( grade, this.v, k.back ) * dt );
			dv = this.v;
		} else {
			// hand over hand: along the way you look, slowly, while the arms last
			const look = - Math.sin( p.yaw ) * this.dir.x - Math.cos( p.yaw ) * this.dir.z >= 0 ? 1 : - 1;
			const st = g.survival?.stamina ?? 100;
			dv = ( k.fwd ? 1 : k.back ? - 1 : 0 ) * look * ZIP.hand;
			this.sys.useStamina( ( dv ? ZIP.handStamina : 2.5 ) * dt );
			if ( st <= 1 ) { this.sys.letGo( this ); g.toast?.( 'Arms gave out', 'warn' ); return true; }
			this.hand += Math.abs( dv ) * dt * 3;
		}
		this.s = clamp( this.s + dv * dt / this.L, 0, 1 );
		const c = zipShape( this.a, this.b, this.s, this.sag, _c );
		p.pos.set( c.x, c.y - ZIP.hang - 0.2, c.z );
		p.vel.set( this.dir.x * dv, 0, this.dir.z * dv );
		p.speedNow = Math.abs( dv ); p.moving = Math.abs( dv ) > 0.1; p.onGround = false; p.fallStart = null; p.sprinting = false; p.swimming = false;
		p.distance += Math.abs( dv ) * dt;
		// feet on the ground (a sagging line over a rise, or the far end low): off
		const gr = P.ground( p.pos.x, p.pos.z, p.pos.y + 0.3, 0.3, R );
		if ( gr.y >= p.pos.y ) { p.pos.y = gr.y; p.onGround = true; this.end( 'ground' ); return true; }
		// the far end: a hard stop into the strap if you didn't brake
		if ( this.trolley && this.s >= 1 ) {
			if ( this.v > ZIP.slam ) { g.survival?.hurt?.( ( this.v - ZIP.slam ) * 3, 'fall', { fall: 1, cause: 'a zipline' } ); g.toast?.( 'Slammed into the end', 'warn' ); }
			this.sys.sound( 'mob_bump', p.pos, 0.6 );
			this.sys.letGo( this );
			return true;
		}
		if ( this.trolley ) {
			this.noiseT -= dt;
			if ( this.noiseT <= 0 && this.v > 2 ) { this.noiseT = 0.5; this.sys.noise( p.pos, 10 + this.v * 1.5, 'zip' ); }
		}
		// the hands on the trolley's bar overhead (or hand over hand on the cable)
		const w = this._w;
		for ( let i = 0; i < 2; i ++ ) {
			const sgn = i === 0 ? 1 : - 1;
			const ds = this.trolley ? 0 : ( 0.22 * sgn + 0.12 * Math.sin( this.hand + i * Math.PI ) ) / this.L;
			const cc = zipShape( this.a, this.b, clamp( this.s + ds, 0, 1 ), this.sag, _c2 );
			const px = - this.dir.z, pz = this.dir.x;
			w[ i ].set( cc.x + ( this.trolley ? px * 0.2 * sgn : 0 ), cc.y - ( this.trolley ? 0.32 : 0.02 ), cc.z + ( this.trolley ? pz * 0.2 * sgn : 0 ) );
		}
		this.view.world = w;
		this.sys.zipSound( this, this.trolley ? this.v : 0 );
		return true;
	}

	prompt() { return { label: 'Let go', sub: 'Zipline', action: () => this.sys.letGo( this ) }; }
	hud() { return this.trolley ? { name: 'Zipline', speed: this.v } : null; }
}
