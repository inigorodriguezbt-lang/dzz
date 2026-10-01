// The body: health, blood, hunger, thirst, stamina, fatigue, temperature, wetness and the
// conditions (bleeding, bite infection, fractures, food poisoning, drunk, pain, drowning).
// The mind (Project Zomboid's moodles, gentler): boredom, stress and unhappiness 0..100, and panic, a fast spike
// when the infected close in. mood( { boredom, stress, unhappy, panic } ) adds deltas (items' `fun`, sleep,
// food). Stress and panic shake the aim (swayMul) and slow stamina; unhappiness slows healing and spoils sleep;
// long boredom or stress feeds unhappiness. Creative and god mode keep them at 0.
// game.skills (Skills.js) lives with the body: saved in this state, reset for a new character.
import { getItem, freshness } from './items/ItemDB.js';
import { Skills } from './Skills.js';

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
		// a new character knows nothing yet
		this.game.skills?.reset();
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
		return ( 1 + this.stress / 100 * 0.7 + this.panic / 100 * 0.7 ) * ( 1 - aim * 0.035 );
	}

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
		return Math.max( 20, m );
	}

	moveModifiers() {
		const w = this.game.player.inventory.totalWeight();
		let speed = 1, canSprint = true, canJump = true;
		if ( w > 30 ) speed *= Math.max( 0.55, 1 - ( w - 30 ) * 0.02 );
		if ( w > 42 ) canSprint = false;
		if ( this.fracture ) { speed *= this.splint ? 0.6 : 0.4; canSprint = false; canJump = false; }
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
			bite = Math.max( bite, ( a.bite || 0 ) * s.cond );
			bullet = Math.max( bullet, ( a.bullet || 0 ) * s.cond );
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
		if ( Math.random() < bleedChance ) { this.bleeding = Math.min( 6, this.bleeding + 1 ); this.msg( 'bleed', 'Bleeding', 'bad' ); }
		if ( ( kind === 'bite' || kind === 'scratch' ) && Math.random() < ( kind === 'bite' ? 0.18 : 0.06 ) * this.diff.infection * ( 1 - bite ) ) {
			if ( ! this.infected ) { this.infected = true; this.infection = Math.max( this.infection, 0.02 ); this.msg( 'inf', 'Infected', 'bad', 0 ); }
		}
		if ( kind === 'fall' && info.fall > 5 && Math.random() < 0.4 + ( info.fall - 5 ) * 0.1 ) this.breakLeg();
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
		if ( d.sick && Math.random() < d.sick ) this.sick = Math.min( 1, this.sick + 0.4 );
	}

	medicate( def ) {
		const m = def.medical;
		if ( m.bleed ) this.bleeding = Math.max( 0, this.bleeding - m.bleed );
		if ( m.heal ) this.health = Math.min( 100, this.health + m.heal );
		if ( m.blood ) this.blood = Math.min( 5000, this.blood + m.blood );
		if ( m.infection ) { this.infection = Math.max( 0, this.infection - m.infection ); if ( this.infection <= 0.01 ) { this.infected = false; this.infection = 0; } }
		if ( m.pain ) this.painkiller = Math.max( this.painkiller, m.pain );
		if ( m.splint && this.fracture ) { this.splint = true; this.msg( 'splint', 'Leg splinted', 'good' ); }
		if ( m.sick ) this.sick = Math.max( 0, this.sick - m.sick );
		if ( m.energy ) this.energy = Math.min( 100, this.energy + m.energy );
		if ( m.stamina ) this.stamina = this.maxStamina();
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
		const q = this.sleepQuality();
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

		// temperature
		this.envTemp = this.environmentTemp();
		let insul = 0.05, water = 0;
		for ( const s of Object.values( p.inventory.equip ) ) {
			const c = s && getItem( s.id )?.clothing;
			if ( c ) { insul += ( c.insulation || 0 ) * ( 0.4 + 0.6 * s.cond ); water = Math.max( water, c.waterproof || 0 ); }
		}
		const rain = g.weather?.rain || 0;
		if ( p.swimming || p.underwater ) this.wet = Math.min( 1, this.wet + dt * 0.5 );
		else if ( rain > 0.1 && ! g.world.isIndoors?.( p.pos ) ) this.wet = Math.min( 1, this.wet + dt * 0.01 * rain * ( 1 - water ) );
		else this.wet = Math.max( 0, this.wet - dt * ( 0.004 + Math.max( 0, this.envTemp - 20 ) * 0.0006 ) );
		const effIns = insul * ( 1 - this.wet * 0.7 );
		const heatGen = ( p.sprinting ? 1.2 : p.moving ? 0.5 : 0.1 ) + ( this.caffeine > 0 ? 0.1 : 0 );
		const target = 37 + ( this.envTemp - 24 ) * 0.09 * ( 1 - Math.min( 0.9, effIns ) ) + heatGen * 0.4 - this.wet * 1.4 + ( this.envTemp > 30 ? effIns * 1.2 : 0 );
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
		if ( this.bleeding === 0 && this.hunger > 50 && this.thirst > 50 && this.blood > 4000 && ! this.infected && this.temp > 36 && this.temp < 38 ) {
			this.health = Math.min( 100, this.health + dt * 0.06 * this.healMul() );
		}

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
				: this.temp > 38.6 ? 'heat stroke' : this.breath <= 0 ? 'drowning' : this.infected ? 'infection' : 'injuries';
			g.onPlayerDeath( cause );
		}
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
		if ( this.temp > 38 ) c.push( { id: 'hot', label: this.temp > 38.6 ? 'Heat stroke' : 'Overheating', kind: this.temp > 38.6 ? 'bad' : 'warn' } );
		if ( this.wet > 0.35 ) c.push( { id: 'wet', label: this.wet > 0.75 ? 'Soaked' : 'Wet', kind: 'warn' } );
		if ( this.blood < 3800 ) c.push( { id: 'blood', label: 'Low blood', kind: this.blood < 3000 ? 'bad' : 'warn' } );
		if ( this.drunk > 0.3 ) c.push( { id: 'drunk', label: 'Drunk', kind: 'warn' } );
		if ( this.caffeine > 0 ) c.push( { id: 'caf', label: 'Energized', kind: 'good' } );
		if ( this.painkiller > 0 ) c.push( { id: 'pk', label: 'Painkillers', kind: 'good' } );
		if ( this.energy < 20 ) c.push( { id: 'tired', label: 'Exhausted', kind: 'warn' } );
		if ( this.game.player.inventory.totalWeight() > 30 ) c.push( { id: 'heavy', label: 'Overloaded', kind: 'warn' } );
		c.push( ...this.moodles() );
		return c;
	}

	serialize() {
		const o = {};
		for ( const k of [ 'health', 'blood', 'hunger', 'thirst', 'stamina', 'energy', 'temp', 'wet', 'bleeding', 'infection', 'infected', 'fracture', 'splint', 'fractureHeal', 'sick', 'drunk', 'caffeine', 'pain', 'painkiller', 'breath', ...MOOD_KEYS ] ) o[ k ] = this[ k ];
		if ( this.game.skills ) o.skills = this.game.skills.serialize();
		return o;
	}
	load( o ) {
		const { skills, ...rest } = o || {};
		Object.assign( this, rest );
		for ( const k of MOOD_KEYS ) if ( ! Number.isFinite( this[ k ] ) ) this[ k ] = 0;
		for ( const k of [ 'boredom', 'stress', 'unhappy' ] ) this.moodLv[ k ] = moodLevel( this[ k ] );
		this.game.skills?.load( skills );
	}
}
