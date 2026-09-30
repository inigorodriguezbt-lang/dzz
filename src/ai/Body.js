// The body of a human character (the infected and survivors): locomotion from the motion-capture clip bank,
// procedural layers on top (hunch, head look, reaching arms, swipes, bites, door pounding, feeding, hit
// flinches, twitches), crawling, a verlet ragdoll for deaths and knockdowns, a plank rise back onto the feet,
// and hit capsules that follow the bones.
//
// Character space is the avatar's armature frame (y up, centimetres, see Anim.js); the rig's helpers take
// directions there. The body never allocates per frame.
import * as THREE from 'three';
// (Math.hypot boxes its arguments in V8: garbage on hot paths)
const hyp = ( a, b ) => Math.sqrt( a * a + b * b );
const hyp3 = ( a, b, c ) => Math.sqrt( a * a + b * b + c * c );

const TAU = Math.PI * 2;
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const smooth = ( a, b, x ) => { const t = clamp( ( x - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
const rnd = Math.random;

// ragdoll particles: [ rig bone key (joint position), collision radius ]
const RP = [ [ 'pelvis', 0.12 ], [ 'spine2', 0.14 ], [ 'neck', 0.08 ], [ 'head', 0.11 ], [ 'lUpper', 0.07 ], [ 'lFore', 0.05 ], [ 'lHand', 0.05 ],
	[ 'rUpper', 0.07 ], [ 'rFore', 0.05 ], [ 'rHand', 0.05 ], [ 'lThigh', 0.08 ], [ 'lCalf', 0.06 ], [ 'lFoot', 0.05 ], [ 'rThigh', 0.08 ], [ 'rCalf', 0.06 ], [ 'rFoot', 0.05 ] ];
const P_ = 0, C_ = 1, N_ = 2, H_ = 3, LS = 4, LE = 5, LH = 6, RS = 7, RE = 8, RH = 9, LHP = 10, LK = 11, LF = 12, RHP = 13, RK = 14, RF = 15;
const NP = RP.length;
// distance constraints: limbs, then a braced torso (keeps its shape without joint limits)
const LINKS = [
	[ LS, LE ], [ LE, LH ], [ RS, RE ], [ RE, RH ], [ LHP, LK ], [ LK, LF ], [ RHP, RK ], [ RK, RF ],
	[ P_, C_ ], [ C_, N_ ], [ N_, H_ ], [ LS, RS ], [ LHP, RHP ], [ LS, C_ ], [ RS, C_ ], [ LS, N_ ], [ RS, N_ ], [ LHP, P_ ], [ RHP, P_ ],
	[ LS, LHP ], [ RS, RHP ], [ LS, RHP ], [ RS, LHP ], [ C_, LHP ], [ C_, RHP ], [ P_, N_ ], [ H_, LS ], [ H_, RS ], [ H_, C_ ], [ P_, LS ], [ P_, RS ],
];
// joints that must not fold flat: [ a, b, min fraction of the straight length, via ]
const MINS = [ [ LHP, LF, 0.55, LK ], [ RHP, RF, 0.55, RK ], [ LS, LH, 0.35, LE ], [ RS, RH, 0.35, RE ] ];

// hit capsules: [ point a, point b, radius (m at scale 1), zone ]. The torso stops short of the neck so its round end
// cap does not swallow the jaw and face (a shot at the head must count as a headshot); the skull is its own capsule
// from the head joint (top of the neck) up to the crown, the throat a thin one below it.
const CAPS = [
	[ 'head', 'headTop', 0.1, 'head' ], [ 'neck', 'head', 0.06, 'neck' ],
	[ 'pelvis', 'spine2', 0.16, 'torso' ], [ 'spine2', 'chestTop', 0.145, 'torso' ], [ 'lUpper', 'rUpper', 0.075, 'torso' ],
	[ 'lUpper', 'lFore', 0.06, 'arm' ], [ 'lFore', 'lHand', 0.05, 'arm' ], [ 'rUpper', 'rFore', 0.06, 'arm' ], [ 'rFore', 'rHand', 0.05, 'arm' ],
	[ 'lThigh', 'lCalf', 0.085, 'leg' ], [ 'lCalf', 'lFoot', 0.065, 'leg' ], [ 'rThigh', 'rCalf', 0.085, 'leg' ], [ 'rCalf', 'rFoot', 0.065, 'leg' ],
];
const CAP_KEYS = [ 'neck', 'pelvis', 'spine2', 'lUpper', 'lFore', 'lHand', 'rUpper', 'rFore', 'rHand', 'lThigh', 'lCalf', 'lFoot', 'rThigh', 'rCalf', 'rFoot', 'head' ];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();

// ray (o, d unit) vs capsule a-b radius r: distance or null
export function rayCapsule( o, d, a, b, r, maxT ) {
	const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
	const oax = o.x - a.x, oay = o.y - a.y, oaz = o.z - a.z;
	const baba = bax * bax + bay * bay + baz * baz;
	const bard = bax * d.x + bay * d.y + baz * d.z;
	const baoa = bax * oax + bay * oay + baz * oaz;
	const rdoa = d.x * oax + d.y * oay + d.z * oaz;
	const oaoa = oax * oax + oay * oay + oaz * oaz;
	const A = baba - bard * bard;
	let B = baba * rdoa - baoa * bard;
	let C = baba * oaoa - baoa * baoa - r * r * baba;
	let h = B * B - A * C;
	let y = 0;
	if ( h >= 0 && A > 1e-9 ) {
		const t = ( - B - Math.sqrt( h ) ) / A;
		y = baoa + t * bard;
		if ( y > 0 && y < baba ) return t >= 0 && t <= maxT ? t : ( t < 0 && ( - B + Math.sqrt( h ) ) / A > 0 ? 0 : null );
	} else y = baoa;
	// the end caps
	let cx = oax, cy = oay, cz = oaz;
	if ( y > 0 ) { cx = o.x - b.x; cy = o.y - b.y; cz = o.z - b.z; }
	B = d.x * cx + d.y * cy + d.z * cz;
	C = cx * cx + cy * cy + cz * cz - r * r;
	h = B * B - C;
	if ( h < 0 ) return null;
	const t = - B - Math.sqrt( h );
	if ( t > maxT ) return null;
	if ( t < 0 ) return - B + Math.sqrt( h ) > 0 ? 0 : null;
	return t;
}

export class HumanBody {
	// inst: CharacterInstance; style: { idle, walk, run (clip names), hunch, reach, tilt, limp, twitch, arms: 'hang'|'reach'|'swing'|'rifle' }
	constructor( inst, style = {} ) {
		this.inst = inst;
		this.rig = inst.rig;
		this.info = inst.rig.info;
		this.bank = inst.rig.bank;
		this.style = Object.assign( { idle: 'idle_drunk', walk: 'walk_drunk', run: 'run_injured', hunch: 0.25, reach: 0, tilt: 0.1, twitch: 0.5, arms: 'hang', gaitScale: 1 }, style );
		this.clip = { idle: this.bank.get( this.style.idle ), walk: this.bank.get( this.style.walk ), run: this.bank.get( this.style.run ),
			crouch: this.bank.get( 'crouch_idle' ), knock: this.bank.get( 'knock_door' ), idle0: this.bank.get( 'idle' ), look: this.bank.get( 'look_around' ) };
		this.t = { idle: rnd() * 20, walk: rnd() * 3, run: rnd() * 2, aux: 0, life: rnd() * 100 };
		this.seed = rnd() * 100;
		this.mode = 'stand'; // stand | crawl | ragdoll | rise | lying | static
		this.speed = 0; // m/s over ground (smoothed by the caller)
		this.turn = 0; // rad/s
		this.crouch = 0; // 0..1 blend towards crouching (survivors)
		this.reachW = 0; // arms reaching forward (chasing)
		this.searchW = 0; this.searching = false; // standing still, casting about for what made the noise
		this.aggro = 0; // 0 idle .. 1 hunting: more hunch, open mouth
		this.jaw = 0; this.jawT = 0;
		this.look = new THREE.Vector3(); this.lookW = 0; // world point to look at
		this.aimPitch = 0; // survivors holding a rifle
		this.action = null; // { kind: 'swipeL'|'swipeR'|'bite'|'bash'|'eat'|'shove', t, dur }
		// hit flinch springs (character frame): torso pitch / roll, head yaw / pitch
		this.spr = new Float32Array( 8 ); // value, velocity pairs
		this.twitchT = 1 + rnd() * 4;
		this.twitchK = 0; this.twitchA = 0; this.twitchB = 0;
		// ragdoll state
		this.rag = null;
		this.pose = null; // snapshot for blends out of the ragdoll
		this.riseT = 0; this.riseDur = 1.6; this.riseFace = 1;
		this.tilt = new THREE.Quaternion();
		this.tiltAngle = 0;
		this.headTop = new THREE.Vector3();
		this.centre = new THREE.Vector3();
		this.bp = {};
		for ( const k of CAP_KEYS ) this.bp[ k ] = new THREE.Vector3();
		this.bp.headTop = new THREE.Vector3();
		this.bp.chestTop = new THREE.Vector3();
	}

	// ---- animation ------------------------------------------------------------------------------------------

	// advance clocks by dt and pose the rig (call at the LOD rate with the accumulated dt)
	update( dt ) {
		if ( this.mode === 'static' ) return;
		if ( this.mode === 'ragdoll' ) { this._ragdollStep( dt ); this._ragdollPose(); return; }
		const rig = this.rig, S = this.style, I = this.info;
		this.t.life += dt;
		rig.clearOverlays();
		rig.begin();
		if ( this.mode === 'rise' ) { this._rise( dt ); rig.end(); return; }
		if ( this.mode === 'lying' ) { this._lying(); rig.end(); return; }
		if ( this.mode === 'crawl' ) { this._crawl( dt ); rig.end(); return; }
		const v = this.speed;
		const scale = this.inst.scale * this.rig.pelvisScale;
		// locomotion weights: idle -> walk -> run by speed, playback rates matched to the ground speed
		const wc = this.clip.walk, rc = this.clip.run;
		const walkV = wc.speed * scale * S.gaitScale, runV = rc.speed * scale;
		let wIdle = 1 - smooth( 0.05, walkV * 0.45, v );
		let wRun = smooth( walkV * 1.5, Math.max( walkV * 1.9, runV * 0.75 ), v );
		let wWalk = Math.max( 0, 1 - wIdle - wRun );
		const walkRate = clamp( v / walkV, 0.55, 1.9 ), runRate = clamp( v / runV, 0.7, 1.45 );
		this.t.idle += dt;
		this.t.walk += dt * ( wWalk > 0.01 ? walkRate : 1 );
		this.t.run += dt * ( wRun > 0.01 ? runRate : 1 );
		const act = this.action;
		let wAct = 0;
		if ( act ) {
			act.t += dt;
			// ease in and out over a fixed time (long actions like feeding hold at full weight)
			const ramp = Math.min( 0.15, act.dur * 0.15 );
			wAct = clamp( Math.min( act.t / ramp, ( act.dur - act.t ) / ramp ), 0, 1 );
			if ( act.t >= act.dur ) this.action = null;
		}
		// crouching (survivors) and whole-body actions borrow other clips
		const crouch = this.crouch;
		if ( act && ( act.kind === 'bash' || act.kind === 'eat' ) ) {
			const w = clamp( wAct, 0, 1 );
			wIdle *= 1 - w; wWalk *= 1 - w; wRun *= 1 - w;
			if ( act.kind === 'bash' ) rig.add( this.clip.knock, 2.6 + act.t * 1.7, w );
			else rig.add( this.clip.crouch, act.t * 0.6, w );
		}
		if ( crouch > 0.01 ) { rig.add( this.clip.crouch, this.t.idle, crouch ); wIdle *= 1 - crouch; }
		this.searchW += ( ( this.searching ? 1 : 0 ) - this.searchW ) * Math.min( 1, dt * 2 );
		if ( this.searchW > 0.01 && this.clip.look ) { rig.add( this.clip.look, this.t.idle * 0.8, wIdle * this.searchW ); wIdle *= 1 - this.searchW; }
		rig.add( this.clip.idle, this.t.idle, wIdle );
		rig.add( wc, this.t.walk, wWalk );
		rig.add( rc, this.t.run, wRun );

		// ---- procedural layers ----
		const aggro = this.aggro;
		const hunch = S.hunch * ( 0.7 + aggro * 0.6 ) * ( 1 - crouch );
		const life = this.t.life + this.seed;
		// spine: a slumped, forward-leaning carriage; the head hangs and rolls
		rig.bend( 'spine', hunch * 0.35 );
		rig.bend( 'spine1', hunch * 0.45 );
		rig.bend( 'spine2', hunch * 0.35, 0, Math.sin( life * 0.37 ) * S.tilt * 0.3 );
		rig.bend( 'neck', - hunch * 0.35 );
		const roll = S.tilt * ( 0.6 + 0.4 * Math.sin( life * 0.23 ) );
		rig.bend( 'head', - hunch * 0.25 + Math.sin( life * 0.31 ) * 0.06, Math.sin( life * 0.17 ) * 0.1, roll );
		// look at a point of interest (yaw / pitch towards it from the torso's facing)
		if ( this.lookW > 0.01 ) {
			const r = this.inst.root.position, yaw = this._yaw;
			const dx = this.look.x - r.x, dz = this.look.z - r.z, dy = this.look.y - ( r.y + 1.6 * this.inst.scale );
			let a = Math.atan2( - dx, - dz ) - yaw;
			a = Math.atan2( Math.sin( a ), Math.cos( a ) );
			a = clamp( a, - 1.1, 1.1 ) * this.lookW;
			const p = clamp( Math.atan2( dy, hyp( dx, dz ) ), - 0.6, 0.5 ) * this.lookW;
			rig.bend( 'neck', - p * 0.4, a * 0.4 );
			rig.bend( 'head', - p * 0.6, a * 0.6 );
		}
		// arms
		this._arms( wWalk + wRun, act, wAct );
		// the action's torso motion
		if ( act ) this._actionBody( act, wAct );
		// flinches from hits (springs)
		this._springs( dt );
		const s = this.spr;
		rig.bend( 'spine1', s[ 0 ] * 0.5, 0, s[ 2 ] * 0.5 );
		rig.bend( 'spine2', s[ 0 ] * 0.5, 0, s[ 2 ] * 0.5 );
		rig.bend( 'head', s[ 6 ], s[ 4 ] );
		// twitches: sudden jerks of the head or a shoulder
		this._twitch( dt );
		// jaw: hangs open while hunting, snaps while biting, works while feeding
		this.jawT += dt;
		let jaw = 0.15 + aggro * 0.45 + Math.max( 0, Math.sin( this.jawT * 1.3 + this.seed ) ) * 0.2;
		if ( act?.kind === 'bite' ) jaw = 1;
		if ( act?.kind === 'eat' ) jaw = 0.4 + 0.5 * Math.abs( Math.sin( act.t * 7 ) );
		this.jaw += ( Math.max( jaw, this.jawOpen || 0 ) - this.jaw ) * Math.min( 1, dt * 8 );
		rig.jawOpen = this.jaw;
		// survivors aim a long gun: pitch the upper body
		if ( S.arms === 'rifle' && this.aimPitch ) { rig.bend( 'spine1', - this.aimPitch * 0.5 ); rig.bend( 'spine2', - this.aimPitch * 0.5 ); }
		rig.end();
	}

	// character-space direction from forward / up / right amounts (character's own right)
	_dir( f, u, r, out = _v ) {
		const I = this.info;
		return out.set( I.fwd.x * f + I.right.x * r, u, I.fwd.z * f + I.right.z * r );
	}

	_arms( moving, act, wAct ) {
		const rig = this.rig, S = this.style, I = this.info, m = I.mirror;
		const life = this.t.life + this.seed;
		// "left" bones sit on the character's left: right-axis sign -m
		const L = - m, R = m;
		if ( S.arms === 'rifle' ) {
			// both hands on a long gun held across the chest, muzzle forward
			const p = this.aimPitch;
			this._aim( 'rUpper', 0.25, - 0.9, R * 0.25, 1 );
			this._aim( 'rFore', 0.95, 0.1 + p, - R * 0.3, 1 );
			this._aim( 'lUpper', 0.55, - 0.6, L * 0.05, 1 );
			this._aim( 'lFore', 0.85, 0.2 + p, - L * 0.35, 1 );
			return;
		}
		let reach = this.reachW;
		if ( S.arms === 'reach' ) reach = Math.max( reach, 0.55 + 0.25 * Math.sin( life * 0.4 ) );
		if ( reach > 0.02 ) {
			// arms out towards the prey, uneven and wavering
			const sw = Math.sin( life * 2.3 ) * 0.08, sw2 = Math.sin( life * 1.7 + 1 ) * 0.08;
			this._aim( 'lUpper', 0.9, - 0.12 + sw, L * 0.28, reach );
			this._aim( 'lFore', 0.95, 0.05 + sw2, - L * 0.05, reach );
			this._aim( 'rUpper', 0.9, - 0.28 + sw2, R * 0.3, reach * 0.85 );
			this._aim( 'rFore', 0.9, - 0.05 + sw, - R * 0.1, reach * 0.85 );
		} else if ( S.arms === 'hang' ) {
			// limp arms: pulled a little forward by the hunch and swinging slightly out of step
			const sw = Math.sin( life * 1.1 ) * 0.1;
			this._aim( 'lUpper', 0.25 + sw, - 1, L * 0.12, 0.45 * ( 1 - moving * 0.6 ) );
			this._aim( 'rUpper', 0.2 - sw, - 1, R * 0.12, 0.45 * ( 1 - moving * 0.6 ) );
		}
		if ( ! act || ( act.kind !== 'swipeL' && act.kind !== 'swipeR' && act.kind !== 'bite' && act.kind !== 'eat' && act.kind !== 'shove' ) ) return;
		const k = act.t / act.dur;
		if ( act.kind === 'swipeL' || act.kind === 'swipeR' ) {
			// windup high and wide, a hooking strike down and across, follow-through low
			const side = act.kind === 'swipeL' ? L : R;
			const ub = act.kind === 'swipeL' ? 'lUpper' : 'rUpper', fb = act.kind === 'swipeL' ? 'lFore' : 'rFore';
			let f, u, r, f2, u2, r2;
			// (wind-up: the upper arm drawn out and back at shoulder height, the forearm cocked up, clawed hand high)
			if ( k < 0.45 ) { const s = smooth( 0, 1, k / 0.45 ); f = 0.3 - s * 0.65; u = - 0.2 + s * 0.6; r = side * ( 0.5 + s * 0.4 ); f2 = 0.35 + s * 0.05; u2 = - 0.1 + s * 0.85; r2 = side * 0.25; }
			else if ( k < 0.65 ) { const s = smooth( 0, 1, ( k - 0.45 ) / 0.2 ); f = - 0.35 + s * 1.35; u = 0.4 - s * 0.5; r = side * ( 0.9 - s * 1.2 ); f2 = 0.4 + s * 0.6; u2 = 0.75 - s * 1.1; r2 = side * ( 0.25 - s * 0.85 ); }
			else { f = 1; u = - 0.1; r = - side * 0.3; f2 = 1; u2 = - 0.35; r2 = - side * 0.6; }
			this._aim( ub, f, u, r, wAct );
			this._aim( fb, f2, u2, r2, wAct );
		} else if ( act.kind === 'bite' || act.kind === 'shove' ) {
			// both hands grab forward and pull in
			const pull = k > 0.55 ? ( k - 0.55 ) / 0.45 : 0;
			this._aim( 'lUpper', 1, 0.05, L * 0.2, wAct );
			this._aim( 'rUpper', 1, 0.05, R * 0.2, wAct );
			this._aim( 'lFore', 1 - pull * 0.6, 0.1, - L * ( 0.1 + pull * 0.6 ), wAct );
			this._aim( 'rFore', 1 - pull * 0.6, 0.1, - R * ( 0.1 + pull * 0.6 ), wAct );
		} else if ( act.kind === 'eat' ) {
			// hands down on the carcass, tearing
			const tear = Math.sin( act.t * 3.1 ) * 0.25;
			this._aim( 'lUpper', 0.8, - 0.7, L * 0.15, wAct );
			this._aim( 'rUpper', 0.8, - 0.7, R * 0.15, wAct );
			this._aim( 'lFore', 0.5, - 0.9 + tear, 0, wAct );
			this._aim( 'rFore', 0.5, - 0.9 - tear, 0, wAct );
		}
	}

	// aim bone k along the character-space direction ( forward f, up u, the character's right r ) with weight w
	_aim( k, f, u, r, w ) {
		const I = this.info;
		this.rig.aimAt( k, I.fwd.x * f + I.right.x * r, u, I.fwd.z * f + I.right.z * r, w );
	}

	_actionBody( act, w ) {
		const rig = this.rig, k = act.t / act.dur, I = this.info;
		if ( act.kind === 'swipeL' || act.kind === 'swipeR' ) {
			const side = act.kind === 'swipeL' ? 1 : - 1;
			const wind = k < 0.45 ? k / 0.45 : k < 0.65 ? 1 - ( k - 0.45 ) / 0.2 * 1.8 : - 0.8 * ( 1 - ( k - 0.65 ) / 0.35 );
			rig.bend( 'spine1', ( k > 0.45 ? 0.1 : - 0.08 ) * w, wind * 0.35 * side * w * I.mirror );
			rig.bend( 'spine2', ( k > 0.45 ? 0.08 : - 0.04 ) * w, wind * 0.25 * side * w * I.mirror );
		} else if ( act.kind === 'bite' ) {
			// lunge: the upper body and head drive forward and down at the neck
			const l = Math.sin( clamp( k, 0, 1 ) * Math.PI );
			rig.bend( 'spine1', 0.12 * l * w );
			rig.bend( 'spine2', 0.08 * l * w );
			rig.bend( 'neck', - 0.1 * l * w );
			rig.bend( 'head', 0.05 * l * w, Math.sin( act.t * 20 ) * 0.08 * l );
			this._dir( 1, 0, 0, _v ).multiplyScalar( 18 * l * w );
			rig.offsetPelvis( _v.x, - 4 * l * w, _v.z );
		} else if ( act.kind === 'bash' ) {
			rig.bend( 'spine1', 0.12 * w );
			rig.bend( 'head', 0.15 * w );
		} else if ( act.kind === 'eat' ) {
			rig.bend( 'spine', 0.2 * w ); rig.bend( 'spine1', 0.35 * w ); rig.bend( 'spine2', 0.25 * w );
			rig.bend( 'neck', 0.2 * w ); rig.bend( 'head', ( 0.35 + Math.sin( act.t * 3.1 ) * 0.15 ) * w, Math.sin( act.t * 5.3 ) * 0.2 * w );
		}
	}

	// hit reaction: dir = world direction the blow travelled, amount 0..2
	flinch( dir, amount = 1, zone = 'torso' ) {
		// into the root frame: forward is -z
		const yaw = this._yaw;
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c; // rotate by -yaw
		const s2 = this.spr;
		// travelling towards +z in root space means the blow came from the front: bend backwards
		s2[ 1 ] += - lz * 9 * amount * ( zone === 'head' ? 0.6 : 1 );
		s2[ 3 ] += lx * 7 * amount * this.info.mirror;
		if ( zone === 'head' ) { s2[ 7 ] += - lz * 16 * amount; s2[ 5 ] += lx * 14 * amount; }
	}

	_springs( dt ) {
		const s = this.spr, k = 90, c = 11;
		for ( let i = 0; i < 8; i += 2 ) {
			s[ i + 1 ] += ( - k * s[ i ] - c * s[ i + 1 ] ) * dt;
			s[ i ] += s[ i + 1 ] * dt;
			s[ i ] = clamp( s[ i ], - 0.9, 0.9 );
		}
	}

	_twitch( dt ) {
		const S = this.style;
		if ( ! S.twitch ) return;
		this.twitchT -= dt;
		if ( this.twitchT <= 0 ) {
			this.twitchT = ( 1.5 + rnd() * 6 ) / S.twitch;
			this.twitchK = 1; this.twitchA = ( rnd() - 0.5 ) * 0.7; this.twitchB = rnd() < 0.5 ? 0 : 1;
		}
		if ( this.twitchK > 0 ) {
			this.twitchK = Math.max( 0, this.twitchK - dt * 5 );
			const j = this.twitchK * this.twitchK;
			if ( this.twitchB ) this.rig.bend( 'head', j * this.twitchA * 0.5, 0, j * this.twitchA );
			else this.rig.bend( this.twitchA > 0 ? 'lClav' : 'rClav', 0, 0, j * this.twitchA * 0.8 );
		}
	}

	// start a timed action (the AI decides when): swipeL / swipeR / bite / bash / eat / shove
	act( kind, dur ) { this.action = { kind, t: 0, dur }; }

	// ---- crawling ---------------------------------------------------------------------------------------------

	// face down, dragging itself on its forearms; the entity places the root with crawlTilt()
	_crawl( dt ) {
		const rig = this.rig, I = this.info, m = I.mirror, L = - m, R = m;
		this.t.walk += dt * ( 0.25 + this.speed * 1.8 );
		const ph = this.t.walk * TAU * 0.5;
		const a = Math.sin( ph ), b = Math.sin( ph + Math.PI );
		rig.add( this.clip.idle0, 0.5, 1 );
		// in the lying frame "ahead along the ground" is the character's up, "down to the ground" its forward
		// chest up on the elbows, head raised to look ahead
		rig.bend( 'spine1', - 0.25 ); rig.bend( 'spine2', - 0.25 );
		rig.bend( 'neck', - 0.45 ); rig.bend( 'head', - 0.35, Math.sin( this.t.life * 0.7 ) * 0.2 );
		// arms: one reaches ahead and plants, the other pulls under the chest
		const reachL = Math.max( 0, a ), reachR = Math.max( 0, b );
		this._aim( 'lUpper', 0.35 + ( 1 - reachL ) * 0.4, 0.75 * reachL - 0.2 * ( 1 - reachL ), L * 0.45, 1 );
		this._aim( 'lFore', 0.55, 0.8 * reachL - 0.1, - L * 0.15, 1 );
		this._aim( 'rUpper', 0.35 + ( 1 - reachR ) * 0.4, 0.75 * reachR - 0.2 * ( 1 - reachR ), R * 0.45, 1 );
		this._aim( 'rFore', 0.55, 0.8 * reachR - 0.1, - R * 0.15, 1 );
		// legs drag behind, one knee working a little
		this._aim( 'lThigh', 0.1, - 1, L * 0.15, 1 );
		this._aim( 'rThigh', 0.1 + Math.max( 0, a ) * 0.3, - 1, R * 0.2, 1 );
		this._aim( 'lCalf', - 0.15, - 1, 0, 1 );
		this._aim( 'rCalf', - 0.35 * Math.max( 0, a ), - 1, 0, 1 );
		rig.jawOpen = 0.35 + Math.max( 0, Math.sin( this.t.life * 1.7 ) ) * 0.4;
		// the body rocks with each pull
		rig.bend( 'pelvis', 0, 0, ( a - b ) * 0.06 );
	}

	// root rotation for a lying body: face down (+1) or up (-1), angle in radians from upright
	tiltQuat( angle, face = 1, out = this.tilt ) {
		return out.setFromAxisAngle( _bx.set( 1, 0, 0 ), - angle * face );
	}

	// ---- lying still and rising ---------------------------------------------------------------------------------

	_lyingPose( w ) {
		const rig = this.rig, I = this.info, m = I.mirror;
		rig.add( this.clip.idle0, 3, w );
		const f = this.riseFace;
		// arms flopped out on the ground (a touch towards it: the ground is ahead of a body lying face down (f = 1) and
		// behind one lying on its back), one elbow bent, head turned to one side, legs apart
		this._aim( 'lUpper', 0.12 * f, - 0.6, - m * 0.75, 0.9 * w );
		this._aim( 'lFore', 0.1 * f, - 0.85, - m * 0.4, 0.9 * w );
		this._aim( 'rUpper', 0.12 * f, - 0.15, m * 0.95, 0.9 * w );
		this._aim( 'rFore', 0.1 * f, 0.55, m * 0.6, 0.9 * w );
		this._aim( 'lThigh', 0.05 * f, - 1, - m * 0.2, 0.7 * w );
		this._aim( 'rThigh', 0.05 * f, - 1, m * 0.25, 0.7 * w );
		this._aim( 'lCalf', 0.05 * f, - 1, - m * 0.22, 0.7 * w );
		this._aim( 'rCalf', 0.05 * f, - 1, m * 0.3, 0.7 * w );
		rig.bend( 'head', 0, 0.9 * ( this.seed % 2 < 1 ? 1 : - 1 ) * w );
	}

	_lying() { this._lyingPose( 1 ); }

	// plank rise pivoting about the feet (the entity tilts the root with riseTilt())
	_rise( dt ) {
		this.riseT += dt;
		const s = clamp( this.riseT / this.riseDur, 0, 1 );
		const rig = this.rig;
		const wPose = 1 - smooth( 0, 0.3, s );
		if ( this.pose ) { rig.addPose( this.pose, wPose ); } else this._lyingPose( wPose );
		rig.add( this.clip.crouch, 1.2 + s, Math.sin( s * Math.PI ) * 1.2 );
		rig.add( this.clip.idle, this.t.idle, smooth( 0.55, 1, s ) );
		rig.bend( 'spine1', ( 1 - s ) * 0.4 * this.riseFace );
		rig.jawOpen = 0.6;
		this.tiltAngle = Math.PI / 2 * ( 1 - smooth( 0.1, 0.85, s ) );
		if ( s >= 1 ) { this.mode = 'stand'; this.pose = null; this.tiltAngle = 0; }
	}

	startRise( face = this.riseFace ) {
		this.riseFace = face;
		this.riseT = 0;
		this.mode = 'rise';
		this.riseDur = 1.5 + rnd() * 0.6;
	}

	// ---- ragdoll -------------------------------------------------------------------------------------------------

	// go limp. vel: the body's velocity (world), hit: { point, dir, strength } or null. physics: game.physics
	ragdoll( physics, vel, hit = null ) {
		const inst = this.inst;
		inst.updateWorld();
		const n = NP;
		const r = this.rag || ( this.rag = {
			p: new Float32Array( n * 3 ), o: new Float32Array( n * 3 ), rest: new Float32Array( LINKS.length ), mins: new Float32Array( MINS.length ),
			charInv: new THREE.Matrix4(), acc: 0, calm: 0, t: 0, physics: null, gy: new Float32Array( n ), cp: [],
		} );
		for ( let i = 0; i < n; i ++ ) r.cp[ i ] = r.cp[ i ] || new THREE.Vector3();
		r.physics = physics; r.acc = 0; r.calm = 0; r.t = 0;
		r.charInv.copy( inst.avatar.matrixWorld ).invert();
		const h = 1 / 60;
		for ( let i = 0; i < n; i ++ ) {
			inst.bonePos( RP[ i ][ 0 ], _v );
			if ( i === H_ ) { inst.bonePos( 'neck', _v2 ); _v.addScaledVector( _v.clone().sub( _v2 ).normalize(), 0.04 ); }
			r.p[ i * 3 ] = _v.x; r.p[ i * 3 + 1 ] = _v.y; r.p[ i * 3 + 2 ] = _v.z;
			// previous position from the velocity (+ the hit, strongest near the impact)
			let vx = vel.x, vy = vel.y, vz = vel.z;
			if ( hit ) {
				const d = _v.distanceTo( hit.point );
				const k = hit.strength * Math.exp( - d * d / 0.25 ) + hit.strength * 0.25;
				// (a slight lift: a body thrown by the blow; more and it tips over like a plank, legs in the air)
				vx += hit.dir.x * k; vy += hit.dir.y * k * 0.3 + 0.1 * k; vz += hit.dir.z * k;
			}
			r.o[ i * 3 ] = _v.x - vx * h; r.o[ i * 3 + 1 ] = _v.y - vy * h; r.o[ i * 3 + 2 ] = _v.z - vz * h;
		}
		for ( let k = 0; k < LINKS.length; k ++ ) r.rest[ k ] = this._dist( r.p, LINKS[ k ][ 0 ], LINKS[ k ][ 1 ] );
		for ( let k = 0; k < MINS.length; k ++ ) {
			const [ a, b, f, v ] = MINS[ k ];
			r.mins[ k ] = ( this._dist( r.p, a, v ) + this._dist( r.p, v, b ) ) * f;
		}
		this.mode = 'ragdoll';
		this.action = null;
		this.asleep = false;
	}

	_dist( p, a, b ) { return hyp3( p[ a * 3 ] - p[ b * 3 ], p[ a * 3 + 1 ] - p[ b * 3 + 1 ], p[ a * 3 + 2 ] - p[ b * 3 + 2 ] ); }

	// shove a limp body (a later bullet, a blast)
	ragdollImpulse( point, dir, strength ) {
		const r = this.rag;
		if ( ! r || this.mode !== 'ragdoll' ) return;
		this.asleep = false; r.calm = 0;
		const h = 1 / 60;
		for ( let i = 0; i < NP; i ++ ) {
			const d = hyp3( r.p[ i * 3 ] - point.x, r.p[ i * 3 + 1 ] - point.y, r.p[ i * 3 + 2 ] - point.z );
			const k = strength * Math.exp( - d * d / 0.15 ) * h;
			r.o[ i * 3 ] -= dir.x * k; r.o[ i * 3 + 1 ] -= ( dir.y + 0.3 ) * k; r.o[ i * 3 + 2 ] -= dir.z * k;
		}
	}

	_ragdollStep( dt ) {
		const r = this.rag;
		if ( this.asleep ) return;
		const h = 1 / 60;
		r.acc = Math.min( r.acc + dt, h * 4 );
		let steps = 0;
		while ( r.acc >= h && steps < 4 ) { r.acc -= h; steps ++; this._verlet( h ); }
	}

	_verlet( h ) {
		const r = this.rag, p = r.p, o = r.o, P = r.physics;
		r.t += h;
		let maxMove = 0;
		// integrate
		for ( let i = 0; i < NP * 3; i += 3 ) {
			const x = p[ i ], y = p[ i + 1 ], z = p[ i + 2 ];
			const vx = ( x - o[ i ] ) * 0.995, vy = ( y - o[ i + 1 ] ) * 0.995, vz = ( z - o[ i + 2 ] ) * 0.995;
			o[ i ] = x; o[ i + 1 ] = y; o[ i + 2 ] = z;
			p[ i ] = x + vx; p[ i + 1 ] = y + vy - 9.81 * h * h; p[ i + 2 ] = z + vz;
			maxMove = Math.max( maxMove, Math.abs( vx ) + Math.abs( vy ) + Math.abs( vz ) );
		}
		// the ground under each particle, once per step (terrain, floors, props)
		for ( let i = 0; i < NP; i ++ ) r.gy[ i ] = P ? P.ground( p[ i * 3 ], p[ i * 3 + 2 ], p[ i * 3 + 1 ] + 0.25, 0.35, 0 ).y : 0;
		for ( let it = 0; it < 7; it ++ ) {
			for ( let k = 0; k < LINKS.length; k ++ ) {
				const a = LINKS[ k ][ 0 ] * 3, b = LINKS[ k ][ 1 ] * 3;
				const dx = p[ b ] - p[ a ], dy = p[ b + 1 ] - p[ a + 1 ], dz = p[ b + 2 ] - p[ a + 2 ];
				const L = Math.sqrt( dx * dx + dy * dy + dz * dz ) || 1e-6;
				const f = ( L - r.rest[ k ] ) / L * 0.5;
				p[ a ] += dx * f; p[ a + 1 ] += dy * f; p[ a + 2 ] += dz * f;
				p[ b ] -= dx * f; p[ b + 1 ] -= dy * f; p[ b + 2 ] -= dz * f;
			}
			for ( let k = 0; k < MINS.length; k ++ ) {
				const a = MINS[ k ][ 0 ] * 3, b = MINS[ k ][ 1 ] * 3;
				const dx = p[ b ] - p[ a ], dy = p[ b + 1 ] - p[ a + 1 ], dz = p[ b + 2 ] - p[ a + 2 ];
				const L = Math.sqrt( dx * dx + dy * dy + dz * dz ) || 1e-6;
				if ( L >= r.mins[ k ] ) continue;
				const f = ( L - r.mins[ k ] ) / L * 0.5;
				p[ a ] += dx * f; p[ a + 1 ] += dy * f; p[ a + 2 ] += dz * f;
				p[ b ] -= dx * f; p[ b + 1 ] -= dy * f; p[ b + 2 ] -= dz * f;
			}
			// ground contact with friction
			for ( let i = 0; i < NP; i ++ ) {
				const j = i * 3, rad = RP[ i ][ 1 ];
				const g = r.gy[ i ] + rad;
				if ( p[ j + 1 ] < g ) {
					p[ j + 1 ] = g;
					o[ j ] += ( p[ j ] - o[ j ] ) * 0.35; o[ j + 2 ] += ( p[ j + 2 ] - o[ j + 2 ] ) * 0.35;
					if ( o[ j + 1 ] < g - 0.02 ) o[ j + 1 ] = g - ( g - o[ j + 1 ] ) * 0.2;
				}
			}
		}
		// knees bend forward and elbows backward relative to the torso
		this._hinge( LHP, LK, LF, 1 ); this._hinge( RHP, RK, RF, 1 );
		this._hinge( LS, LE, LH, - 1 ); this._hinge( RS, RE, RH, - 1 );
		// walls
		if ( P ) {
			for ( const i of WALL_TEST ) {
				const j = i * 3;
				_v.set( p[ j ], p[ j + 1 ] - 0.1, p[ j + 2 ] );
				if ( P.resolveCylinder( _v, RP[ i ][ 1 ], 0.2, 0.02 ) ) { p[ j ] = _v.x; p[ j + 2 ] = _v.z; o[ j ] = p[ j ]; o[ j + 2 ] = p[ j + 2 ]; }
			}
		}
		r.lastMove = maxMove;
		r.calm = maxMove < 0.0055 ? r.calm + 1 : 0;
		if ( ( r.calm > 30 && r.t > 1.2 ) || r.t > 8 ) this.asleep = true;
	}

	// keep a hinge joint (knee / elbow) bending towards dirSign × the torso's forward
	_hinge( a, j, b, dirSign ) {
		const p = this.rag.p, o = this.rag.o;
		// torso forward = up × right (up pelvis -> neck, right = right hip - left hip)
		_bx.set( p[ RHP * 3 ] - p[ LHP * 3 ], p[ RHP * 3 + 1 ] - p[ LHP * 3 + 1 ], p[ RHP * 3 + 2 ] - p[ LHP * 3 + 2 ] );
		_by.set( p[ N_ * 3 ] - p[ P_ * 3 ], p[ N_ * 3 + 1 ] - p[ P_ * 3 + 1 ], p[ N_ * 3 + 2 ] - p[ P_ * 3 + 2 ] );
		_bz.crossVectors( _by, _bx ).normalize().multiplyScalar( this.info.mirror * dirSign );
		const A = _v.set( p[ a * 3 ], p[ a * 3 + 1 ], p[ a * 3 + 2 ] ), B = _v2.set( p[ b * 3 ], p[ b * 3 + 1 ], p[ b * 3 + 2 ] );
		const J = _v3.set( p[ j * 3 ], p[ j * 3 + 1 ], p[ j * 3 + 2 ] );
		const ab = _v4.subVectors( B, A );
		const L2 = ab.lengthSq() || 1e-6;
		const s = ( ( J.x - A.x ) * ab.x + ( J.y - A.y ) * ab.y + ( J.z - A.z ) * ab.z ) / L2;
		const mx = A.x + ab.x * s, my = A.y + ab.y * s, mz = A.z + ab.z * s;
		const bx = J.x - mx, by = J.y - my, bz = J.z - mz;
		if ( bx * _bz.x + by * _bz.y + bz * _bz.z >= 0 ) return;
		// mirror the joint to the correct side of the limb line
		p[ j * 3 ] = mx - bx; p[ j * 3 + 1 ] = my - by; p[ j * 3 + 2 ] = mz - bz;
		o[ j * 3 ] = p[ j * 3 ]; o[ j * 3 + 1 ] = p[ j * 3 + 1 ]; o[ j * 3 + 2 ] = p[ j * 3 + 2 ];
	}

	// bones from the particles
	_ragdollPose() {
		const r = this.rag, p = r.p, rig = this.rig, I = this.info, cp = r.cp;
		if ( this.asleep && this._posedAsleep ) return;
		this._posedAsleep = this.asleep;
		for ( let i = 0; i < NP; i ++ ) cp[ i ].set( p[ i * 3 ], p[ i * 3 + 1 ], p[ i * 3 + 2 ] ).applyMatrix4( r.charInv );
		rig.clearOverlays();
		rig.begin();
		rig.addBind( 1 );
		// pelvis frame from the hips and the spine, chest frame from the shoulders and the neck
		const Dp = frameDelta( bindPos( I, 'rThigh', _v ).sub( bindPos( I, 'lThigh', _v2 ) ), bindPos( I, 'spine2', _v3 ).sub( bindPos( I, 'pelvis', _v4 ) ),
			_w1.subVectors( cp[ RHP ], cp[ LHP ] ), _w2.subVectors( cp[ C_ ], cp[ P_ ] ), _qp );
		const Dc = frameDelta( bindPos( I, 'rUpper', _v ).sub( bindPos( I, 'lUpper', _v2 ) ), bindPos( I, 'neck', _v3 ).sub( bindPos( I, 'spine2', _v4 ) ),
			_w1.subVectors( cp[ RS ], cp[ LS ] ), _w2.subVectors( cp[ N_ ], cp[ C_ ] ), _qc );
		setBindWorld( rig, 'pelvis', Dp );
		setBindWorld( rig, 'spine', _q2.copy( Dp ).slerp( Dc, 0.33 ) );
		setBindWorld( rig, 'spine1', _q2.copy( Dp ).slerp( Dc, 0.66 ) );
		setBindWorld( rig, 'spine2', Dc );
		for ( let k = 0; k < RAG_AIMS.length; k += 3 ) {
			const a = RAG_AIMS[ k + 1 ], b = RAG_AIMS[ k + 2 ];
			_w1.subVectors( cp[ b ], cp[ a ] );
			rig.aimAt( RAG_AIMS[ k ], _w1.x, _w1.y, _w1.z, 1 );
		}
		// (clearOverlays drops pelvisAbs each pose: keep one vector per rig)
		rig.pelvisAbs = ( rig._pelvisAbsV || ( rig._pelvisAbsV = new THREE.Vector3() ) ).copy( cp[ P_ ] );
		rig.jawOpen = 0.5;
		rig.end();
	}

	// world centre of the body (pelvis particle when limp)
	ragdollCentre( out ) {
		const p = this.rag.p;
		return out.set( p[ 0 ], p[ 1 ], p[ 2 ] );
	}

	// face up (-1) or down (+1) and the ground direction from the feet to the head (for rising)
	ragdollLie( outDir ) {
		const p = this.rag.p;
		_bx.set( p[ RHP * 3 ] - p[ LHP * 3 ], p[ RHP * 3 + 1 ] - p[ LHP * 3 + 1 ], p[ RHP * 3 + 2 ] - p[ LHP * 3 + 2 ] );
		_by.set( p[ N_ * 3 ] - p[ P_ * 3 ], p[ N_ * 3 + 1 ] - p[ P_ * 3 + 1 ], p[ N_ * 3 + 2 ] - p[ P_ * 3 + 2 ] );
		_bz.crossVectors( _by, _bx ).multiplyScalar( this.info.mirror ); // chest forward
		const fx = ( p[ LF * 3 ] + p[ RF * 3 ] ) / 2, fz = ( p[ LF * 3 + 2 ] + p[ RF * 3 + 2 ] ) / 2;
		outDir.set( p[ H_ * 3 ] - fx, 0, p[ H_ * 3 + 2 ] - fz );
		return _bz.y < 0 ? 1 : - 1;
	}

	// stand back up after a knockdown: re-root the character lying along its body with the feet as the pivot,
	// pose it from the particles in that new frame (so nothing jumps), then rise. Returns the new yaw; the
	// root sits at `feet` (ground position) afterwards.
	riseFromRagdoll( feet ) {
		const face = this.ragdollLie( _w1 );
		const yaw = face > 0 ? Math.atan2( - _w1.x, - _w1.z ) : Math.atan2( _w1.x, _w1.z );
		this.riseFace = face;
		this.yaw = yaw;
		this.inst.place( feet, yaw, this.tiltQuat( Math.PI / 2, face ) );
		this.inst.updateWorld();
		this.rag.charInv.copy( this.inst.avatar.matrixWorld ).invert();
		this.asleep = false; this._posedAsleep = false;
		this._ragdollPose();
		this.pose = this.rig.snapshot( this.pose || undefined );
		this.startRise( face );
		this.tiltAngle = Math.PI / 2;
		return yaw;
	}

	feetCentre( out ) {
		const p = this.rag.p;
		return out.set( ( p[ LF * 3 ] + p[ RF * 3 ] ) / 2, Math.min( p[ LF * 3 + 1 ], p[ RF * 3 + 1 ] ), ( p[ LF * 3 + 2 ] + p[ RF * 3 + 2 ] ) / 2 );
	}

	// ---- hit volumes -------------------------------------------------------------------------------------------

	// bone positions for the capsules (world), refreshed on demand
	_bones() {
		const inst = this.inst, bp = this.bp;
		for ( const k of CAP_KEYS ) inst.bonePos( k, bp[ k ] );
		// the crown continues the neck -> head line (the capsule's end cap adds its radius); the chest capsule ends
		// a little over halfway from the chest joint to the neck
		bp.headTop.subVectors( bp.head, bp.neck ).normalize().multiplyScalar( 0.12 * inst.scale ).add( bp.head );
		bp.chestTop.lerpVectors( bp.spine2, bp.neck, 0.55 );
		return bp;
	}

	// ray vs the body: { t, zone } or null
	hitTest( o, d, maxT ) {
		const bp = this._bones();
		let best = null, bt = maxT;
		const s = this.inst.scale;
		for ( const c of CAPS ) {
			const t = rayCapsule( o, d, bp[ c[ 0 ] ], bp[ c[ 1 ] ], c[ 2 ] * s, bt );
			if ( t !== null && t < bt ) { bt = t; best = c[ 3 ]; }
		}
		return best === null ? null : { t: bt, zone: best };
	}

	// centre of the body in the world (the pelvis bone)
	centreOf( out ) { return this.inst.bonePos( 'pelvis', out ); }

	get _yaw() { return this.yaw || 0; }
}

const WALL_TEST = [ P_, C_, H_, LH, RH, LF, RF ];
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3();
const _qp = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3();

// the ragdoll's limb bones: [ bone, from particle, to particle ] triples
const RAG_AIMS = [ 'neck', N_, H_, 'head', N_, H_, 'lUpper', LS, LE, 'lFore', LE, LH, 'rUpper', RS, RE, 'rFore', RE, RH,
	'lThigh', LHP, LK, 'lCalf', LK, LF, 'rThigh', RHP, RK, 'rCalf', RK, RF ];

// a bone's bind position (character space)
function bindPos( I, k, out ) { return out.fromArray( I.bindPos, I.idx[ k ] * 3 ); }
// bone k's character-space rotation: its bind rotation turned by D
function setBindWorld( rig, k, D ) {
	const I = rig.info, i = I.idx[ k ] * 4;
	_q3.set( I.bindW[ i ], I.bindW[ i + 1 ], I.bindW[ i + 2 ], I.bindW[ i + 3 ] ).premultiply( D );
	rig.setWorld( k, _q3.x, _q3.y, _q3.z, _q3.w );
}

// rotation taking the frame (right0, up0) to (right1, up1): both orthonormalised with up as the primary axis
function frameDelta( r0, u0, r1, u1, out ) {
	basis( r0, u0, _ma );
	basis( r1, u1, _mb );
	_ma.transpose();
	_mb.multiply( _ma );
	return out.setFromRotationMatrix( _mb );
}
function basis( r, u, m ) {
	_e2.copy( u ).normalize();
	_e1.copy( r ).addScaledVector( _e2, - r.dot( _e2 ) ).normalize();
	_e3.crossVectors( _e1, _e2 );
	return m.makeBasis( _e1, _e2, _e3 );
}
