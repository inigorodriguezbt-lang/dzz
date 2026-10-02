// The body: health, blood, hunger, thirst, stamina, fatigue, temperature, wetness and the
// conditions (bleeding, bite infection, fractures, food poisoning, drunk, pain, drowning).
// The mind (Project Zomboid's moodles, gentler): boredom, stress and unhappiness 0..100, and panic, a fast spike
// when the infected close in. mood( { boredom, stress, unhappy, panic } ) adds deltas (items' `fun`, sleep,
// food). Stress and panic shake the aim (swayMul) and slow stamina; unhappiness slows healing and spoils sleep;
// long boredom or stress feeds unhappiness. Creative and god mode keep them at 0.
// game.skills (Skills.js) lives with the body: saved in this state, reset for a new character.
// Ailments (the pharmacy, docs/ITEMS_PLAN.md): box jellyfish stings (night swims), centipede bites (the brush),
// sunburn (the midday sun on bare skin) and burns, heat exhaustion and heat stroke, leptospirosis (untreated water),
// open cuts that get infected (dirty or no dressings), a cough, a sprained wrist, sore eyes; and the timed effects of
// medicine (fx: sunscreen, beta blockers, antidepressants, vitamin C…). treat( o ) applies an item's `cure`, `fx`,
// `temp`, `dress`, `close`, `sling`, `kcal`; numbers in AIL.
import { getItem, freshness } from './items/ItemDB.js';
import { Skills } from './Skills.js';
import { playPharmSound } from './items/ext/pharmacy/sounds.js';

// mood levels 1-4 start at these values (the HUD's moodle level)
export const MOOD_STEPS = [ 25, 50, 75, 90 ];
export const moodLevel = ( v ) => { let l = 0; while ( l < 4 && v >= MOOD_STEPS[ l ] ) l ++; return l; };
// labels for levels 1-2 and 3-4
const MOOD_LABEL = { boredom: [ 'Bored', 'Very bored' ], stress: [ 'Stressed', 'Very stressed' ], unhappy: [ 'Unhappy', 'Depressed' ] };
const MOOD_KEYS = [ 'boredom', 'stress', 'unhappy', 'panic' ];
const clamp100 = ( v ) => v < 0 ? 0 : v > 100 ? 100 : v;

export const DIFFICULTY = {
	easy: { drain: 0.6, dmgIn: 0.6, infection: 0.4 },
	normal: { drain: 1, dmgIn: 1, infection: 1 },
	hard: { drain: 1.35, dmgIn: 1.35, infection: 1.5 },
};

// the ailments' numbers (per real second unless noted; severities 0..1)
export const AIL = {
	// a box jellyfish sting while swimming: chance per second by night / at dusk / by day; ×3 on the jellyfish days
	// (8-10 days after the full moon); a rash guard or wetsuit ×0.35
	sting: { night: 1 / 150, dusk: 1 / 400, day: 1 / 2000, add: 0.55, fade: 0.0025, drain: 0.02 },
	// a centipede in the brush (moist open ground off roads and towns) while moving: night / day, ×1.5 crouched
	centipede: { night: 1 / 600, day: 1 / 2400, add: 0.7, fade: 0.002, sleep: 0.2 },
	// sunburn: full sun on bare skin; covered skin, shade and clouds cut it; sunscreen ×0.12
	sun: { from: 0.55, rate: 0.0015, heal: 0.0005, screen: 0.12 },
	// heat: builds while the body is above 38.1 °C
	heat: { from: 38.1, rate: 0.006, fade: 0.003, exhaust: 0.3, stroke: 0.65 },
	// leptospirosis: chance per drink of untreated water, incubation (s), rise, recovery
	lepto: { chance: 0.15, incub: [ 240, 600 ], rise: 0.0008, fall: 0.0006 },
	// an open cut: seconds to close, infection chance per second by dressing (none, clean, dirty) and when cleaned
	wound: { close: 600, risk: 0.0005, dress: [ 1, 0.3, 2 ], clean: 0.25, soil: 480, grow: 0.0009 },
	cough: { cold: 35.9, rate: 0.0012, fade: 0.0006 },
	sprain: { chance: 0.45, fade: 0.0006, sling: 3 },
	eye: { rate: 0.02, fade: 0.004 },
};
const AIL_KEYS = [ 'sting', 'centipede', 'sunburn', 'burn', 'heat', 'lepto', 'cut', 'cough', 'sprain', 'eye' ];
// condition labels: [ id, label, kind, from ] (shown from that severity)
const AIL_LABEL = {
	sting: [ 'Jellyfish sting', 'bad', 0.05 ], centipede: [ 'Centipede bite', 'bad', 0.05 ], sunburn: [ 'Sunburn', 'warn', 0.25 ],
	burn: [ 'Burns', 'warn', 0.1 ], lepto: [ 'Leptospirosis', 'bad', 0.05 ], cut: [ 'Infected cut', 'bad', 0.02 ],
	cough: [ 'Cough', 'warn', 0.25 ], sprain: [ 'Sprained wrist', 'warn', 0.05 ], eye: [ 'Sore eyes', 'warn', 0.3 ],
};
const clamp01 = ( v ) => v < 0 ? 0 : v > 1 ? 1 : v;

export class Survival {
	constructor( game ) {
		this.game = game;
		game.skills = game.skills || new Skills( game );
		this.reset();
	}

	reset() {
		this.health = 100; this.blood = 5000;
		this.hunger = 78; this.thirst = 72; // 100 = full
		this.stamina = 100; this.energy = 90;
		this.temp = 36.8; this.wet = 0;
		this.bleeding = 0; // open wounds
		this.infection = 0; this.infected = false;
		this.fracture = false; this.splint = false; this.fractureHeal = 0;
		this.sick = 0; this.drunk = 0; this.caffeine = 0; this.pain = 0; this.painkiller = 0;
		this.breath = 100;
		this.damageFlash = 0;
		this.godMode = false;
		this.lastHitDir = null;
		this.envTemp = 26;
		this.vomitT = 0;
		this.msgT = {};
		// the mind
		this.boredom = 0; this.stress = 0; this.unhappy = 0; this.panic = 0;
		this.moodLv = { boredom: 0, stress: 0, unhappy: 0 };
		this._panicked = false;
		this._threat = 0; this._close = 0; this._senseT = 0; this._sleepFrom = null;
		this.ailReset();
		// a new character knows nothing yet
		this.game.skills?.reset();
	}

	// the pharmacy's ailments and medicine effects, all clear
	ailReset() {
		for ( const k of AIL_KEYS ) this[ k ] = 0;
		this.leptoT = 0; this.leptoPeak = false;
		this.wound = 0; this.woundClean = false; this.dressing = 0; this.dressAge = 0; this.dressK = 1;
		this.sling = false;
		this.fx = {}; // medicine effects: name -> the game hour it wears off
		this._uv = 0; this._brush = false; this._sea = false; this._envT = 0; this._coughT = 20; this._tempAdd = 0;
	}

	// no moods in creative or god mode
	get moodless() { return this.creative || this.godMode; }

	// add mood deltas (negative = better): { boredom, stress, unhappy, panic }
	mood( d ) {
		if ( ! d || this.moodless ) return this;
		for ( const k of MOOD_KEYS ) if ( d[ k ] ) this[ k ] = clamp100( this[ k ] + d[ k ] );
		return this;
	}

	// aim sway multiplier (weapons/Hands): stress and panic shake the sights, aiming practice steadies them
	swayMul() {
		if ( this.moodless ) return 1;
		const aim = this.game.skills?.level( 'aiming' ) || 0;
		return ( 1 + this.stress / 100 * 0.7 + this.panic / 100 * 0.7 ) * ( 1 - aim * 0.035 ) * this.ailSway();
	}

	// what the ailments and medicine do to the aim: a sting, a sprain, sore eyes, heat and drowsiness shake it, beta
	// blockers steady it
	ailSway() {
		let k = 1 + this.sting * 0.25 + this.sprain * ( this.sling ? 0.2 : 0.4 ) + ( this.eye > 0.3 ? this.eye * 0.25 : 0 ) + this.heat * 0.3;
		if ( this.fxOn( 'drowsy' ) ) k *= 1.1;
		if ( this.fxOn( 'steady' ) ) k *= 0.6;
		return k;
	}

	// a medicine effect still working (fx: the game hour it wears off)
	fxOn( k ) { return ( this.fx?.[ k ] || 0 ) > ( this.game.time?.hours ?? 0 ); }
	fxAdd( k, hours ) { const now = this.game.time?.hours ?? 0; this.fx[ k ] = Math.max( this.fx[ k ] || 0, now ) + hours; }

	// natural healing and sleep: an unhappy mind mends slowly and sleeps badly
	healMul() { return 1 - this.unhappy / 100 * 0.6; }
	sleepQuality() { return 1 - this.unhappy / 100 * 0.4; }

	get diff() { return DIFFICULTY[ this.game.difficulty ] || DIFFICULTY.normal; }
	get creative() { return this.game.mode === 'creative'; }

	maxStamina() {
		let m = 100;
		const w = this.game.player.inventory.totalWeight();
		m -= Math.max( 0, w - 18 ) * 1.6;
		if ( this.hunger < 15 ) m -= 20;
		if ( this.thirst < 15 ) m -= 20;
		if ( this.blood < 3800 ) m -= ( 3800 - this.blood ) / 40;
		if ( this.energy < 20 ) m -= 15;
		// heat, a fever and a fresh bite take the wind out of you
		m -= this.heat * 25 + this.lepto * 20 + this.centipede * 10;
		return Math.max( 20, m );
	}

	// a crutch in the hands (a tool with `crutch`)
	_crutch() {
		const s = this.game.player.inventory?.heldStack?.();
		return !! ( s && getItem( s.id )?.crutch );
	}

	moveModifiers() {
		const w = this.game.player.inventory.totalWeight();
		let speed = 1, canSprint = true, canJump = true;
		if ( w > 30 ) speed *= Math.max( 0.55, 1 - ( w - 30 ) * 0.02 );
		if ( w > 42 ) canSprint = false;
		if ( this.fracture ) {
			speed *= this.splint ? 0.6 : 0.4; canSprint = false; canJump = false;
			if ( this._crutch() ) speed = Math.min( 0.82, speed * 1.4 );
		}
		if ( this.blood < 3000 ) speed *= 0.85;
		if ( this.drunk > 0.6 ) speed *= 0.9;
		if ( this.creative ) { speed = 1; canSprint = true; canJump = true; }
		return { speed, canSprint, canJump };
	}

	// footstep noise: a broken leg drags, practice at sneaking softens every step
	noiseMul() { return ( this.fracture ? 1.3 : 1 ) * ( 1 - ( this.game.skills?.level( 'stealth' ) || 0 ) * 0.04 ); }

	useStamina( n ) {
		if ( this.creative ) return;
		this.stamina = Math.max( 0, this.stamina - n * ( this.caffeine > 0 ? 0.6 : 1 ) );
	}

	// ---- damage --------------------------------------------------------------------------------

	// kind: 'bite' | 'scratch' | 'bullet' | 'melee' | 'fall' | 'burn' | 'drown' | 'starve' | 'explosion' | 'vehicle' | 'animal'
	hurt( amount, kind = 'melee', info = {} ) {
		if ( this.godMode || this.creative || this.health <= 0 ) return;
		const inv = this.game.player.inventory;
		let dmg = amount * this.diff.dmgIn;
		// armour from what you wear
		let bite = 0, bullet = 0;
		for ( const s of Object.values( inv.equip ) ) {
			if ( ! s ) continue;
			const a = getItem( s.id )?.clothing?.armor;
			if ( ! a ) continue;
			// stack.data.mods: what was sewn or strapped on (patches, pads: the gear domain)
			const mo = s.data?.mods;
			bite = Math.max( bite, ( ( a.bite || 0 ) + ( mo?.bite || 0 ) ) * s.cond );
			bullet = Math.max( bullet, ( ( a.bullet || 0 ) + ( mo?.bullet || 0 ) ) * s.cond );
		}
		if ( kind === 'bite' || kind === 'scratch' || kind === 'animal' ) dmg *= 1 - bite * 0.6;
		if ( kind === 'bullet' && info.zone !== 'head' ) dmg *= 1 - bullet;
		if ( kind === 'bullet' && info.zone === 'head' ) dmg *= 2.2;
		this.health -= dmg;
		this.damageFlash = Math.min( 1, this.damageFlash + 0.35 + dmg / 40 );
		this.pain = Math.min( 1, this.pain + dmg / 50 );
		// a wound frightens: stress, and a jolt of panic (a bite most of all). The jolt scales with the hit, so the
		// small ticks of standing in fire add up instead of each being a fright
		this.mood( { stress: dmg * 0.6 + ( kind === 'bite' ? 12 : 0 ), panic: Math.min( 6, dmg * 0.6 ) + dmg * 0.8 + ( kind === 'bite' ? 20 : 0 ) } );
		if ( info.dir ) this.lastHitDir = { dir: info.dir.clone(), t: 1.2 };
		this.game.player.shake = Math.max( this.game.player.shake, Math.min( 0.9, 0.2 + dmg / 30 ) );
		// wounds
		let bleedChance = { bite: 0.55, scratch: 0.35, bullet: 0.9, melee: 0.25, animal: 0.5, explosion: 0.7, vehicle: 0.3 }[ kind ] || 0;
		if ( kind === 'bite' || kind === 'scratch' ) bleedChance *= 1 - bite;
		if ( Math.random() < bleedChance ) { this.bleeding = Math.min( 6, this.bleeding + 1 ); this.msg( 'bleed', 'Bleeding', 'bad' ); this.openWound(); }
		// fire leaves burns that hurt until treated
		if ( kind === 'burn' ) { this.burn = clamp01( this.burn + dmg * 0.05 ); }
		if ( ( kind === 'bite' || kind === 'scratch' ) && Math.random() < ( kind === 'bite' ? 0.18 : 0.06 ) * this.diff.infection * ( 1 - bite ) ) {
			if ( ! this.infected ) { this.infected = true; this.infection = Math.max( this.infection, 0.02 ); this.msg( 'inf', 'Infected', 'bad', 0 ); }
		}
		if ( kind === 'fall' && info.fall > 5 && Math.random() < 0.4 + ( info.fall - 5 ) * 0.1 ) this.breakLeg();
		// a fall you land on your hands from
		else if ( kind === 'fall' && Math.random() < AIL.sprain.chance ) this.sprainWrist();
		if ( kind === 'vehicle' && Math.random() < 0.2 ) this.breakLeg();
		this.game.audio?.play( 'hurt', { vol: 0.7 } );
		if ( this.health <= 0 ) this.game.onPlayerDeath( info.cause || kind );
	}

	fallDamage( h ) {
		const dmg = Math.max( 0, ( h - 3.2 ) * 11 );
		if ( dmg > 0 ) this.hurt( dmg, 'fall', { fall: h, cause: 'a fall' } );
	}

	breakLeg() {
		if ( this.fracture ) return;
		this.fracture = true; this.splint = false; this.fractureHeal = 0;
		this.msg( 'frac', 'Broken leg', 'bad', 0 );
		this.game.audio?.play( 'bonebreak', { vol: 0.8 } );
	}

	sprainWrist() {
		if ( this.godMode || this.creative ) return;
		this.sprain = Math.max( this.sprain, 0.8 ); this.sling = false;
		this.pain = Math.min( 1, this.pain + 0.3 );
		this.msg( 'sprain', 'Sprained wrist', 'bad', 10 );
	}

	// a cut that is open until it closes: it can get infected, more so without a clean dressing
	openWound( seconds = AIL.wound.close ) {
		if ( this.godMode || this.creative ) return;
		this.wound = Math.max( this.wound, seconds );
		this.woundClean = false;
		// fresh blood under a dressing soils it
		if ( this.dressing ) this.dressing = 2;
	}

	// ---- consumption -------------------------------------------------------------------------------

	// returns a message
	eat( stack ) {
		const def = getItem( stack.id ), f = def.food;
		const fresh = freshness( stack );
		const portion = 1 / ( f.portions || 1 );
		this.hunger = Math.min( 110, this.hunger + ( f.kcal || 0 ) / 20 * portion );
		this.thirst = Math.min( 100, this.thirst + ( f.water || 0 ) * portion );
		// a practised cook's food is less likely to make you ill (rot and raw meat still do)
		const cook = f.raw ? 1 : 1 - ( this.game.skills?.level( 'cooking' ) || 0 ) * 0.06;
		let sickC = ( f.sick || 0 ) * cook + ( f.raw ? 0.35 : 0 ) + ( fresh <= 0 ? 0.7 : fresh < 0.25 ? 0.25 : 0 );
		if ( Math.random() < sickC ) { this.sick = Math.min( 1, this.sick + 0.45 ); this.msg( 'sick', 'Nauseous', 'warn' ); }
		if ( this.hunger > 100 && Math.random() < 0.3 ) this.vomit();
		// rotten or raw food is miserable; a hot cooked meal (without its own `fun`) cheers a little
		if ( fresh <= 0 ) this.mood( { unhappy: 10 * portion } );
		else if ( fresh < 0.25 ) this.mood( { unhappy: 3 * portion } );
		if ( f.raw ) this.mood( { unhappy: 3 * portion } );
		else if ( ! def.fun && /^cooked_|_cooked$/.test( def.id ) ) this.mood( { unhappy: - 4 * portion, boredom: - 2 * portion } );
		return fresh <= 0 ? 'That was rotten.' : null;
	}

	drink( def, amountL = 0.33, liquid = 'water' ) {
		const d = def?.drink || {};
		if ( liquid === 'sea' ) { this.thirst = Math.max( 0, this.thirst - 8 ); this.mood( { unhappy: 2 } ); this.msg( 'salt', 'Salt water', 'bad' ); return; }
		const water = d.water != null ? d.water : amountL * 60;
		this.thirst = Math.min( 105, this.thirst + water );
		this.hunger = Math.min( 110, this.hunger + ( d.kcal || 0 ) / 20 );
		// a drink takes the edge off (the rest of it lasts while you're drunk, in update)
		if ( d.alcohol ) { this.drunk = Math.min( 1, this.drunk + d.alcohol ); this.mood( { stress: - d.alcohol * 30, unhappy: - d.alcohol * 15 } ); }
		if ( d.caffeine ) this.caffeine = Math.min( 300, this.caffeine + d.caffeine );
		if ( liquid === 'dirty' ) this.mood( { unhappy: 1.5 } );
		if ( liquid === 'dirty' && Math.random() < 0.4 ) { this.sick = Math.min( 1, this.sick + 0.5 ); this.msg( 'sick', 'Bad water', 'warn' ); }
		// untreated water can carry leptospirosis: it shows days later (minutes here); doxycycline prevents it
		if ( liquid === 'dirty' ) this.exposeLepto( AIL.lepto.chance );
		if ( d.sick && Math.random() < d.sick ) this.sick = Math.min( 1, this.sick + 0.4 );
		// a remedy drink (oral rehydration, a herbal tea): its cures and effects
		if ( d.cure || d.fx ) this.treat( d );
	}

	exposeLepto( chance ) {
		if ( this.godMode || this.creative || this.lepto > 0 || this.leptoT > 0 || this.fxOn( 'doxy' ) ) return false;
		if ( Math.random() >= chance * ( this.fxOn( 'immune' ) ? 0.6 : 1 ) ) return false;
		const [ a, b ] = AIL.lepto.incub;
		this.leptoT = a + Math.random() * ( b - a );
		return true;
	}

	// returns what the pharmacy's part did: { treated, replaced (the dressing that came off: 1 clean, 2 dirty) }
	medicate( def ) {
		const m = def.medical;
		const wasBleeding = this.bleeding > 0;
		if ( m.bleed ) this.bleeding = Math.max( 0, this.bleeding - m.bleed );
		if ( m.heal ) this.health = Math.min( 100, this.health + m.heal );
		if ( m.blood ) this.blood = Math.min( 5000, this.blood + m.blood );
		if ( m.infection ) { this.infection = Math.max( 0, this.infection - m.infection ); if ( this.infection <= 0.01 ) { this.infected = false; this.infection = 0; } }
		if ( m.pain ) this.painkiller = Math.max( this.painkiller, m.pain );
		if ( m.splint && this.fracture ) { this.splint = true; this.msg( 'splint', 'Leg splinted', 'good' ); }
		if ( m.sick ) this.sick = Math.max( 0, this.sick - m.sick );
		if ( m.energy ) this.energy = Math.max( 0, Math.min( 100, this.energy + m.energy ) );
		if ( m.stamina ) this.stamina = this.maxStamina();
		return this.treat( m, wasBleeding );
	}

	// the pharmacy's fields of a medical item or a remedy drink: cleaning and dressing a cut, cures, effects
	//   infection (disinfects an open cut, fights an infected cut and leptospirosis), dress: 'clean'|'dirty' (or any
	//   bandage: `dirty` marks a rag), close (s off the time a cut takes to close), cure: { sting, centipede,
	//   sunburn, burn, heat, lepto, cut, cough, sprain, eye, sick }, fx: { name: hours }, temp (°C now), sling, kcal
	treat( m, wasBleeding = false ) {
		const res = { treated: false, replaced: 0 };
		if ( ! m ) return res;
		if ( m.infection ) {
			if ( this.wound > 0 && ! this.woundClean ) { this.woundClean = true; res.treated = true; }
			if ( this.cut > 0 ) { this.cut = Math.max( 0, this.cut - m.infection * 1.5 ); res.treated = true; if ( this.cut < 0.02 ) { this.cut = 0; this.msg( 'cutok', 'Infection gone', 'good', 0 ); } }
			// the antibiotics (not a wipe of antiseptic) fight leptospirosis, and stop it incubating
			if ( m.infection >= 0.3 && ( this.lepto > 0 || this.leptoT > 0 ) ) { this.lepto = Math.max( 0, this.lepto - m.infection * 2 ); this.leptoT = 0; res.treated = true; }
		}
		// a bandage over an open cut: a dressing, clean or dirty; the one it replaces comes off
		if ( ( m.bleed || m.dress ) && ( this.wound > 0 || wasBleeding ) ) {
			if ( this.wound <= 0 ) this.wound = AIL.wound.close;
			res.replaced = this.dressing;
			this.dressing = m.dirty || m.dress === 'dirty' ? 2 : 1;
			this.dressAge = 0; this.dressK = 1;
			res.treated = true;
		}
		if ( m.close && this.wound > 0 ) { this.wound = Math.max( 1, this.wound - m.close ); res.treated = true; }
		if ( m.cure ) {
			for ( const k in m.cure ) {
				if ( k === 'sick' ) { if ( this.sick > 0 ) { this.sick = Math.max( 0, this.sick - m.cure.sick ); res.treated = true; } continue; }
				if ( ! ( this[ k ] > 0 ) ) continue;
				this[ k ] = Math.max( 0, this[ k ] - m.cure[ k ] );
				if ( this[ k ] < 0.02 ) this[ k ] = 0;
				res.treated = true;
			}
			if ( m.cure.lepto && this.leptoT > 0 ) { this.leptoT = 0; res.treated = true; }
		}
		if ( m.sling && this.sprain > 0 ) { this.sling = true; res.treated = true; this.msg( 'sling', 'Arm in a sling', 'good' ); }
		if ( m.temp ) this.temp += m.temp;
		if ( m.kcal ) this.hunger = Math.min( 110, this.hunger + m.kcal / 20 );
		if ( m.fx ) for ( const k in m.fx ) { this.fxAdd( k, m.fx[ k ] ); res.treated = true; }
		return res;
	}

	// how much of an ailment there is (a severity, or 1 for an open cut without a clean dressing, a cough coming, an
	// infection incubating): the pharmacy's "nothing to treat" refusals read this
	ailing( k ) {
		if ( k === 'wound' ) return this.wound > 0 && this.dressing !== 1 ? 1 : 0;
		if ( k === 'dirty' ) return this.wound > 0 && ! this.woundClean ? 1 : 0;
		if ( k === 'lepto' ) return Math.max( this.lepto, this.leptoT > 0 ? 0.1 : 0 );
		if ( k === 'hot' ) return Math.max( this.heat, this.temp > 37.6 ? ( this.temp - 37.6 ) / 2 : 0 );
		if ( k === 'cold' ) return this.temp < 36.2 ? ( 36.2 - this.temp ) / 2 : 0;
		if ( k === 'fracture' ) return this.fracture ? 1 : 0;
		if ( k === 'bleed' ) return this.bleeding > 0 ? 1 : 0;
		if ( k === 'pain' ) return this.pain;
		if ( k === 'sick' ) return this.sick;
		return this[ k ] || 0;
	}

	// exact readings for the thermometer, the blood pressure cuff and the stethoscope (no jitter: a clean readout)
	vitals() {
		const p = this.game.player, steady = this.fxOn( 'steady' );
		const lost = Math.max( 0, 5000 - this.blood );
		let hr = 66 + this.stress * 0.15 + this.panic * 0.5 + lost / 45 + Math.max( 0, this.temp - 37 ) * 12 + this.heat * 25 + this.lepto * 15
			+ ( p?.sprinting ? 40 : p?.moving ? 14 : 0 ) + Math.max( 0, 40 - this.stamina ) * 0.8 - ( steady ? 14 : 0 );
		hr = Math.round( Math.max( 40, Math.min( 190, hr ) ) );
		const sys = Math.round( 118 * ( 0.5 + 0.5 * Math.min( 1, this.blood / 5000 ) ) + this.stress * 0.12 + this.panic * 0.2 - ( steady ? 10 : 0 ) - this.heat * 10 );
		const spo2 = Math.round( 98 - this.cough * 4 - ( this.blood < 3000 ? 3 : 0 ) - ( this.lepto > 0.6 ? 2 : 0 ) );
		return { temp: Math.round( this.temp * 10 ) / 10, hr, sys, dia: Math.round( sys * 0.64 ), spo2, rr: Math.round( 14 + this.panic * 0.08 + this.cough * 6 + ( 100 - this.stamina ) * 0.06 ),
			lungs: this.cough > 0.25 ? 'Wheezing' : 'Lungs clear', health: Math.round( this.health ), blood: Math.round( this.blood / 100 ) / 10 };
	}

	vomit() {
		this.hunger = Math.max( 0, this.hunger - 25 );
		this.thirst = Math.max( 0, this.thirst - 18 );
		this.game.audio?.play( 'vomit', { vol: 0.7 } );
		this.game.player.shake = 0.5;
		this.mood( { unhappy: 5 } );
		this.msg( 'vomit', 'Vomited', 'warn' );
	}

	// game hours that pass in a time-lapse (reading): what sitting still that long costs the body
	passTime( hours ) {
		if ( this.creative || ! ( hours > 0 ) ) return;
		const k = this.diff.drain;
		this.hunger = Math.max( 0, this.hunger - hours * 1.8 * k );
		this.thirst = Math.max( 0, this.thirst - hours * 2.5 * k );
		this.energy = Math.max( 0, this.energy - hours * 1.1 * k );
	}

	// after a sleep (Game.sleep jumps the clock): rest calms and cheers; an unhappy mind sleeps badly and
	// wakes with less of the energy Game.sleep gave back
	slept( hours ) {
		if ( this.moodless || ! ( hours > 0 ) ) return;
		// sleeping pills: a deep sleep whatever the mood
		const deep = ( this.fx?.deep || 0 ) > ( this.game.time?.hours ?? 0 ) - hours;
		if ( deep ) { this.energy = Math.min( 100, this.energy + hours * 3 ); delete this.fx.deep; }
		// a night on the ground in the brush: centipedes come out
		if ( this._brush && ! this.game.world?.isIndoors?.( this.game.player.pos ) && Math.random() < AIL.centipede.sleep ) this.bitten();
		const q = deep ? 1 : this.sleepQuality();
		if ( q < 0.95 ) {
			this.energy = Math.max( 0, this.energy - hours * 13 * ( 1 - q ) );
			if ( this.unhappy >= 50 ) this.msg( 'badsleep', 'Slept badly', 'warn', 60 );
		}
		this.mood( { stress: - hours * 9 * q, boredom: - hours * 4, unhappy: - hours * 2.5 * q, panic: - 100 } );
	}

	msg( key, text, kind = 'warn', repeat = 30 ) {
		const now = performance.now() / 1000;
		if ( this.msgT[ key ] && ( repeat === 0 || now - this.msgT[ key ] < repeat ) ) return;
		this.msgT[ key ] = now;
		this.game.toast( text, kind );
	}

	// ambient temperature (°C) at the player: altitude lapse (the summits freeze), sun, rain and wind
	environmentTemp() {
		const g = this.game, p = g.player;
		const realAlt = Math.max( 0, p.pos.y ) * 6;
		let t = 27 - realAlt * 0.0062;
		const sun = g.world.sky.sunDir.y;
		t += sun > 0 ? sun * 3 : - 4;
		t -= g.weather ? g.weather.rain * 4 + g.weather.wind * 1.5 : 0;
		if ( p.swimming ) t = Math.min( t, 25 );
		if ( g.nearFire?.( p.pos ) ) t += 18;
		if ( g.world.isIndoors?.( p.pos ) ) t = t * 0.6 + 22 * 0.4;
		return t;
	}

	update( dt ) {
		const g = this.game, p = g.player;
		if ( this.health <= 0 ) return;
		if ( this.creative ) {
			this.health = 100; this.blood = 5000; this.hunger = Math.max( this.hunger, 80 ); this.thirst = Math.max( this.thirst, 80 );
			this.stamina = 100; this.bleeding = 0; this.breath = 100; this.temp = 36.8; this.fracture = false;
			this.boredom = this.stress = this.unhappy = this.panic = 0;
			for ( const k of AIL_KEYS ) this[ k ] = 0;
			this.wound = 0; this.leptoT = 0; this.dressing = 0;
			this.damageFlash = Math.max( 0, this.damageFlash - dt * 1.5 );
			return;
		}
		if ( this.godMode ) this.boredom = this.stress = this.unhappy = this.panic = 0;
		// a sleep (Game.sleep) jumps the clock while the screen is dark: note the hour it began, and count the hours
		// once the jump shows (or the sleep is over, if the game was paused through it)
		const hrs = g.time?.hours ?? 0;
		if ( g.sleeping && this._sleepFrom == null ) this._sleepFrom = hrs;
		if ( this._sleepFrom != null ) {
			const slept = hrs - this._sleepFrom;
			if ( slept > 0.5 ) { this.slept( slept ); this._sleepFrom = null; } else if ( ! g.sleeping ) this._sleepFrom = null;
		}
		const k = this.diff.drain;
		const act = p.sprinting ? 2.4 : p.swimming ? 2 : p.moving ? 1.2 : 0.8;
		// metabolism (full -> empty in roughly 1.5 h of play for food, 1 h for water)
		this.hunger = Math.max( 0, this.hunger - dt * 0.0185 * act * k );
		this.thirst = Math.max( 0, this.thirst - dt * ( 0.026 + Math.max( 0, this.temp - 37.2 ) * 0.03 ) * act * k );
		this.energy = Math.max( 0, this.energy - dt * 0.009 * k * ( this.caffeine > 0 ? 0.3 : 1 ) );
		this.caffeine = Math.max( 0, this.caffeine - dt );
		this.drunk = Math.max( 0, this.drunk - dt * 0.004 );
		this.painkiller = Math.max( 0, this.painkiller - dt * 0.004 );
		this.pain = Math.max( 0, this.pain - dt * ( this.painkiller > 0 ? 0.08 : 0.01 ) );
		this.damageFlash = Math.max( 0, this.damageFlash - dt * 1.2 );
		if ( this.lastHitDir ) { this.lastHitDir.t -= dt; if ( this.lastHitDir.t <= 0 ) this.lastHitDir = null; }

		// stamina
		const maxS = this.maxStamina();
		// (stress tightens the chest: slower to get your breath back)
		if ( ! p.sprinting ) this.stamina = Math.min( maxS, this.stamina + dt * ( p.moving ? 6 : 11 ) * ( this.caffeine > 0 ? 1.4 : 1 ) * ( 1 - this.stress / 100 * 0.35 ) );
		this.stamina = Math.min( this.stamina, maxS );

		// bleeding
		if ( this.bleeding > 0 ) {
			this.blood -= dt * 7 * this.bleeding;
			if ( Math.random() < dt * 0.6 * this.bleeding ) g.fx?.bloodDrip?.( p.pos );
		} else if ( this.hunger > 40 && this.thirst > 40 ) this.blood = Math.min( 5000, this.blood + dt * 1.2 );
		if ( this.blood < 2200 ) this.health -= dt * ( 2200 - this.blood ) / 400;

		// infection from bites: fever and a slow drain; antibiotics cure it
		if ( this.infected ) {
			this.infection = Math.min( 1, this.infection + dt * 0.00055 * this.diff.infection );
			if ( this.infection > 0.25 ) { this.msg( 'fever', 'Fever', 'bad', 90 ); this.temp += dt * 0.004; }
			if ( this.infection > 0.5 ) this.health -= dt * 0.05 * this.infection;
		}
		// food poisoning
		if ( this.sick > 0 ) {
			this.sick = Math.max( 0, this.sick - dt * 0.002 );
			this.thirst -= dt * 0.03 * this.sick;
			this.vomitT -= dt;
			if ( this.sick > 0.4 && this.vomitT <= 0 && Math.random() < dt * 0.02 ) { this.vomit(); this.vomitT = 45; }
		}
		// fracture heals with a splint
		if ( this.fracture && this.splint ) {
			this.fractureHeal += dt;
			if ( this.fractureHeal > 900 ) { this.fracture = false; this.splint = false; this.msg( 'heal', 'Leg healed', 'good', 0 ); }
		}

		// stings, bites, sun, fever, cuts (sets _tempAdd: the sun on you, a fever, a heat or cold pack)
		this._ailments( dt );

		// temperature
		this.envTemp = this.environmentTemp();
		let insul = 0.05, water = 0;
		for ( const s of Object.values( p.inventory.equip ) ) {
			const c = s && getItem( s.id )?.clothing;
			const mo = s?.data?.mods; // sewn-on patches (the gear domain)
			if ( c ) { insul += ( ( c.insulation || 0 ) + ( mo?.ins || 0 ) ) * ( 0.4 + 0.6 * s.cond ); water = Math.max( water, ( c.waterproof || 0 ) + ( mo?.wp || 0 ) ); }
		}
		const rain = g.weather?.rain || 0;
		if ( p.swimming || p.underwater ) this.wet = Math.min( 1, this.wet + dt * 0.5 );
		else if ( rain > 0.1 && ! g.world.isIndoors?.( p.pos ) ) this.wet = Math.min( 1, this.wet + dt * 0.01 * rain * ( 1 - water ) );
		else this.wet = Math.max( 0, this.wet - dt * ( 0.004 + Math.max( 0, this.envTemp - 20 ) * 0.0006 ) );
		const effIns = insul * ( 1 - this.wet * 0.7 );
		const heatGen = ( p.sprinting ? 1.2 : p.moving ? 0.5 : 0.1 ) + ( this.caffeine > 0 ? 0.1 : 0 );
		const target = 37 + ( this.envTemp - 24 ) * 0.09 * ( 1 - Math.min( 0.9, effIns ) ) + heatGen * 0.4 - this.wet * 1.4 + ( this.envTemp > 30 ? effIns * 1.2 : 0 ) + this._tempAdd;
		this.temp += ( target - this.temp ) * dt * 0.004;
		if ( this.temp < 35.2 ) { this.health -= dt * ( 35.2 - this.temp ) * 0.08; this.msg( 'cold', 'Freezing', 'bad' ); }
		if ( this.temp > 38.6 ) { this.health -= dt * ( this.temp - 38.6 ) * 0.1; this.thirst -= dt * 0.03; this.msg( 'hot', 'Overheating', 'bad' ); }

		// starvation / dehydration
		if ( this.hunger <= 0 ) { this.health -= dt * 0.09; this.msg( 'starve', 'Starving', 'bad' ); }
		else if ( this.hunger < 15 ) this.msg( 'hungry', 'Hungry', 'warn', 120 );
		if ( this.thirst <= 0 ) { this.health -= dt * 0.18; this.msg( 'dehyd', 'Dehydrated', 'bad' ); }
		else if ( this.thirst < 15 ) this.msg( 'thirsty', 'Thirsty', 'warn', 120 );
		if ( this.energy < 10 ) this.msg( 'tired', 'Exhausted', 'warn', 180 );

		// breath under water
		if ( p.underwater ) {
			this.breath = Math.max( 0, this.breath - dt * 2.6 );
			if ( this.breath <= 0 ) { this.health -= dt * 6; this.damageFlash = Math.max( this.damageFlash, 0.4 ); }
		} else this.breath = Math.min( 100, this.breath + dt * 20 );

		// natural healing when well fed, not bleeding and warm
		// (an infected cut or a fever of leptospirosis stops it)
		if ( this.bleeding === 0 && this.hunger > 50 && this.thirst > 50 && this.blood > 4000 && ! this.infected && this.temp > 36 && this.temp < 38 && this.cut < 0.15 && this.lepto < 0.3 ) {
			this.health = Math.min( 100, this.health + dt * 0.06 * this.healMul() );
		}
		// noni: a slow mend that works through hunger
		if ( this.bleeding === 0 && this.fxOn( 'regen' ) ) this.health = Math.min( 100, this.health + dt * 0.025 );

		this._moods( dt );
		g.skills?.update?.( dt );

		// the body's own sounds: a heartbeat when close to death, heavy breathing when spent
		this.beatT = ( this.beatT || 0 ) - dt;
		if ( this.beatT <= 0 && ( this.health < 30 || this.blood < 2900 ) ) {
			this.beatT = this.health < 15 ? 0.62 : 0.9;
			g.audio?.play( 'heartbeat', { bus: 'ui', vol: 0.55, detune: 0 } );
		} else if ( this.beatT <= 0 && this.panic > 50 ) {
			// panic: a quieter, racing heart
			this.beatT = 0.95 - ( this.panic - 50 ) / 50 * 0.35;
			g.audio?.play( 'heartbeat', { bus: 'ui', vol: 0.25 + ( this.panic - 50 ) / 50 * 0.15, detune: 0 } );
		}
		this.breathT = ( this.breathT || 0 ) - dt;
		if ( this.breathT <= 0 && this.stamina < 18 && ! p.underwater ) {
			this.breathT = 1.7;
			g.audio?.play( 'breath', { bus: 'ui', vol: 0.35 } );
		}

		if ( this.health <= 0 ) {
			this.health = 0;
			const cause = this.blood < 2200 ? 'blood loss' : this.hunger <= 0 ? 'starvation' : this.thirst <= 0 ? 'dehydration' : this.temp < 35.2 ? 'hypothermia'
				: this.temp > 38.6 || this.heat > AIL.heat.stroke ? 'heat stroke' : this.breath <= 0 ? 'drowning' : this.infected ? 'infection'
				: this.lepto > 0.5 ? 'leptospirosis' : this.cut > 0.5 ? 'an infected cut' : 'injuries';
			g.onPlayerDeath( cause );
		}
	}

	// ---- ailments (the pharmacy) ------------------------------------------------------------------

	// what's around, once a second: the sun on the skin, the brush underfoot, what you wear
	_ailEnv() {
		const g = this.game, p = g.player, hf = g.hf;
		const indoors = !! g.world?.isIndoors?.( p.pos );
		const sun = g.world?.sky?.sunDir?.y ?? 0;
		let uv = 0;
		if ( sun > AIL.sun.from && ! indoors && ! p.vehicle && ! p.underwater ) {
			// clouds thin it, shade (the hands' sun visibility) stops it
			const cloud = Math.min( 1, Math.max( 0.15, 1 - ( ( g.weather?.cover ?? 0.4 ) - 0.45 ) * 1.6 ) );
			uv = Math.min( 1, ( sun - AIL.sun.from ) / 0.35 ) * ( g.world?.handVis ?? 1 ) * cloud;
		}
		this._uv = uv;
		this._indoorsA = indoors;
		// the brush: green open ground off roads, streets, runways, buildings and towns, not the beach
		let brush = false;
		if ( ! indoors && ! p.vehicle && ! p.swimming && hf?.surfaceAt && hf.flagsNear && ! ( hf.flagsNear( p.pos.x, p.pos.z ) & ( 1 | 4 | 8 | 16 | 32 ) ) ) {
			brush = hf.surfaceAt( p.pos.x, p.pos.z, this._s4 || ( this._s4 = [ 0, 0, 0, 0 ] ) )[ 0 ] > 0.4 && ! g.world?.isBeach?.( p.pos.x, p.pos.z );
		}
		this._brush = brush;
		// bare skin: a hat, a shirt and long legs cover it
		const eq = p.inventory?.equip || {}, id = ( s ) => s?.id || '';
		let cover = 0;
		if ( eq.head ) cover += 0.2;
		if ( eq.torso ) cover += /tank|bikini/.test( id( eq.torso ) ) ? 0.35 : 0.55;
		if ( eq.legs ) cover += /short|skirt|bikini/.test( id( eq.legs ) ) ? 0.08 : 0.18;
		this._skin = Math.max( 0.1, 1 - cover );
		this._hat = !! eq.head;
		this._suit = /wetsuit|rash|dive_skin|stinger/.test( id( eq.torso ) );
		this._goggles = /dive_mask|goggles|snorkel/.test( id( eq.face ) + id( eq.eyes ) );
	}

	// the chances, once a second: a jellyfish on a swim, a centipede in the brush
	_ailRoll() {
		const g = this.game, p = g.player, A = AIL;
		if ( this.godMode ) return;
		const night = g.world?.sky?.night ?? 0;
		if ( p.swimming || p.underwater ) {
			let c = night > 0.5 ? A.sting.night : night > 0.1 ? A.sting.dusk : A.sting.day;
			// box jellyfish come inshore 8-10 days after the full moon
			const ph = g.world?.sky?.moonPhase;
			if ( ph != null && ph > 0.75 && ph < 0.86 ) c *= 3;
			if ( this._suit ) c *= 0.35;
			if ( Math.random() < c ) this.stung();
		}
		if ( this._brush && p.moving && ! p.vehicle ) {
			let c = night > 0.5 ? A.centipede.night : A.centipede.day;
			if ( p.stance === 'crouch' || p.stance === 'prone' ) c *= 1.5;
			if ( Math.random() < c ) this.bitten();
		}
	}

	stung() {
		if ( this.godMode || this.creative ) return;
		this.sting = Math.min( 1, this.sting + AIL.sting.add );
		this.health -= 3; this.pain = Math.min( 1, this.pain + 0.5 );
		this.damageFlash = Math.min( 1, this.damageFlash + 0.4 );
		this.mood( { stress: 6, panic: 15 } );
		this.msg( 'sting', 'Jellyfish sting', 'bad', 5 );
		this.game.audio?.play( 'hurt', { vol: 0.5 } );
	}

	bitten() {
		if ( this.godMode || this.creative ) return;
		this.centipede = Math.min( 1, this.centipede + AIL.centipede.add );
		this.health -= 2; this.pain = Math.min( 1, this.pain + 0.6 );
		this.damageFlash = Math.min( 1, this.damageFlash + 0.3 );
		this.mood( { stress: 4, panic: 10 } );
		this.openWound( 300 );
		this.msg( 'centipede', 'Centipede bite', 'bad', 5 );
		this.game.audio?.play( 'hurt', { vol: 0.45 } );
	}

	// a fit of coughing: the infected hear it
	coughFit() {
		const g = this.game, p = g.player;
		playPharmSound( g, 'pharm_cough', { vol: 0.6, bus: 'ui' } );
		this.useStamina( 6 );
		g.events?.emit?.( 'noise', { pos: p.pos.clone ? p.pos.clone() : p.pos, radius: 10 + this.cough * 10, source: p, kind: 'cough' } );
	}

	_ailments( dt ) {
		const g = this.game, p = g.player, A = AIL;
		if ( this.godMode ) { for ( const k of AIL_KEYS ) this[ k ] = 0; this.wound = 0; this.leptoT = 0; this._tempAdd = 0; return; }
		this._envT -= dt;
		if ( this._envT <= 0 ) { this._envT = 1; this._ailEnv(); this._ailRoll(); }
		let tAdd = 0;

		// a box jellyfish sting burns for a few minutes; vinegar stops it
		if ( this.sting > 0 ) {
			this.sting = Math.max( 0, this.sting - dt * A.sting.fade );
			this.health -= dt * A.sting.drain * this.sting;
			this.pain = Math.max( this.pain, this.sting * 0.7 );
		}
		// a centipede bite: sharp pain and swelling
		if ( this.centipede > 0 ) {
			this.centipede = Math.max( 0, this.centipede - dt * A.centipede.fade );
			this.pain = Math.max( this.pain, this.centipede * 0.8 );
		}

		// sunburn: the midday sun on bare skin (the sea washes sunscreen off); it heals in the shade, burns too
		const screen = this.fxOn( 'sunscreen' );
		if ( screen && p.swimming ) this.fx.sunscreen -= dt * 0.02;
		if ( this._uv > 0.02 ) this.sunburn = clamp01( this.sunburn + dt * A.sun.rate * this._uv * this._skin * ( screen ? A.sun.screen : 1 ) );
		else this.sunburn = Math.max( 0, this.sunburn - dt * A.sun.heal );
		this.burn = Math.max( 0, this.burn - dt * A.sun.heal * 0.6 );
		const skin = Math.max( this.sunburn, this.burn );
		if ( skin > 0.25 ) { this.pain = Math.max( this.pain, skin * 0.5 ); this.mood( { unhappy: dt / 60 * skin * 0.6 } ); }
		if ( this.sunburn > 0.25 ) this.msg( 'sunburn', this.sunburn > 0.6 ? 'Bad sunburn' : 'Sunburn', 'warn', 180 );
		// the sun on you, thirst and burnt skin heat the body
		tAdd += this._uv * 0.35 * ( this._hat ? 0.7 : 1 ) + ( this.thirst < 20 ? ( 20 - this.thirst ) / 20 * 0.6 : 0 ) + this.sunburn * 0.25;

		// heat exhaustion, then heat stroke: water, shade, a swim or a cold pack bring it down
		if ( this.temp > A.heat.from ) this.heat = clamp01( this.heat + dt * ( this.temp - A.heat.from ) * A.heat.rate );
		else this.heat = Math.max( 0, this.heat - dt * A.heat.fade * ( p.swimming || this._indoorsA ? 2 : 1 ) );
		if ( this.heat > A.heat.stroke ) {
			this.health -= dt * 0.05 * ( this.heat - A.heat.stroke ) / ( 1 - A.heat.stroke );
			this.thirst = Math.max( 0, this.thirst - dt * 0.02 );
			this.msg( 'heatstroke', 'Heat stroke', 'bad', 60 );
		} else if ( this.heat > A.heat.exhaust ) this.msg( 'heatx', 'Heat exhaustion', 'warn', 120 );

		// leptospirosis: incubates, then fever and aches that peak and pass; antibiotics end it
		if ( this.leptoT > 0 ) {
			this.leptoT -= dt;
			if ( this.leptoT <= 0 ) { this.leptoT = 0; this.lepto = 0.25; this.leptoPeak = false; this.msg( 'lepto', 'Leptospirosis', 'bad', 10 ); }
		}
		if ( this.lepto > 0 ) {
			if ( ! this.leptoPeak ) { this.lepto = Math.min( 1, this.lepto + dt * A.lepto.rise ); if ( this.lepto >= 1 ) this.leptoPeak = true; }
			else { this.lepto = Math.max( 0, this.lepto - dt * A.lepto.fall ); if ( this.lepto <= 0 ) this.msg( 'leptook', 'Fever gone', 'good', 10 ); }
			tAdd += this.lepto * 1.1;
			this.pain = Math.max( this.pain, this.lepto * 0.4 );
			this.energy = Math.max( 0, this.energy - dt * 0.01 * this.lepto );
			if ( this.lepto > 0.6 ) this.health -= dt * 0.012;
		}

		// an open cut: it closes in minutes (a clean dressing helps), a dressing soils, and dirt can infect it
		if ( this.wound > 0 ) {
			if ( this.bleeding === 0 ) this.wound -= dt * ( this.dressing === 1 ? 1.2 : 1 );
			if ( this.dressing ) {
				this.dressAge += dt;
				if ( this.dressing === 1 && this.dressAge > A.wound.soil ) { this.dressing = 2; this.msg( 'dress', 'Dressing dirty', 'warn', 10 ); }
			}
			if ( this.cut <= 0 && ! this.godMode ) {
				const risk = A.wound.risk * A.wound.dress[ this.dressing ] * ( this.woundClean ? A.wound.clean : 1 ) * this.dressK * ( this.fxOn( 'immune' ) ? 0.6 : 1 ) * this.diff.infection;
				if ( Math.random() < risk * dt ) { this.cut = 0.08; this.msg( 'cut', 'Infected cut', 'bad', 10 ); }
			}
			if ( this.wound <= 0 ) { this.wound = 0; this.woundClean = false; this.dressing = 0; this.dressAge = 0; }
		}
		// an infected cut grows until treated (cleaned and dressed clean, a small one settles); a big one brings fever
		if ( this.cut > 0 ) {
			if ( this.woundClean && this.dressing === 1 && this.cut < 0.4 ) this.cut = Math.max( 0, this.cut - dt * 0.0004 );
			else this.cut = Math.min( 1, this.cut + dt * A.wound.grow );
			this.pain = Math.max( this.pain, this.cut * 0.4 );
			if ( this.cut > 0.5 ) { tAdd += ( this.cut - 0.5 ) * 2; this.health -= dt * 0.02 * ( this.cut - 0.5 ); this.msg( 'cutfever', 'Fever', 'bad', 120 ); }
		}

		// a cough from the cold (or a fever): fits the infected hear, unless an inhaler opens the chest
		if ( this.temp < A.cough.cold || this.lepto > 0.5 ) this.cough = Math.min( 1, this.cough + dt * A.cough.rate * ( this.temp < A.cough.cold ? 1 : 0.4 ) );
		else this.cough = Math.max( 0, this.cough - dt * A.cough.fade * ( this.fxOn( 'immune' ) ? 2 : 1 ) );
		if ( this.cough > 0.25 ) {
			this.msg( 'cough', 'Coughing', 'warn', 300 );
			this._coughT -= dt;
			if ( this._coughT <= 0 ) {
				this._coughT = 16 + Math.random() * 22 * ( 1.4 - this.cough );
				if ( ! this.fxOn( 'breathe' ) && ! p.underwater ) this.coughFit();
			}
		}

		// a sprained wrist mends, three times faster in a sling
		if ( this.sprain > 0 ) {
			this.sprain = Math.max( 0, this.sprain - dt * A.sprain.fade * ( this.sling ? A.sprain.sling : 1 ) );
			this.pain = Math.max( this.pain, this.sprain * ( this.sling ? 0.15 : 0.35 ) );
			if ( this.sprain <= 0 ) { this.sling = false; this.msg( 'sprainok', 'Wrist healed', 'good', 10 ); }
		}
		// seawater in open eyes
		if ( p.underwater && ! this._goggles ) this.eye = Math.min( 1, this.eye + dt * A.eye.rate );
		else this.eye = Math.max( 0, this.eye - dt * A.eye.fade );
		if ( this.eye > 0.3 ) this.msg( 'eye', 'Sore eyes', 'warn', 60 );

		// medicine at work
		if ( this.fxOn( 'calm' ) ) this.mood( { stress: - dt / 60 * 1.2, unhappy: - dt / 60 * 0.9 } );
		if ( this.fxOn( 'steady' ) ) this.panic = Math.max( 0, this.panic - dt * 2 );
		if ( this.fxOn( 'drowsy' ) ) this.energy = Math.max( 0, this.energy - dt * 0.012 );
		if ( this.fxOn( 'warm' ) ) tAdd += 1.2;
		if ( this.fxOn( 'cool' ) ) tAdd -= 0.9;
		this._tempAdd = tAdd;
	}

	// ---- the mind ---------------------------------------------------------------------------------

	// what's around, twice a second: how threatening the infected are (hunting you counts most), the light
	_sense() {
		const g = this.game, p = g.player;
		const near = g.entities?.near?.( p.pos, 15, 'zombie', this._zs || ( this._zs = [] ) ) || [];
		let threat = 0, close = 0;
		for ( const z of near ) {
			if ( ! z.alive ) continue;
			const d = Math.hypot( z.pos.x - p.pos.x, z.pos.z - p.pos.z ), hunting = z.target === p;
			threat += ( 1 - d / 15 ) * ( hunting ? 1.5 : 0.5 );
			if ( hunting && d < 9 ) close += ( 1 - d / 9 ) * ( d < 3 ? 2 : 1 );
		}
		this._threat = threat; this._close = close;
		this._indoors = !! g.world?.isIndoors?.( p.pos );
		this._fire = !! g.nearFire?.( p.pos );
		// a light of your own: carried, on the gun, or one you set down close by (ItemUse.lightNear)
		this._lit = g.itemUse?.lightNear ? g.itemUse.lightNear() : !! p.inventory?.find?.( ( s, d ) => d?.tool?.light && s.data?.on );
	}

	// rates per minute of play, in mood points
	_moods( dt ) {
		const g = this.game, p = g.player, m = dt / 60;
		if ( this.moodless ) return;
		this._senseT -= dt;
		if ( this._senseT <= 0 ) { this._senseT = 0.5; this._sense(); }
		const threat = this._threat, busy = !! g.actions?.busy || !! p.vehicle;
		const idle = ! p.moving && ! busy;
		const night = g.world?.sky?.night || 0;

		// boredom: creeps up when nothing happens, faster indoors and standing about; getting about outdoors eases it
		// a little (as in Zomboid), a fight or fishing breaks it
		let b = idle ? 1.15 + ( this._indoors ? 0.4 : 0 ) : this._indoors ? 0.5 : p.moving || p.vehicle ? - 0.25 : 0.25;
		if ( busy && b > 0 ) b *= 0.3;
		if ( g.fishing?.state ) b = - 0.4;
		if ( threat > 0.3 ) b = - 1.5;
		if ( this.drunk > 0.3 ) b *= 0.5;
		this.boredom = clamp100( this.boredom + b * m );

		// stress: the infected nearby, wounds, fever, hunger, thirst, pain and the dark outdoors; it eases when
		// nothing presses (faster indoors, by a fire, or with a drink)
		// (panic in a fight builds stress; the edge that stress itself keeps you on doesn't feed back)
		let s = Math.min( 20, threat * 6 ) + this.bleeding * 1.5 + ( this._close > 0.05 ? this.panic / 100 * 3 : 0 );
		if ( this.infected ) s += this.infection > 0.25 ? 2 : 1;
		if ( this.hunger < 15 ) s += this.hunger <= 0 ? 2 : 0.8;
		if ( this.thirst < 15 ) s += this.thirst <= 0 ? 2 : 0.8;
		if ( this.pain > 0.4 && this.painkiller <= 0 ) s += 0.6;
		if ( this.fracture && ! this.splint ) s += 1;
		if ( night > 0.6 && ! this._indoors && ! p.vehicle && ! this._fire ) s += this._lit ? 0.3 : 1.2;
		if ( s < 0.05 ) s = - ( this._indoors && threat === 0 ? 2.4 : 1.2 ) - ( this._fire ? 1 : 0 );
		if ( this.drunk > 0.2 ) s -= 3 * this.drunk;
		this.stress = clamp100( this.stress + s * m );

		// panic: a fast spike while the infected close in on you; stress makes it come easier, every kill this
		// life dulls it a little, and it fades in a quarter of a minute once they're gone (but not below the
		// edge that very high stress keeps you on)
		if ( this._close > 0.05 ) {
			const desens = 1 / ( 1 + ( g.stats?.lifeKills || 0 ) / 60 );
			this.panic = clamp100( this.panic + dt * this._close * 8 * ( 0.6 + this.stress / 100 * 0.8 ) * desens );
		} else this.panic = Math.max( this.stress > 90 ? ( this.stress - 90 ) * 5 : 0, clamp100( this.panic - dt * ( threat > 0.3 ? 2 : 6 ) ) );

		// unhappiness: long boredom or stress, cold and wet, pain, hunger, sickness; it lifts slowly when you're
		// neither bored nor stressed, and for a while with a drink
		let u = 0;
		if ( this.boredom > 50 ) u += ( this.boredom - 50 ) / 50;
		if ( this.stress > 60 ) u += ( this.stress - 60 ) / 40 * 0.8;
		if ( this.wet > 0.5 && this.temp < 36.4 ) u += 1; else if ( this.wet > 0.75 ) u += 0.3;
		if ( this.pain > 0.5 && this.painkiller <= 0 ) u += 0.4;
		if ( this.hunger < 10 || this.thirst < 10 ) u += 0.5;
		if ( this.sick > 0.4 ) u += 0.5;
		if ( u < 0.01 && this.boredom < 25 && this.stress < 25 ) u = - 0.3;
		if ( this.drunk > 0.2 ) u -= 1.5 * this.drunk;
		this.unhappy = clamp100( this.unhappy + u * m );

		// a short message when a mood first shows and when it gets bad
		for ( const k of [ 'boredom', 'stress', 'unhappy' ] ) {
			const l = moodLevel( this[ k ] ), was = this.moodLv[ k ];
			if ( l > was && ( l === 1 || l === 3 ) ) this.msg( `mood_${k}${l}`, MOOD_LABEL[ k ][ l >= 3 ? 1 : 0 ], l >= 3 ? 'warn' : 'info', 180 );
			this.moodLv[ k ] = l;
		}
		const pk = this.panic >= 50;
		if ( pk && ! this._panicked ) this.msg( 'panic', 'Panicked', 'warn', 20 );
		this._panicked = pk;
	}

	// moodles for the HUD and the status screen: [ { id, label, kind, level 1-4, mood: true } ]
	moodles() {
		const out = [];
		if ( this.moodless ) return out;
		const kind = ( l ) => l >= 3 ? 'bad' : l >= 2 ? 'warn' : 'mild';
		let sl = moodLevel( this.stress );
		const panicked = this.panic >= 50;
		if ( panicked ) sl = Math.max( sl, this.panic >= 75 ? 4 : 3 );
		if ( sl ) out.push( { id: 'stress', label: panicked ? 'Panicked' : MOOD_LABEL.stress[ sl >= 3 ? 1 : 0 ], kind: kind( sl ), level: sl, mood: true } );
		const ul = moodLevel( this.unhappy );
		if ( ul ) out.push( { id: 'unhappy', label: MOOD_LABEL.unhappy[ ul >= 3 ? 1 : 0 ], kind: kind( ul ), level: ul, mood: true } );
		const bl = moodLevel( this.boredom );
		if ( bl ) out.push( { id: 'bored', label: MOOD_LABEL.boredom[ bl >= 3 ? 1 : 0 ], kind: kind( bl ), level: bl, mood: true } );
		return out;
	}

	// labelled conditions for the HUD: [ { id, label, kind } ] (moodles last, with a level)
	conditions() {
		const c = [];
		if ( this.bleeding ) c.push( { id: 'bleed', label: this.bleeding > 1 ? `Bleeding ×${this.bleeding}` : 'Bleeding', kind: 'bad' } );
		if ( this.fracture ) c.push( { id: 'frac', label: this.splint ? 'Splinted leg' : 'Broken leg', kind: this.splint ? 'warn' : 'bad' } );
		if ( this.infected ) c.push( { id: 'inf', label: this.infection > 0.5 ? 'Severe infection' : 'Infected wound', kind: 'bad' } );
		if ( this.sick > 0.2 ) c.push( { id: 'sick', label: 'Food poisoning', kind: 'warn' } );
		if ( this.temp < 36 ) c.push( { id: 'cold', label: this.temp < 35.2 ? 'Hypothermia' : 'Cold', kind: this.temp < 35.2 ? 'bad' : 'warn' } );
		if ( this.heat > AIL.heat.stroke ) c.push( { id: 'hot', label: 'Heat stroke', kind: 'bad' } );
		else if ( this.heat > AIL.heat.exhaust ) c.push( { id: 'hot', label: 'Heat exhaustion', kind: 'warn' } );
		else if ( this.temp > 38 ) c.push( { id: 'hot', label: this.temp > 38.6 ? 'Heat stroke' : 'Overheating', kind: this.temp > 38.6 ? 'bad' : 'warn' } );
		// the pharmacy's ailments, and a cut's dressing
		for ( const k in AIL_LABEL ) {
			const [ label, kind, from ] = AIL_LABEL[ k ];
			if ( this[ k ] > from ) c.push( { id: k, label: k === 'sunburn' && this.sunburn > 0.6 ? 'Bad sunburn' : label, kind } );
		}
		if ( this.wound > 0 && this.bleeding === 0 ) {
			c.push( this.dressing === 2 ? { id: 'dressing', label: 'Dirty dressing', kind: 'warn' } : this.dressing === 1 ? { id: 'dressing', label: 'Dressed cut', kind: 'good' } : { id: 'wound', label: 'Open cut', kind: 'warn' } );
		}
		if ( this.wet > 0.35 ) c.push( { id: 'wet', label: this.wet > 0.75 ? 'Soaked' : 'Wet', kind: 'warn' } );
		if ( this.blood < 3800 ) c.push( { id: 'blood', label: 'Low blood', kind: this.blood < 3000 ? 'bad' : 'warn' } );
		if ( this.drunk > 0.3 ) c.push( { id: 'drunk', label: 'Drunk', kind: 'warn' } );
		if ( this.caffeine > 0 ) c.push( { id: 'caf', label: 'Energized', kind: 'good' } );
		if ( this.painkiller > 0 ) c.push( { id: 'pk', label: 'Painkillers', kind: 'good' } );
		if ( this.fxOn( 'sunscreen' ) ) c.push( { id: 'sunscreen', label: 'Sunscreen', kind: 'good' } );
		if ( this.fxOn( 'steady' ) ) c.push( { id: 'steady', label: 'Steady', kind: 'good' } );
		if ( this.fxOn( 'drowsy' ) ) c.push( { id: 'drowsy', label: 'Drowsy', kind: 'warn' } );
		if ( this.energy < 20 ) c.push( { id: 'tired', label: 'Exhausted', kind: 'warn' } );
		if ( this.game.player.inventory.totalWeight() > 30 ) c.push( { id: 'heavy', label: 'Overloaded', kind: 'warn' } );
		c.push( ...this.moodles() );
		return c;
	}

	serialize() {
		const o = {};
		for ( const k of [ 'health', 'blood', 'hunger', 'thirst', 'stamina', 'energy', 'temp', 'wet', 'bleeding', 'infection', 'infected', 'fracture', 'splint', 'fractureHeal', 'sick', 'drunk', 'caffeine', 'pain', 'painkiller', 'breath', ...MOOD_KEYS ] ) o[ k ] = this[ k ];
		for ( const k of [ ...AIL_KEYS, 'leptoT', 'leptoPeak', 'wound', 'woundClean', 'dressing', 'dressAge', 'dressK', 'sling' ] ) o[ k ] = this[ k ];
		o.fx = { ...this.fx };
		if ( this.game.skills ) o.skills = this.game.skills.serialize();
		return o;
	}
	load( o ) {
		const { skills, ...rest } = o || {};
		// a save from before the ailments starts clear of them
		this.ailReset();
		if ( rest.fx ) rest.fx = { ...rest.fx };
		Object.assign( this, rest );
		for ( const k of MOOD_KEYS ) if ( ! Number.isFinite( this[ k ] ) ) this[ k ] = 0;
		for ( const k of [ 'boredom', 'stress', 'unhappy' ] ) this.moodLv[ k ] = moodLevel( this[ k ] );
		this.game.skills?.load( skills );
	}
}
