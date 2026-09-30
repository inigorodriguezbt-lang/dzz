// The body: health, blood, hunger, thirst, stamina, fatigue, temperature, wetness and the
// conditions (bleeding, bite infection, fractures, food poisoning, drunk, pain, drowning).
import { getItem, freshness } from './items/ItemDB.js';

export const DIFFICULTY = {
	easy: { drain: 0.6, dmgIn: 0.6, infection: 0.4 },
	normal: { drain: 1, dmgIn: 1, infection: 1 },
	hard: { drain: 1.35, dmgIn: 1.35, infection: 1.5 },
};

export class Survival {
	constructor( game ) {
		this.game = game;
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
	}

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

	noiseMul() { return this.fracture ? 1.3 : 1; }

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
		let sickC = ( f.sick || 0 ) + ( f.raw ? 0.35 : 0 ) + ( fresh <= 0 ? 0.7 : fresh < 0.25 ? 0.25 : 0 );
		if ( Math.random() < sickC ) { this.sick = Math.min( 1, this.sick + 0.45 ); this.msg( 'sick', 'Nauseous', 'warn' ); }
		if ( this.hunger > 100 && Math.random() < 0.3 ) this.vomit();
		return fresh <= 0 ? 'That was rotten.' : null;
	}

	drink( def, amountL = 0.33, liquid = 'water' ) {
		const d = def?.drink || {};
		if ( liquid === 'sea' ) { this.thirst = Math.max( 0, this.thirst - 8 ); this.msg( 'salt', 'Salt water', 'bad' ); return; }
		const water = d.water != null ? d.water : amountL * 60;
		this.thirst = Math.min( 105, this.thirst + water );
		this.hunger = Math.min( 110, this.hunger + ( d.kcal || 0 ) / 20 );
		if ( d.alcohol ) this.drunk = Math.min( 1, this.drunk + d.alcohol );
		if ( d.caffeine ) this.caffeine = Math.min( 300, this.caffeine + d.caffeine );
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
		this.msg( 'vomit', 'Vomited', 'warn' );
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
			this.damageFlash = Math.max( 0, this.damageFlash - dt * 1.5 );
			return;
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
		if ( ! p.sprinting ) this.stamina = Math.min( maxS, this.stamina + dt * ( p.moving ? 6 : 11 ) * ( this.caffeine > 0 ? 1.4 : 1 ) );
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
			this.health = Math.min( 100, this.health + dt * 0.06 );
		}

		// the body's own sounds: a heartbeat when close to death, heavy breathing when spent
		this.beatT = ( this.beatT || 0 ) - dt;
		if ( this.beatT <= 0 && ( this.health < 30 || this.blood < 2900 ) ) {
			this.beatT = this.health < 15 ? 0.62 : 0.9;
			g.audio?.play( 'heartbeat', { bus: 'ui', vol: 0.55, detune: 0 } );
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

	// labelled conditions for the HUD: [ { id, label, kind } ]
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
		return c;
	}

	serialize() {
		const o = {};
		for ( const k of [ 'health', 'blood', 'hunger', 'thirst', 'stamina', 'energy', 'temp', 'wet', 'bleeding', 'infection', 'infected', 'fracture', 'splint', 'fractureHeal', 'sick', 'drunk', 'caffeine', 'pain', 'painkiller', 'breath' ] ) o[ k ] = this[ k ];
		return o;
	}
	load( o ) { Object.assign( this, o || {} ); }
}
