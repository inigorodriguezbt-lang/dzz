// Mood and skills (Node, no browser): node test/mood.mjs
//   the xp curve and levels, skill save / load and reset, recipe -> skill, the mood dynamics in Survival
//   (boredom, stress, panic, unhappiness, their effects, creative / god mode), moodles, sleep (counted once, also
//   when paused through), and in ItemUse: an item's `fun`, the old guides' knowledge, reading as a time-lapse (skill
//   books, novels read again, comics, the newspaper), the light to read by, and what refuses or stops reading.
import * as THREE from 'three';
const warn0 = console.warn;
console.warn = () => {};
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const { defineItems, makeStack, getItem, allItems } = await import( '../src/game/items/ItemDB.js' );
const getItemsWith = ( fn ) => allItems().filter( fn );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { Survival, moodLevel } = await import( '../src/game/Survival.js' );
const { Skills, SKILLS, xpFor, levelFor, MAX_LEVEL } = await import( '../src/game/Skills.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// a game with just what Survival, Skills and ItemUse touch
function fakeGame( o = {} ) {
	const g = {
		mode: 'survival', difficulty: 'normal', stats: {}, playTime: 0, toasts: [],
		events: new Events(),
		time: { hours: 10, dayMinutes: 48 },
		get hour() { return this.time.hours % 24; },
		player: { pos: new THREE.Vector3(), moving: false, sprinting: false, stance: 'stand', walking: false, inventory: new PlayerInventory(), shake: 0 },
		world: { sky: { sunDir: { y: 0.6 }, night: 0 }, isIndoors: () => g._indoors },
		entities: { near: ( p, r, type, out = [] ) => { out.length = 0; for ( const z of g._zombies ) if ( z.pos.distanceTo( p ) <= r ) out.push( z ); return out; } },
		audio: { play() { return null; } },
		toast( text, kind ) { this.toasts.push( text ); },
		onPlayerDeath() {},
		_indoors: false, _zombies: [],
		...o,
	};
	g.actions = new Actions( g );
	g.survival = new Survival( g );
	return g;
}
// run the body for `sec` seconds of play in 0.1 s steps
const run = ( g, sec ) => { for ( let t = 0; t < sec; t += 0.1 ) { g.survival.update( 0.1 ); g.actions.update( 0.1 ); g.itemUse?.update( 0.1 ); } };
const zombie = ( g, d, hunting = true ) => ( { pos: new THREE.Vector3( d, 0, 0 ), alive: true, target: hunting ? g.player : null, type: 'zombie' } );

// ---- skills: curve, levels, save -----------------------------------------------------------------------------
console.log( 'skills' );
ok( SKILLS.length === 13 && SKILLS.includes( 'first_aid' ) && SKILLS.includes( 'stealth' ), 'thirteen skills' );
ok( xpFor( 1 ) === 75 && xpFor( 2 ) === 227 && xpFor( 3 ) === 435 && xpFor( 10 ) === 2986, `curve 75·n^1.6 (${[ 1, 2, 3, 10 ].map( xpFor )})` );
let mono = true;
for ( let l = 1; l <= MAX_LEVEL; l ++ ) if ( xpFor( l ) <= xpFor( l - 1 ) || levelFor( xpFor( l ) ) !== l || levelFor( xpFor( l ) - 0.01 ) !== l - 1 ) mono = false;
ok( mono, 'levels rise with xp, exactly at the thresholds' );
{
	const g = fakeGame(), S = g.skills;
	ok( g.skills instanceof Skills, 'Survival creates game.skills' );
	ok( S.level( 'fishing' ) === 0 && S.progress( 'fishing' ) === 0, 'starts at level 0' );
	S.xp( 'fishing', 80 );
	ok( S.level( 'fishing' ) === 1 && g.toasts.includes( 'Fishing 1' ), 'level up toasts "Fishing 1"' );
	S.xp( 'fishing', 400 );
	ok( S.level( 'fishing' ) === 3 && g.toasts.includes( 'Fishing 3' ), 'several levels at once toast the new one' );
	ok( S.progress( 'fishing' ) > 0 && S.progress( 'fishing' ) < 1, 'progress within a level' );
	S.xp( 'aiming', 1e6 );
	ok( S.level( 'aiming' ) === MAX_LEVEL && S.progress( 'aiming' ) === 1, 'capped at level 10' );
	const before = JSON.stringify( S.xps );
	console.warn = () => {};
	S.xp( 'basket_weaving', 50 );
	console.warn = warn0;
	ok( JSON.stringify( S.xps ) === before, 'unknown skills are ignored' );
	ok( Math.abs( S.mul( 'fishing', 0.05 ) - 1.15 ) < 1e-9, 'mul( skill, perLevel )' );
	S.learn( 'foraging' ); S.setRead( 'fishing_guide', 0.4 );
	const saved = JSON.parse( JSON.stringify( g.survival.serialize() ) );
	ok( saved.skills?.xp?.fishing > 400 && saved.skills.known.foraging && saved.skills.pages.fishing_guide === 0.4, 'skills saved with the body' );
	const g2 = fakeGame();
	g2.survival.load( saved );
	ok( g2.skills.level( 'fishing' ) === 3 && g2.skills.level( 'aiming' ) === 10 && g2.skills.knows( 'foraging' ) && g2.skills.readProgress( 'fishing_guide' ) === 0.4, 'skills load back' );
	ok( g2.survival.skills === undefined, 'the skills block is not copied onto the body' );
	ok( SKILLS.every( k => g2.skills.level( k ) === levelFor( g2.skills.total( k ) ) ), 'cached levels match the xp after a load' );
	const g5 = fakeGame();
	g5.survival.load( { skills: { xp: { fishing: 1e9, stealth: - 5, nonsense: 50 } } } );
	ok( g5.skills.level( 'fishing' ) === 10 && g5.skills.total( 'fishing' ) === xpFor( 10 ) && g5.skills.level( 'stealth' ) === 0 && ! ( 'nonsense' in g5.skills.xps ), 'a bad save is clamped and cleaned' );
	g2.events.emit( 'playerDeath', {} );
	ok( g2.skills.level( 'fishing' ) === 0 && ! g2.skills.knows( 'foraging' ), 'skills die with the character' );
	g2.skills.xp( 'cooking', 100 );
	g2.survival.reset();
	ok( g2.skills.level( 'cooking' ) === 0, 'a new character starts from nothing' );
	g2.survival.load( {} );
	ok( g2.skills.level( 'fishing' ) === 0, 'an old save without skills loads' );
	// the infected shot with a firearm train aiming; other kills and other shooters don't
	const g3 = fakeGame(), z = { type: 'zombie' };
	g3.events.emit( 'kill', { target: z, source: g3.player, weapon: { cat: 'firearm' } } );
	g3.events.emit( 'kill', { target: z, source: g3.player, weapon: { cat: 'melee' } } );
	g3.events.emit( 'kill', { target: z, source: {}, weapon: { cat: 'firearm' } } );
	ok( g3.skills.total( 'aiming' ) === 4, `a firearm kill gives aiming xp (${g3.skills.total( 'aiming' )})` );
}
{
	const S = new Skills( { events: null } );
	const R = ( o ) => ( { in: [], tools: [], time: 6, cat: 'survival', ...o } );
	ok( S.craftSkill( R( { cat: 'food', station: 'fire' } ) ) === 'cooking', 'fire food -> cooking' );
	ok( S.craftSkill( R( { cat: 'medical', in: [ [ 'rags', 2 ] ] } ) ) === 'first_aid', 'medical -> first aid' );
	ok( S.craftSkill( R( { cat: 'tools', in: [ [ 'duct_tape', 1 ], [ 'scrap_metal', 2 ] ], tools: [ 'toolbox' ] } ) ) === 'mechanics', 'toolbox -> mechanics' );
	ok( S.craftSkill( R( { cat: 'weapons', in: [ [ 'baseball_bat', 1 ], [ 'nails', 12 ] ], tools: [ 'hammer' ] } ) ) === 'carpentry', 'hammer and nails -> carpentry' );
	ok( S.craftSkill( R( { cat: 'tools', in: [ [ 'tarp', 1 ], [ 'rope', 1 ] ] } ) ) === 'tailoring', 'tarp sack -> tailoring' );
	ok( S.craftSkill( R( { cat: 'electrical' } ) ) === 'electrical', 'a cat named after a skill' );
	ok( S.craftSkill( R( { skill: 'stealth' } ) ) === 'stealth', 'an explicit skill' );
	ok( S.craftSkill( R( { in: [ [ 'stick', 4 ], [ 'newspaper', 1 ] ] } ) ) === 'survival', 'fire kit -> survival' );
	ok( S.craftXp( R( { time: 12 } ) ) === 6 && S.total( 'survival' ) === 6, 'longer recipes teach more' );
	// recipes.js R() defaults cat to 'survival': those are still read by what they're made of
	ok( S.craftSkill( R( { in: [ [ 'plank', 4 ], [ 'nails', 8 ] ], tools: [ 'hammer' ] } ) ) === 'carpentry', 'planks and nails with the default cat -> carpentry' );
	ok( S.craftSkill( R( { in: [ [ 'stick', 1 ], [ 'rags', 2 ] ] } ) ) === 'survival', 'a torch (rags on a stick) -> survival' );
	ok( S.craftSkill( R( { cat: 'tools', in: [ [ 'sheet_metal', 2 ], [ 'screws', 4 ] ], tools: [ 'screwdriver' ] } ) ) !== 'tailoring', 'sheet metal is not cloth' );
	ok( S.craftSkill( R( { cat: 'tools', in: [ [ 'duct_tape', 1 ], [ 'scrap_metal', 2 ], [ 'wire', 1 ] ], tools: [ 'toolbox' ] } ) ) === 'mechanics', 'wire alone is not electrical' );
	ok( S.craftSkill( R( { cat: 'tools', in: [ [ 'electronics_scrap', 2 ], [ 'wire', 1 ] ], tools: [ 'screwdriver' ] } ) ) === 'electrical', 'electronics -> electrical' );
	ok( S.craftSkill( R( { cat: 'medical', out: [ 'rags', 4 ], in: [ [ 'tshirt', 1 ] ] } ) ) === 'tailoring', 'tearing a shirt into rags -> tailoring' );
	const { R: RR, allRecipes } = await import( '../src/game/items/recipes.js' );
	const rr = RR( 't_x', 'X', [ 'rags', 1 ], [ [ 'stick', 1 ] ], { skill: 'carpentry', xp: 9 } );
	ok( rr.skill === 'carpentry' && rr.xp === 9 && S.craftXp( rr ) === 9 && S.total( 'carpentry' ) === 9, 'R( …, { skill, xp } ) passes through to craftXp' );
	const kinds = new Set( allRecipes().filter( r => ! r.special ).map( r => S.craftSkill( r ) ) );
	ok( [ ...kinds ].every( k => SKILLS.includes( k ) ), `every recipe trains a real skill (${[ ...kinds ].join( ' ' )})` );
}

{
	// /skill and /mood join the chat commands when the game starts
	const g = fakeGame(), said = [];
	g.commands = { cmds: {} }; g.save = { hardcore: false };
	g.events.on( 'chat', ( c ) => said.push( c.text ) );
	g.events.emit( 'start', {} );
	const C = g.commands.cmds;
	ok( C.skill && C.mood, '/skill and /mood registered' );
	C.skill.run( [ 'fishing', '4' ] );
	ok( g.skills.level( 'fishing' ) === 4 && g.stats.cheated, '/skill fishing 4 (a cheat outside creative)' );
	C.skill.run( [] );
	ok( said.some( t => t.includes( 'Fishing 4' ) ), '/skill lists the levels' );
	C.mood.run( [ 'stress', '70' ] );
	ok( g.survival.stress === 70, '/mood stress 70' );
	g.save.hardcore = true;
	C.mood.run( [ 'stress', '0' ] );
	ok( g.survival.stress === 70 && said.includes( 'No cheats in hardcore' ), 'refused in hardcore' );
}

// ---- mood dynamics ---------------------------------------------------------------------------------------------
console.log( 'mood' );
{
	const g = fakeGame( { _indoors: true } ), S = g.survival;
	ok( S.boredom === 0 && S.stress === 0 && S.unhappy === 0 && S.panic === 0, 'a calm start' );
	run( g, 20 * 60 );
	ok( S.boredom > 25 && S.boredom < 40, `twenty idle minutes indoors: bored (${S.boredom.toFixed( 1 )})` );
	ok( g.toasts.includes( 'Bored' ), 'a "Bored" message' );
	const m = S.moodles().find( x => x.id === 'bored' );
	ok( m && m.level === 1 && m.label === 'Bored', 'the bored moodle at level 1' );
	ok( S.conditions().some( c => c.id === 'bored' && c.level === 1 ), 'moodles are in conditions() for the HUD' );
	// getting about outdoors doesn't bore you; it eases boredom a little
	const g2 = fakeGame();
	g2.player.moving = true;
	run( g2, 20 * 60 );
	ok( g2.survival.boredom === 0, `walking outdoors: no boredom (${g2.survival.boredom.toFixed( 1 )})` );
	g2.survival.boredom = 30;
	run( g2, 10 * 60 );
	ok( g2.survival.boredom < 28.5 && g2.survival.boredom > 25, `and eases it slowly (${g2.survival.boredom.toFixed( 1 )})` );
	// standing about outdoors bores, slower than indoors
	const g3 = fakeGame();
	run( g3, 20 * 60 );
	ok( g3.survival.boredom > 18 && g3.survival.boredom < 25, `idle outdoors: bored more slowly (${g3.survival.boredom.toFixed( 1 )})` );
	// pacing about indoors still bores, slowly
	const g4 = fakeGame( { _indoors: true } );
	g4.player.moving = true;
	run( g4, 20 * 60 );
	ok( g4.survival.boredom > 5 && g4.survival.boredom < 15, `moving about indoors (${g4.survival.boredom.toFixed( 1 )})` );
	// long boredom feeds unhappiness
	S.boredom = 95;
	run( g, 10 * 60 );
	ok( S.unhappy > 5, `deep boredom makes you unhappy (${S.unhappy.toFixed( 1 )})` );
}
{
	const g = fakeGame(), S = g.survival;
	const sway0 = S.swayMul();
	g._zombies = [ zombie( g, 3 ), zombie( g, 5 ), zombie( g, 7 ) ];
	run( g, 12 );
	ok( S.panic > 50, `three infected closing in: panic (${S.panic.toFixed( 0 )})` );
	ok( g.toasts.includes( 'Panicked' ), 'a "Panicked" message' );
	ok( S.moodles().some( x => x.id === 'stress' && x.label === 'Panicked' && x.level >= 3 ), 'the stress moodle reads Panicked' );
	run( g, 60 );
	ok( S.stress > 10, `a minute of it is stressful (${S.stress.toFixed( 1 )})` );
	ok( S.swayMul() > sway0 * 1.5, `stress and panic shake the aim (${S.swayMul().toFixed( 2 )})` );
	// very high stress alone keeps you on the edge of panic
	const gp = fakeGame(); gp.survival.stress = 100;
	run( gp, 3 );
	ok( gp.survival.panic >= 45 && gp.survival.panic <= 50, `very high stress: on the edge of panic (${gp.survival.panic.toFixed( 0 )})` );
	run( gp, 10 * 60 );
	ok( gp.survival.stress < 90 && gp.survival.panic < 1, `and it lets go once calm (${gp.survival.stress.toFixed( 0 )})` );
	// unaware infected worry you but don't panic you
	const gu = fakeGame();
	gu._zombies = [ zombie( gu, 6, false ) ];
	run( gu, 10 );
	ok( gu.survival.panic === 0 && gu.survival.stress > 0, 'an unaware zombie: stress without panic' );
	// they're gone: panic fades quickly, stress slowly
	g._zombies = [];
	const st = S.stress;
	run( g, 25 );
	ok( S.panic < 1, `panic fades in seconds (${S.panic.toFixed( 1 )})` );
	run( g, 120 );
	ok( S.stress < st && S.stress > st - 5, `stress eases slowly (${st.toFixed( 1 )} -> ${S.stress.toFixed( 1 )})` );
	g._indoors = true;
	const st2 = S.stress;
	run( g, 120 );
	ok( st2 - S.stress > 4, 'faster indoors' );
	// stress slows getting your breath back
	const regen = ( stress ) => { const gg = fakeGame(); gg.survival.stress = stress; gg.survival.stamina = 20; run( gg, 2 ); return gg.survival.stamina - 20; };
	ok( regen( 100 ) < regen( 0 ) * 0.7, 'stress slows stamina regeneration' );
	// aiming practice steadies
	const ga = fakeGame(); ga.survival.stress = 80;
	const s1 = ga.survival.swayMul(); ga.skills.setLevel( 'aiming', 10 );
	ok( ga.survival.swayMul() < s1 * 0.7, 'aiming practice steadies the sights' );
}
{
	// wounds: stress and a jolt of panic, a bite most of all
	const g = fakeGame(), S = g.survival;
	S.hurt( 10, 'scratch' );
	const p1 = S.panic, s1 = S.stress;
	S.hurt( 10, 'bite' );
	ok( p1 > 5 && S.panic - p1 > p1 && S.stress - s1 > s1, 'a bite frightens more than a scratch' );
	// standing in fire hurts in small ticks (4 a second): they add up, each isn't a full fright
	const gb = fakeGame();
	for ( let i = 0; i < 4; i ++ ) gb.survival.hurt( 0.8, 'burn' );
	ok( gb.survival.panic < 8, `a second of small burns: some panic, not a jolt per tick (${gb.survival.panic.toFixed( 1 )})` );
	// the dark outdoors at night, without a light
	const gn = fakeGame(); gn.world.sky.night = 1;
	run( gn, 300 );
	ok( gn.survival.stress > 4, `the dark outdoors is stressful (${gn.survival.stress.toFixed( 1 )})` );
	// hunger and thirst
	const gh = fakeGame(); gh.survival.hunger = 5; gh.survival.thirst = 5;
	run( gh, 120 );
	ok( gh.survival.stress > 2, 'hunger and thirst stress' );
}
{
	// unhappiness: slower healing, worse sleep
	const heal = ( u ) => { const g = fakeGame(); g.survival.unhappy = u; g.survival.health = 50; run( g, 60 ); return g.survival.health - 50; };
	ok( heal( 100 ) < heal( 0 ) * 0.5, 'unhappiness slows healing' );
	const g = fakeGame(), S = g.survival;
	S.stress = 70; S.unhappy = 80; S.boredom = 60; S.energy = 90;
	run( g, 0.1 );
	// Game.sleep: sleeping, the screen fades, the clock jumps half way through, then sleeping ends
	g.sleeping = true;
	run( g, 1 );
	g.time.hours += 6;
	run( g, 0.2 );
	g.sleeping = false;
	run( g, 0.2 );
	ok( S.stress < 40 && S.boredom < 50 && S.unhappy < 80, 'a night\'s sleep calms and cheers' );
	ok( S.energy < 90 && g.toasts.includes( 'Slept badly' ), 'an unhappy sleeper wakes with less energy' );
	const st0 = S.stress;
	run( g, 1 );
	ok( Math.abs( S.stress - st0 ) < 0.5, 'a sleep counts once' );
	// paused through the jump: the hours still count once the sleep is over
	const gz = fakeGame(), Sz = gz.survival;
	Sz.stress = 70;
	run( gz, 0.1 );
	gz.sleeping = true;
	run( gz, 0.5 );
	gz.time.hours += 5; gz.sleeping = false;
	run( gz, 0.1 );
	ok( Sz.stress < 40, `a sleep seen only after it ended still counts (${Sz.stress.toFixed( 0 )})` );
	// reading jumps the clock too, but it isn't sleep
	const gr = fakeGame(), Sr = gr.survival;
	Sr.stress = 70;
	run( gr, 0.1 );
	gr.time.hours += 2;
	run( gr, 0.2 );
	ok( Sr.stress > 65, 'a clock jump without sleeping is not a sleep' );
	// rotten food is miserable; a drink takes the edge off
	const g2 = fakeGame(), S2 = g2.survival;
	const rot = makeStack( 'raw_fish', 1 ); rot.data.age = 1e4;
	S2.eat( rot );
	ok( S2.unhappy >= 10, `rotten food: unhappy (${S2.unhappy})` );
	S2.stress = 40;
	S2.drink( { drink: { water: 5, alcohol: 0.3 } }, 0.1, 'water' );
	ok( S2.stress < 40 && S2.unhappy < 13, 'alcohol eases stress and unhappiness' );
}
{
	// mood() and the modes
	const g = fakeGame(), S = g.survival;
	S.mood( { boredom: 30, stress: 150, unhappy: - 10 } );
	ok( S.boredom === 30 && S.stress === 100 && S.unhappy === 0, 'mood() adds and clamps to 0..100' );
	ok( moodLevel( 24.9 ) === 0 && moodLevel( 25 ) === 1 && moodLevel( 50 ) === 2 && moodLevel( 75 ) === 3 && moodLevel( 90 ) === 4, 'four levels' );
	S.unhappy = 80;
	ok( S.moodles().find( x => x.id === 'unhappy' )?.label === 'Depressed', 'Depressed at level 3' );
	const saved = JSON.parse( JSON.stringify( S.serialize() ) );
	const g2 = fakeGame(); g2.survival.load( saved );
	ok( g2.survival.stress === 100 && g2.survival.unhappy === 80 && g2.survival.boredom === 30, 'moods save and load' );
	S.godMode = true;
	run( g, 0.2 );
	S.mood( { stress: 50 } );
	ok( S.stress === 0 && S.unhappy === 0 && S.moodles().length === 0, 'god mode: no moods' );
	const gc = fakeGame( { mode: 'creative' } );
	gc._zombies = [ zombie( gc, 2 ) ];
	gc.survival.stress = 60;
	run( gc, 5 );
	ok( gc.survival.stress === 0 && gc.survival.panic === 0 && gc.survival.swayMul() === 1, 'creative: no moods, no shake' );
	// stealth practice softens footsteps
	const gs = fakeGame();
	gs.skills.setLevel( 'stealth', 5 );
	ok( Math.abs( gs.survival.noiseMul() - 0.8 ) < 1e-9, 'stealth level quiets footsteps' );
	// sneaking near unaware infected trains stealth
	gs.skills.setLevel( 'stealth', 0 );
	gs.player.moving = true; gs.player.stance = 'crouch';
	gs._zombies = [ zombie( gs, 10, false ) ];
	run( gs, 30 );
	ok( gs.skills.total( 'stealth' ) > 3 && gs.skills.total( 'stealth' ) < 5, `sneaking trains stealth (${gs.skills.total( 'stealth' ).toFixed( 1 )})` );
	// running past them teaches nothing
	const s0 = gs.skills.total( 'stealth' );
	gs.player.stance = 'stand'; gs.player.walking = false;
	run( gs, 10 );
	ok( gs.skills.total( 'stealth' ) === s0, 'no stealth xp running upright' );
}

// ---- items: fun, guides, reading -------------------------------------------------------------------------------
console.log( 'items' );
defineItems( [
	{ id: 't_novel', name: 'Test novel', cat: 'book', fun: { boredom: - 30, unhappy: - 10 }, read: { hours: 2 } },
	{ id: 't_skillbook', name: 'Test fishing book', cat: 'book', read: { skill: 'fishing', xp: 300, hours: 2 } },
	{ id: 't_candy', name: 'Test candy', cat: 'food', fun: { boredom: - 10, unhappy: - 6 }, food: { kcal: 200, portions: 2 } },
] );
{
	const g = fakeGame(), S = g.survival, U = new ItemUse( g, null );
	g.itemUse = U;
	g.player.inventory.equip.back = makeStack( 'backpack_military', 1 ); // room for everything
	S.boredom = 50; S.unhappy = 50;
	U.applyFun( getItem( 't_candy' ), 0.5 );
	ok( S.boredom === 45 && S.unhappy === 47, 'applyFun scales by the portion' );
	const uke = getItem( 'ukulele' ) || { id: 'ukulele' };
	S.boredom = 60;
	U.applyFun( uke, 1, { repeat: 120, fallback: { boredom: - 20 } } );
	ok( S.boredom === 40, 'a fallback lift for things without fun' );
	U.applyFun( uke, 1, { repeat: 120, fallback: { boredom: - 20 } } );
	ok( S.boredom > 36, 'playing again straight away cheers much less' );
	// eating applies fun per portion
	const candy = makeStack( 't_candy', 1 );
	g.player.inventory.add( candy );
	S.boredom = 50;
	U.eat( candy );
	run( g, 6 );
	ok( Math.abs( S.boredom - 45 ) < 0.5, `eating half the candy: half its fun (${S.boredom.toFixed( 1 )})` );

	// a hot cooked meal cheers a little; a ukulele lifts boredom after a few seconds of playing
	const fish = makeStack( 'cooked_fish', 1 );
	ok( !! fish, 'cooked_fish exists' );
	if ( fish ) {
		g.player.inventory.add( fish );
		S.unhappy = 30; S.hunger = 40; // (not so full it comes back up)
		U.eat( fish );
		run( g, 8 );
		ok( S.unhappy < 30, `a cooked meal: less unhappy (${S.unhappy.toFixed( 1 )})` );
	}
	const uk = makeStack( 'ukulele', 1 );
	g.player.inventory.add( uk );
	const play = U.actions( uk ).find( a => a.verb === 'Play' );
	S.boredom = 70; U.funT = {};
	play?.run();
	ok( g.actions.busy && S.boredom === 70, 'playing takes a moment' );
	run( g, 7 );
	ok( S.boredom < 52, `then boredom falls (${S.boredom.toFixed( 1 )})` );

	// the old guide: knowledge plus a level's worth of fishing
	const guide = makeStack( 'fishing_guide', 1 );
	g.player.inventory.add( guide );
	const spec = U.readSpec( getItem( 'fishing_guide' ) );
	ok( spec && spec.learn === 'fishing' && spec.skill === 'fishing' && spec.once, 'an old guide reads as a skill book' );
	ok( U.actions( guide )[ 0 ]?.verb === 'Read', 'a book\'s default verb is Read' );
	const h0 = g.time.hours;
	U.read( guide );
	ok( U.reading && g.actions.busy, 'reading is a timed action' );
	run( g, 6 );
	ok( g.time.hours > h0 + 0.4 && g.time.hours < h0 + 0.6 && U.reading, `half way, half the hour has passed (${( g.time.hours - h0 ).toFixed( 2 )} h)` );
	ok( g.skills.total( 'fishing' ) > 30 && g.skills.total( 'fishing' ) < 45, 'xp comes in as you read' );
	g.actions.cancel();
	const kept = g.skills.readProgress( 'fishing_guide' );
	ok( kept > 0.4 && kept < 0.6 && ! g.skills.knows( 'fishing' ), 'stopping keeps your place, nothing learned yet' );
	ok( U.actions( guide )[ 0 ]?.note === `${Math.round( kept * 100 )}%`, 'the Read verb shows how far you got' );
	U.read( guide );
	run( g, 8 );
	ok( ! U.reading && g.skills.knows( 'fishing' ) && U.knowledge.fishing, 'finishing teaches the knowledge (itemUse.knowledge still reads it)' );
	ok( Math.abs( g.skills.total( 'fishing' ) - 75 ) < 0.01 && g.skills.level( 'fishing' ) === 1, `a level's worth of xp in all (${g.skills.total( 'fishing' ).toFixed( 2 )})` );
	ok( Math.abs( g.time.hours - h0 - 1 ) < 0.01, 'the guide took an hour of game time' );
	ok( ! U.actions( guide ).some( a => a.verb === 'Read' ), 'a read guide has no Read verb' );
	ok( g.toasts.includes( 'Learned: fishing' ) && g.toasts.includes( 'Fishing 1' ), 'toasts: learned, and the level' );

	// a skill book with xp, and a novel for fun (read again and again)
	const book = makeStack( 't_skillbook', 1 ), novel = makeStack( 't_novel', 1 );
	g.player.inventory.add( book ); g.player.inventory.add( novel );
	U.read( book );
	run( g, 25 );
	ok( Math.abs( g.skills.total( 'fishing' ) - 375 ) < 0.01, 'a skill book grants its xp' );
	S.boredom = 60; S.unhappy = 20;
	U.read( novel );
	run( g, 25 );
	ok( Math.abs( S.boredom - 30 ) < 1 && S.unhappy < 11, `a novel's fun comes with reading it (${S.boredom.toFixed( 1 )})` );
	ok( U.actions( novel ).some( a => a.verb === 'Read' ) && g.skills.readProgress( 't_novel' ) === 0, 'a novel can be read again' );
	// the dark and danger stop you
	g.world.sky.night = 1;
	U.read( novel );
	ok( ! U.reading && g.toasts.includes( 'Too dark to read' ), 'too dark to read at night without a light' );
	g.world.sky.night = 0;
	U.read( novel );
	g._zombies = [ zombie( g, 6 ) ];
	run( g, 1 );
	ok( ! U.reading && ! g.actions.busy, 'the infected closing in interrupt reading' );
	g._zombies = [];
	g.actions.cancel();

	// light to read by at night: a lantern you set down, a flare on the ground, a light you carry
	g.world.sky.night = 1;
	ok( ! U.canSee(), 'dark at night with no light' );
	const lantern = { stack: { data: { on: true, charge: 5 } }, kind: 'light' };
	g.placeables = { near: ( p, r, kind ) => kind === 'light' ? [ lantern ] : [] };
	ok( U.canSee() && U.lightNear(), 'a lit lantern set down close by' );
	lantern.stack.data.on = false;
	ok( ! U.canSee(), 'not once it is out' );
	g.placeables = null;
	U.flares.push( { pos: new THREE.Vector3( 3, 0, 0 ) } );
	ok( U.canSee(), 'a burning flare nearby' );
	U.flares.length = 0;
	const lamp = Object.values( getItemsWith( d => d.tool?.light && d.tool.kind === 'lantern' ) )[ 0 ];
	if ( lamp ) {
		const ls = makeStack( lamp.id, 1 ); ls.data.on = true; ls.data.charge = 5;
		g.player.inventory.add( ls );
		ok( U.canSee(), `a lit ${lamp.id} you carry` );
		// and the dark outdoors isn't stressful with it
		g.survival._sense();
		ok( g.survival._lit, 'Survival sees the carried light' );
		g.player.inventory.remove( ls );
	}
	g.world.sky.night = 0;

	// no reading in the water, at the wheel, or in a panic
	g.player.swimming = true; U.read( novel ); g.player.swimming = false;
	ok( ! U.reading, 'not while swimming' );
	g.player.vehicle = { driver: true }; U.read( novel ); g.player.vehicle = null;
	ok( ! U.reading, 'not while driving' );
	S.panic = 60; U.read( novel );
	ok( ! U.reading && g.toasts.includes( 'Too tense to read' ), 'not while panicked' );
	S.panic = 0;

	// a novel: stopping keeps your place too; read again soon after finishing, it cheers much less
	const g6 = fakeGame(), U6 = new ItemUse( g6, null ), S6 = g6.survival;
	g6.itemUse = U6;
	g6.player.inventory.equip.back = makeStack( 'backpack_military', 1 );
	const nov = makeStack( 't_novel', 1 );
	g6.player.inventory.add( nov );
	S6.boredom = 80;
	U6.read( nov );
	run( g6, 12 );
	g6.actions.cancel();
	const half = g6.skills.readProgress( 't_novel' );
	ok( half > 0.4 && half < 0.6 && Math.abs( S6.boredom - 80 + 30 * half ) < 1, `half a novel, half its fun (${half.toFixed( 2 )}, ${S6.boredom.toFixed( 1 )})` );
	U6.read( nov );
	run( g6, 14 );
	ok( ! U6.reading && Math.abs( S6.boredom - 50 ) < 1 && g6.skills.readProgress( 't_novel' ) === 0, `finishing it later: the rest of its fun (${S6.boredom.toFixed( 1 )})` );
	S6.boredom = 80;
	U6.read( nov );
	run( g6, 26 );
	ok( S6.boredom > 74, `read again straight away: little fun (${S6.boredom.toFixed( 1 )})` );
	g6.playTime += 3600;
	S6.boredom = 80;
	U6.read( nov );
	run( g6, 26 );
	ok( Math.abs( S6.boredom - 50 ) < 1, `an hour of play later: full fun again (${S6.boredom.toFixed( 1 )})` );

	// a plain book (a comic) reads for its own sake: half an hour, less boredom, again and again
	const comic = makeStack( 'comic_book', 1 );
	if ( comic ) {
		g6.player.inventory.add( comic );
		const cv = U6.actions( comic ).find( a => a.verb === 'Read' );
		ok( !! cv && U6.actions( comic )[ 0 ]?.verb === 'Read', 'a comic book can be read (its default)' );
		S6.boredom = 60; S6.unhappy = 20;
		const h1 = g6.time.hours;
		cv.run();
		run( g6, 7 );
		ok( ! U6.reading && S6.boredom < 52 && S6.unhappy < 18 && Math.abs( g6.time.hours - h1 - 0.5 ) < 0.02, `a comic: half an hour, a lift (${S6.boredom.toFixed( 1 )})` );
		ok( U6.actions( comic ).some( a => a.verb === 'Read' ), 'and can be read again' );
		// the book gone mid-read stops it
		U6.read( comic );
		run( g6, 1 );
		g6.player.inventory.remove( comic );
		run( g6, 1 );
		ok( ! U6.reading && ! g6.actions.busy, 'dropping the book stops reading' );
	}

	// a newspaper is a quick read; a domain verb can read anything with its own spec
	const paper = makeStack( 'newspaper', 1 );
	g6.player.inventory.add( paper );
	ok( U6.readSpec( getItem( 'newspaper' ) )?.hours === 0.25 && U6.actions( paper ).some( a => a.verb === 'Read' ), 'a newspaper can be read' );
	const h2 = g6.time.hours;
	U6.read( paper, { hours: 2, xp: 40, skill: 'mechanics' } );
	run( g6, 26 );
	ok( Math.abs( g6.time.hours - h2 - 2 ) < 0.02 && Math.abs( g6.skills.total( 'mechanics' ) - 40 ) < 0.01, 'read( stack, spec ) uses the given spec' );

	// old saves: the world's knowledge goes to the character once
	const g4 = fakeGame(), U4 = new ItemUse( g4, null );
	const save = { world: { knowledge: { survival: true } } };
	U4.load( save );
	ok( g4.skills.knows( 'survival' ) && ! save.world.knowledge, 'old world knowledge moves to the character' );
	// first aid practice speeds treatment
	const t0 = U4.medTime( 10 ); g4.skills.setLevel( 'first_aid', 10 );
	ok( U4.medTime( 10 ) < t0 * 0.7, 'first aid practice speeds treatment' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
