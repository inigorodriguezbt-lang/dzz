// Creatures behaviour tests (Node, no browser): the real module with real avatars, bodies, ragdolls, physics and
// ballistics on a flat test ground (test/lib/creature-world.mjs). Sight, hearing, screams, chasing, telegraphed
// attacks, hit zones and headshots, knockdowns, crawlers, deaths, searchable bodies, doors, steering round walls,
// cars, the population, saves, animals, bandits, every /summon name, difficulty, dispose and the per-frame cost.
//   node test/creatures-ai.mjs
import * as THREE from 'three';
import { makeWorld, V, GROUND } from './lib/creature-world.mjs';

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const face = ( from, to ) => Math.atan2( - ( to.x - from.x ), - ( to.z - from.z ) ); // yaw that looks from -> to
const dist2 = ( a, b ) => Math.hypot( a.x - b.x, a.z - b.z );
const quiet = ( w ) => { w.g.survival.hurt = ( a, kind ) => w.log.push( [ 'hurt', kind, a ] ); };

// ---- sight ---------------------------------------------------------------------------------------------------
console.log( 'sight' );
{
	// seen from 20 m in the open by day when it looks this way; not when it looks away
	const w = await makeWorld();
	const a = w.zombie( 'civilian', V( 0, GROUND, - 20 ), { yaw: Math.PI } );
	const t = w.step( 4, 1 / 30, () => a.state === 'chase' );
	ok( a.state === 'chase' && t < 3, `seen at 20 m by day (${t.toFixed( 2 )} s)` );
	w.dispose();
	const w2 = await makeWorld();
	const b = w2.zombie( 'civilian', V( 0, GROUND, - 20 ), { yaw: 0 } );
	w2.step( 4 );
	ok( b.state !== 'chase', `not by one looking away (${b.state})` );
	w2.dispose();
}
{
	// at night, standing still at 30 m: unseen; with a torch on, seen
	const w = await makeWorld( { night: 1 } );
	const a = w.zombie( 'civilian', V( 0, GROUND, - 30 ), { yaw: Math.PI } );
	w.step( 4 );
	ok( a.state !== 'chase', `unseen at 30 m at night (${a.state})` );
	w.g.hands = { spot: { intensity: 2 } };
	// (it may have wandered off meanwhile: turn it back)
	a.pos.set( 0, GROUND, - 30 ); a.yaw = Math.PI; a.facing = Math.PI; a._setState( 'idle' ); a.wantV = 0; a.speed = 0;
	w.step( 4, 1 / 30, () => a.state === 'chase' );
	ok( a.state === 'chase', 'seen at night with a torch on' );
	w.dispose();
}
{
	// prone at 18 m by day: unseen; standing up there: seen
	const w = await makeWorld();
	w.g.player.stance = 'prone';
	const a = w.zombie( 'civilian', V( 0, GROUND, - 18 ), { yaw: Math.PI } );
	w.step( 4 );
	ok( a.state !== 'chase', `unseen lying prone at 18 m (${a.state})` );
	w.g.player.stance = 'crouch';
	const b = w.zombie( 'civilian', V( 3, GROUND, - 12 ), { yaw: face( V( 3, 0, - 12 ), w.g.player.pos ) } );
	w.step( 4 );
	ok( b.state === 'chase', 'seen crouching at 12 m' );
	w.dispose();
}
{
	// half-seen at 26 m, off to one side: it stops, turns to stare, then comes
	const w = await makeWorld();
	const a = w.zombie( 'civilian', V( 0, GROUND, - 26 ), { yaw: Math.PI + 0.85 } );
	let stared = false;
	w.step( 8, 1 / 30, () => {
		if ( a.state === 'idle' && a.aware > 0.3 && Math.abs( Math.atan2( Math.sin( a.yaw - Math.PI ), Math.cos( a.yaw - Math.PI ) ) ) < 0.2 ) stared = true;
		return a.state === 'chase';
	} );
	ok( stared, 'it turns to stare at something half-seen' );
	ok( a.state === 'chase', `then comes for you (${a.state})` );
	w.dispose();
}
{
	// a wall in between hides you
	const w = await makeWorld( { walls: [ [ 0, - 8, 6, 0.3 ] ] } );
	const a = w.zombie( 'civilian', V( 0, GROUND, - 14 ), { yaw: Math.PI } );
	w.step( 4 );
	ok( a.state !== 'chase', `unseen behind a wall (${a.state})` );
	w.dispose();
}

// ---- hearing and screams --------------------------------------------------------------------------------------
console.log( 'hearing' );
{
	// a rifle shot 250 m away brings them; a footstep that far does not
	const w = await makeWorld();
	const a = w.zombie( 'civilian', V( 250, GROUND, 0 ), { yaw: 0 } );
	const b = w.zombie( 'civilian', V( - 250, GROUND, 0 ), { yaw: 0 } );
	w.noise( V( 0, GROUND, 0 ), 20, 'step' );
	ok( b.state === 'idle', 'a footstep 250 m away goes unheard' );
	w.noise( V( 0, GROUND, 0 ), 400, 'gunshot' );
	ok( a.state === 'investigate' && a.urgent, `a gunshot 250 m away draws them (${a.state})` );
	const d0 = dist2( a.pos, V( 0, 0, 0 ) );
	w.step( 10 );
	ok( dist2( a.pos, V( 0, 0, 0 ) ) < d0 - 12, `and they come (${d0.toFixed( 0 )} -> ${dist2( a.pos, V( 0, 0, 0 ) ).toFixed( 0 )} m)` );
	// the ones beyond the active area are drawn in too: extra population towards the shot
	w.g.creatures.first = false;
	w.noise( V( 0, GROUND, 0 ), 400, 'gunshot' );
	ok( w.g.creatures.pull && w.g.creatures.pull.n >= 2, `a shot draws more in from afar (${w.g.creatures.pull?.n})` );
	w.dispose();
}
{
	// a scream brings the ones within 35 m; not those further off
	const w = await makeWorld();
	const a = w.zombie( 'civilian', V( 0, GROUND, - 10 ), { yaw: Math.PI } );
	const near = w.zombie( 'civilian', V( 20, GROUND, - 30 ), { yaw: 0 } );
	const far = w.zombie( 'civilian', V( 60, GROUND, - 60 ), { yaw: 0 } );
	w.g.creatures.alert( a.pos, 35, w.g.player, a );
	ok( near.state === 'chase' && near.target === w.g.player, 'a scream sends the near ones after you' );
	ok( far.state === 'idle', 'but not those out of earshot' );
	// and detection does scream now and then
	let screams = 0;
	for ( let i = 0; i < 30; i ++ ) { const z = w.zombie( 'civilian', V( i, GROUND, - 5 ), { yaw: Math.PI } ); z._detected( w.g.player ); }
	screams = w.count( 'snd' ) && w.log.filter( e => e[ 1 ] === 'z_scream' ).length;
	ok( screams > 4 && screams < 26, `some of them scream on seeing you (${screams}/30)` );
	w.dispose();
}

// ---- attacks -----------------------------------------------------------------------------------------------------
console.log( 'attacks' );
{
	const w = await makeWorld();
	quiet( w );
	const a = w.zombie( 'civilian', V( 0, GROUND, - 1.1 ), { yaw: 0 } );
	a.yaw = Math.PI;
	let start = - 1, first = - 1;
	w.step( 6, 1 / 60, ( t ) => {
		if ( start < 0 && a.atk ) start = t;
		if ( first < 0 && w.log.some( e => e[ 0 ] === 'hurt' ) ) first = t;
	} );
	const hurts = w.log.filter( e => e[ 0 ] === 'hurt' );
	ok( hurts.length >= 2 && hurts.every( h => h[ 1 ] === 'bite' || h[ 1 ] === 'scratch' ), `it claws and bites (${hurts.map( h => h[ 1 ] ).join( ' ' )})` );
	ok( first - start > 0.4, `the blow is telegraphed (${( first - start ).toFixed( 2 )} s wind-up)` );
	ok( hurts.length <= 6, `not a blur of hits (${hurts.length} in 6 s)` );
	// stepping back during the wind-up makes it miss
	w.log.length = 0;
	a.attackCd = 0; a.atk = null; a.body.action = null;
	w.step( 1, 1 / 60, () => a.atk ? true : undefined );
	w.g.player.pos.set( 0, GROUND, 3 );
	w.step( 0.8, 1 / 60 );
	ok( ! w.log.some( e => e[ 0 ] === 'hurt' ) && w.log.some( e => e[ 1 ] === 'swing' ), 'backing off in time dodges the swing' );
	// the player goes down: the ones on them kneel over the body and feed
	const b = w.zombie( 'civilian', V( 2, GROUND, 3 ), { yaw: 0 } );
	for ( const z of [ a, b ] ) { z.target = w.g.player; z.lastSeen.copy( w.g.player.pos ); z.lastSeenT = w.g.creatures.time; z._setState( 'chase' ); }
	w.step( 1 );
	w.g.dead = true;
	w.step( 8, 1 / 30, () => a.state === 'feed' && b.state === 'feed' );
	ok( a.state === 'feed' && b.state === 'feed', `they feed on the fallen player (${a.state}, ${b.state})` );
	ok( dist2( a.pos, w.g.player.pos ) < 1.6 && a.body.action?.kind === 'eat', 'kneeling at the body' );
	w.dispose();
}

// ---- hit zones, headshots, knockdowns, crawlers, deaths ---------------------------------------------------------
console.log( 'damage' );
{
	const w = await makeWorld();
	const a = w.zombie( 'civilian', V( 0, GROUND, - 12 ), { yaw: 0 } );
	w.step( 0.2 );
	const head = a.inst.bonePos( 'head', V() ).add( V( 0, 0.08, 0 ) );
	w.fireAt( head, 'm4a1' );
	w.step( 0.2 );
	ok( ! a.alive, 'an M4 round through the head kills' );
	ok( w.log.some( e => e[ 0 ] === 'kill' && e[ 3 ] === 'player' ), 'the kill is counted to the player' );
	// the torso takes several
	const b = w.zombie( 'civilian', V( 3, GROUND, - 12 ), { yaw: 0 } );
	w.step( 0.2 );
	w.fireAt( b.inst.bonePos( 'spine2', V() ), 'm4a1' );
	w.step( 0.2 );
	ok( b.alive && b.health < b.maxHealth, `one round in the chest does not (${b.health.toFixed( 0 )} hp left)` );
	ok( b.body.mode === 'stand', 'nor does it knock it down' );
	// hit zones follow the pose: a ray at the head, the chest, a knee
	const c = w.zombie( 'civilian', V( - 3, GROUND, - 6 ), { yaw: 0 } );
	w.step( 0.3 );
	const eye = V( 0, GROUND + 1.66, 0 );
	const zoneAt = ( p ) => { const d = p.clone().sub( eye ).normalize(); return c.hitTest( eye, d, 50 )?.zone; };
	ok( zoneAt( c.inst.bonePos( 'head', V() ).add( V( 0, 0.07, 0 ) ) ) === 'head', 'the head is the head' );
	ok( zoneAt( c.inst.bonePos( 'spine2', V() ) ) === 'torso', 'the chest is the torso' );
	ok( zoneAt( c.inst.bonePos( 'lCalf', V() ).lerp( c.inst.bonePos( 'lThigh', V() ), 0.2 ) ) === 'leg', 'a knee is a leg' );
	ok( zoneAt( c.inst.bonePos( 'head', V() ).add( V( 0.6, 0.1, 0 ) ) ) === undefined, 'a miss beside the head is a miss' );
	w.dispose();
}
{
	// a shotgun blast up close knocks it down (or a pellet finds the head of a stooped one); it gets back up
	const w = await makeWorld();
	const shot = [];
	for ( let i = 0; i < 6; i ++ ) {
		const z = w.zombie( 'civilian', V( i * 3, GROUND, - 4 ), { yaw: Math.PI } );
		z.maxHealth = z.health = 400; // survive the blast
		w.g.player.pos.set( i * 3, GROUND, 0 );
		w.step( 0.2 );
		w.fireAt( z.inst.bonePos( 'spine2', V() ), 'remington_870' );
		w.step( 0.05 );
		shot.push( z );
	}
	const downed = shot.filter( z => z.alive && z.down && z.body.mode === 'ragdoll' );
	ok( shot.every( z => ! z.alive || z.down ) && downed.length >= 3, `a shotgun blast knocks them down (${downed.length} down, ${shot.filter( z => ! z.alive ).length} dead of 6)` );
	const a = downed[ 0 ] || shot[ 0 ];
	const t = w.step( 12, 1 / 30, () => a.body.mode === 'stand' && ! a.down );
	ok( a.alive && a.body.mode === 'stand', `and they get back up (${t.toFixed( 1 )} s)` );
	w.g.player.pos.set( 0, GROUND, 0 );
	// a spent pellet in the head wounds, a close one kills
	const b = w.zombie( 'civilian', V( 2, GROUND, - 4 ), { yaw: Math.PI } );
	w.step( 0.1 );
	b.damage( 20, { kind: 'bullet', zone: 'head', dir: V( 0, 0, - 1 ) } );
	ok( b.alive, 'a weak pellet to the head only wounds' );
	b.damage( 56, { kind: 'bullet', zone: 'head', dir: V( 0, 0, - 1 ) } );
	ok( ! b.alive, 'a full-power pellet to the head kills' );
	// melee: a heavy blow staggers, a shove can floor it
	const c = w.zombie( 'civilian', V( - 2, GROUND, - 2 ), { yaw: Math.PI } );
	w.step( 0.1 );
	c.stagger( V( 0, 0, - 1 ), 0.8 );
	ok( c.knock && c.knock.length() > 1 && ! c.atk, 'a blow staggers it back' );
	let floored = 0;
	for ( let i = 0; i < 20; i ++ ) {
		const d = w.zombie( 'civilian', V( - 6 - i, GROUND, - 2 ), { yaw: Math.PI } );
		w.step( 0.05 );
		d.stagger( V( 0, 0, - 1 ), 1.4 );
		if ( d.down ) floored ++;
	}
	ok( floored > 4 && floored < 18, `a shove floors about half (${floored}/20)` );
	w.dispose();
}
{
	// shot legs: it drops and crawls on
	const w = await makeWorld();
	quiet( w );
	const a = w.zombie( 'civilian', V( 0, GROUND, - 8 ), { yaw: Math.PI } );
	a.maxHealth = a.health = 100;
	w.step( 0.2 );
	for ( let i = 0; i < 3; i ++ ) { a.damage( 24, { kind: 'bullet', zone: 'leg', dir: V( 0, 0, - 1 ), point: a.pos.clone() } ); w.step( 0.3 ); }
	w.step( 8, 1 / 30, () => a.body.mode === 'crawl' );
	ok( a.alive && a.body.mode === 'crawl', `ruined legs make a crawler (${a.body.mode})` );
	const d0 = dist2( a.pos, w.g.player.pos );
	w.step( 6 );
	ok( dist2( a.pos, w.g.player.pos ) < d0 - 1, 'and it drags itself on' );
	ok( a.height < 1, 'low to the ground' );
	w.dispose();
}
{
	// death: a ragdoll that settles on the ground and stays a searchable body
	const w = await makeWorld();
	const a = w.zombie( 'police', V( 0, GROUND, - 2.2 ), { yaw: Math.PI } );
	w.step( 0.2 );
	a.damage( 500, { kind: 'bullet', zone: 'torso', dir: V( 0, 0, - 1 ), point: a.inst.bonePos( 'spine2', V() ), source: w.g.player } );
	ok( ! a.alive && a.body.mode === 'ragdoll', 'dies into a ragdoll' );
	w.step( 9 );
	const pel = a.inst.bonePos( 'pelvis', V() ), hd = a.inst.bonePos( 'head', V() );
	ok( a.body.asleep, 'the body comes to rest' );
	ok( pel.y < GROUND + 0.35 && hd.y < GROUND + 0.45, `lying on the ground (pelvis ${( pel.y - GROUND ).toFixed( 2 )} m, head ${( hd.y - GROUND ).toFixed( 2 )} m)` );
	ok( pel.y > GROUND + 0.02, 'not sunk into it' );
	ok( a.type === 'corpse', 'counted as a body' );
	w.lookAt( pel );
	const c = w.interact()[ 0 ];
	ok( c && c.label === 'Search' && c.sub === 'Police officer', `prompt "${c?.label} / ${c?.sub}"` );
	c.action();
	const items = w.g.lastContainer?.items;
	ok( Array.isArray( items ) && items.length > 0, `the search opens the body's things (${items?.map( s => s.id ).join( ', ' )})` );
	items.length = Math.max( 0, items.length - 1 );
	const n = items.length;
	w.interact()[ 0 ].action();
	ok( w.g.lastContainer.items === items && items.length === n, 'what was taken stays taken' );
	ok( w.interact()[ 0 ] === c, 'the prompt object is reused (no garbage each frame)' );
	w.dispose();
}
{
	// helmets turn some pistol rounds; rifle rounds go through
	const w = await makeWorld( { avatars: [ 'm_army1' ] } );
	let lived = 0, riflesLived = 0;
	for ( let i = 0; i < 30; i ++ ) {
		const z = w.zombie( 'military', V( i * 2, GROUND, - 10 ), { avatar: 'm_army1' } );
		z.damage( 30 * 4, { kind: 'bullet', zone: 'head', dir: V( 0, 0, - 1 ) } );
		if ( z.alive ) lived ++;
		const y = w.zombie( 'military', V( i * 2, GROUND, - 14 ), { avatar: 'm_army1' } );
		y.damage( 40 * 4, { kind: 'bullet', zone: 'head', dir: V( 0, 0, - 1 ) } );
		if ( y.alive ) riflesLived ++;
	}
	ok( lived > 6 && lived < 24, `a soldier's helmet stops some pistol rounds (${lived}/30)` );
	ok( riflesLived === 0, 'but not rifle rounds' );
	w.dispose();
}

{
	// a feeder kneels at a body that is already lying at rest when it is spawned (out of sight)
	const w = await makeWorld();
	const n0 = w.g.creatures.zombies.length;
	w.g.creatures._spawnFeeding( V( 0, GROUND, - 20 ), 'civilian' );
	const zs = w.g.creatures.zombies.slice( n0 );
	const v = zs.find( z => z.victim ), f = zs.find( z => z.state === 'feed' );
	const p = v?.body.rag.p;
	ok( v && f && v.type === 'corpse' && ! v.alive, 'a feeding scene: a body and one eating it' );
	ok( p && Math.max( p[ 12 * 3 + 1 ], p[ 15 * 3 + 1 ] ) < GROUND + 0.3 && p[ 1 ] < GROUND + 0.35, 'the body already lies flat' );
	ok( p && Math.hypot( f.pos.x - p[ 3 ], f.pos.z - p[ 5 ] ) < 0.9 && f.body.action?.kind === 'eat', 'the feeder kneels at its chest' );
	w.dispose();
}

// ---- doors, walls, corners ---------------------------------------------------------------------------------------
console.log( 'doors and walls' );
{
	// the player inside a room with a closed door; a zombie outside that saw them breaks in
	const walls = [ [ 0, 4, 4, 0.15 ], [ - 4, 0, 0.15, 4 ], [ 4, 0, 0.15, 4 ], [ - 2.5, - 4, 1.5, 0.15 ], [ 2.5, - 4, 1.5, 0.15 ] ];
	const w = await makeWorld( { walls, door: [ 0, - 4, 1, 0.08 ], doorHp: 40 } );
	quiet( w );
	const a = w.zombie( 'civilian', V( 0.3, GROUND, - 10 ), { yaw: Math.PI } );
	a.target = w.g.player; a.lastSeen.copy( w.g.player.pos ); a.lastSeenT = w.g.creatures.time; a._setState( 'chase' );
	let brokeAt = - 1;
	const t = w.step( 40, 1 / 30, ( tt ) => {
		if ( brokeAt < 0 && w.g.door.broken ) brokeAt = tt;
		return w.log.some( e => e[ 0 ] === 'hurt' );
	} );
	ok( w.count( 'bash' ) >= 2, `it pounds on the door (${w.count( 'bash' )} blows)` );
	ok( w.g.door.broken, 'the door gives way' );
	ok( w.log.some( e => e[ 0 ] === 'hurt' ), `and it gets in (${t.toFixed( 1 )} s)` );
	const after = w.log.slice( w.log.findIndex( e => e[ 0 ] === 'door broken' ) ).filter( e => e[ 0 ] === 'bash' ).length;
	ok( after === 0, 'no pounding on a broken door' );
	ok( a.state !== 'bash' && a.body.action?.kind !== 'bash', 'and the pounding stops' );
	w.dispose();
}
{
	// a shot inside a closed house brings one outside to break the door
	const walls = [ [ 0, 4, 4, 0.15 ], [ - 4, 0, 0.15, 4 ], [ 4, 0, 0.15, 4 ], [ - 2.5, - 4, 1.5, 0.15 ], [ 2.5, - 4, 1.5, 0.15 ] ];
	const w = await makeWorld( { walls, door: [ 0, - 4, 1, 0.08 ], doorHp: 30 } );
	const a = w.zombie( 'civilian', V( 0.5, GROUND, - 14 ), { yaw: 0 } );
	w.g.player.stance = 'prone';
	w.noise( V( 0, GROUND, 1 ), 300, 'gunshot' );
	w.step( 40, 1 / 30, () => w.g.door.broken );
	ok( w.g.door.broken, `a gunshot indoors gets the door broken down (${w.count( 'bash' )} blows)` );
	w.dispose();
}
{
	// the player opens the door mid-bash: it stops pounding and comes through
	const walls = [ [ 0, 4, 4, 0.15 ], [ - 4, 0, 0.15, 4 ], [ 4, 0, 0.15, 4 ], [ - 2.5, - 4, 1.5, 0.15 ], [ 2.5, - 4, 1.5, 0.15 ] ];
	const w = await makeWorld( { walls, door: [ 0, - 4, 1, 0.08 ], doorHp: 1000 } );
	quiet( w );
	const a = w.zombie( 'civilian', V( 0.3, GROUND, - 9 ), { yaw: Math.PI } );
	a.target = w.g.player; a.lastSeen.copy( w.g.player.pos ); a.lastSeenT = w.g.creatures.time; a._setState( 'chase' );
	w.step( 20, 1 / 30, () => a.state === 'bash' );
	ok( a.state === 'bash', 'pounding on a strong door' );
	w.g.door.open();
	const n0 = w.count( 'bash' );
	w.step( 12, 1 / 30, () => w.log.some( e => e[ 0 ] === 'hurt' ) );
	ok( w.count( 'bash' ) === n0 && w.log.some( e => e[ 0 ] === 'hurt' ), 'the door opened: in it comes' );
	w.dispose();
}
{
	// round a long wall and a building corner to the player, never through them
	const walls = [ [ 0, - 10, 14, 0.3 ], [ 9, - 3, 0.3, 4 ], [ 5, 1, 4, 0.3 ] ];
	const w = await makeWorld( { walls } );
	quiet( w );
	const a = w.zombie( 'civilian', V( 2, GROUND, - 22 ), { yaw: Math.PI } );
	a.target = w.g.player; a.lastSeen.copy( w.g.player.pos ); a.lastSeenT = w.g.creatures.time; a._setState( 'chase' );
	let inside = false;
	const P = w.g.physics, probe = V();
	const t = w.step( 40, 1 / 30, () => {
		probe.copy( a.pos );
		if ( P.resolveCylinder( probe, 0.2, 1.7, 0.45 ) && probe.distanceTo( a.pos ) > 0.12 ) inside = true;
		// keep it hunting (the player hides behind the wall)
		a.lastSeenT = w.g.creatures.time;
		return w.log.some( e => e[ 0 ] === 'hurt' );
	} );
	ok( w.log.some( e => e[ 0 ] === 'hurt' ), `round the wall to the player (${t.toFixed( 1 )} s)` );
	ok( ! inside, 'never inside a wall' );
	// a crowd round an L-shaped corner does not jam
	const b = [];
	for ( let i = 0; i < 6; i ++ ) {
		const z = w.zombie( 'civilian', V( 12 + ( i % 3 ) * 1.2, GROUND, - 4 + Math.floor( i / 3 ) * 1.2 ), { yaw: 0 } );
		z.target = w.g.player; z.lastSeen.copy( w.g.player.pos ); z.lastSeenT = w.g.creatures.time; z._setState( 'chase' );
		b.push( z );
	}
	w.g.player.pos.set( 2, GROUND, - 4 );
	w.step( 30, 1 / 30, () => { for ( const z of b ) z.lastSeenT = w.g.creatures.time; } );
	const close = b.filter( z => dist2( z.pos, w.g.player.pos ) < 4 ).length;
	ok( close >= 5, `a crowd gets round a corner (${close}/6 arrived)` );
	w.dispose();
}

// ---- vehicles ---------------------------------------------------------------------------------------------------
console.log( 'vehicles' );
{
	const w = await makeWorld();
	quiet( w );
	const hits = [];
	const car = { pos: V( 0, GROUND, 0 ), yaw: 0, size: V( 1.8, 1.5, 4.4 ), bounds: new THREE.Box3( V( - 0.9, 0, - 2.2 ), V( 0.9, 1.5, 2.2 ) ), spec: { kind: 'car' }, damage: ( a, info ) => hits.push( info.kind ) };
	w.g.vehicles = { driving: car, handlesImpacts: true };
	w.g.player.vehicle = { vehicle: car };
	const a = w.zombie( 'civilian', V( 6, GROUND, 0 ), { yaw: face( V( 6, 0, 0 ), V( 0, 0, 0 ) ) } );
	w.step( 12, 1 / 30, () => hits.length >= 2 );
	ok( hits.length >= 2 && hits.every( k => k === 'zombie' ), `they claw at the car (${hits.length})` );
	ok( ! w.log.some( e => e[ 0 ] === 'hurt' ), 'the driver of a closed car is not hurt' );
	ok( dist2( a.pos, car.pos ) < 2.4, `from beside the body (${dist2( a.pos, car.pos ).toFixed( 2 )} m from its centre)` );
	car.spec = { kind: 'bike', open: true };
	w.step( 8, 1 / 30, () => w.log.some( e => e[ 0 ] === 'hurt' ) );
	ok( w.log.some( e => e[ 0 ] === 'hurt' ), 'a rider on a motorbike is in reach' );
	// run-overs are the vehicles module's (it reports handlesImpacts): no damage here from a car passing through
	car.spec = { kind: 'car' };
	car.speed = 12;
	const hitsBefore = a.health;
	a.pos.set( 0, GROUND, - 2.3 );
	w.step( 0.2 );
	ok( a.health === hitsBefore || a.health > hitsBefore - 1, 'no ram damage of our own while the vehicles module handles it' );
	// a vehicles module that leaves it to us: one hit, counted once
	w.g.vehicles.handlesImpacts = false;
	let kills = 0, dmgs = 0;
	w.g.events.on( 'kill', ( e ) => { if ( e.target === a ) kills ++; } );
	w.g.events.on( 'damage', ( e ) => { if ( e.target === a && e.kind === 'vehicle' ) dmgs ++; } );
	a.pos.set( 0, GROUND, - 2.3 );
	w.step( 0.5 );
	ok( dmgs === 1 && ( a.alive || kills === 1 ), `run over once (${dmgs} hit, ${kills} kill)` );
	w.dispose();
}

// ---- population -----------------------------------------------------------------------------------------------
console.log( 'population' );
{
	const w = await makeWorld( { noPopulate: false, avatars: [ 'm_casual2', 'f_casual2', 'm_tourist1', 'm_police1' ] } );
	const mgr = w.g.creatures;
	w.g.player.pos.set( 20, GROUND, 20 );
	let minD = 1e9, seenSpawn = 0;
	const known = new Set();
	w.step( 30, 1 / 20, () => {
		for ( const z of mgr.zombies ) if ( ! known.has( z ) ) {
			known.add( z );
			minD = Math.min( minD, dist2( z.pos, w.g.player.pos ) );
			if ( mgr._inView( z.pos ) && dist2( z.pos, w.g.player.pos ) < 40 ) seenSpawn ++;
		}
	} );
	const alive = mgr.zombieApi.count();
	ok( mgr.target > 20, `a town wants a crowd (${mgr.target})` );
	ok( alive >= Math.min( mgr.target, 20 ), `and gets one (${alive})` );
	ok( minD >= 44, `spawned out of reach (closest ${minD.toFixed( 0 )} m)` );
	ok( seenSpawn === 0, 'never popping up in view' );
	ok( alive <= mgr.cap + 10, 'within the cap' );
	const kinds = new Set( mgr.zombies.map( z => z.kind ) );
	ok( kinds.size >= 3, `a mix of kinds (${[ ...kinds ].join( ' ' )})` );
	ok( mgr.zombies.some( z => z.state === 'dormant' || z.state === 'feed' || z.victim ), 'some lie dormant or feed' );
	// kills thin the area
	const t0 = mgr.target;
	for ( let i = 0; i < 60; i ++ ) mgr.pop.addKill( 20 + ( i % 5 ) * 30 - 60, 20 + Math.floor( i / 5 ) * 20 - 100, w.g.time.hours );
	w.step( 1.5, 1 / 20 );
	ok( mgr.target < t0, `kills lower the local population (${t0} -> ${mgr.target})` );
	// far away: despawned (the population keeps no count of them)
	for ( let k = 0; k < 30; k ++ ) { w.g.player.pos.x += 15; w.step( 0.6, 1 / 20 ); }
	ok( mgr.zombies.every( z => z.removed || ! z.alive || dist2( z.pos, w.g.player.pos ) < 310 ), 'the far ones are despawned' );
	// save round trip
	const save = { world: {} };
	mgr.serialize( save );
	const w2 = await makeWorld();
	w2.g.creatures.load( JSON.parse( JSON.stringify( save ) ) );
	const h = w.g.time.hours;
	ok( Math.abs( w2.g.creatures.pop.killFactor( 20, 20, h ) - mgr.pop.killFactor( 20, 20, h ) ) < 0.02, 'kill counts survive a save and load' );
	w2.dispose();
	// dispose: nothing left on the scene or in the library
	w.dispose();
	ok( mgr.lib.templates.size === 0 && mgr.zombies.length === 0, 'dispose empties the character library' );
	let left = 0; w.scene.traverse( o => { if ( o.isSkinnedMesh ) left ++; } );
	ok( left === 0, `and the scene (${left} skinned meshes left)` );
}

// ---- animals ----------------------------------------------------------------------------------------------------
console.log( 'animals' );
{
	const w = await makeWorld( { sea: 60 } );
	quiet( w );
	const A = w.g.creatures.animals;
	// a boar charges and gores
	const boar = A.spawn( 'boar', V( 0, GROUND, - 12 ) );
	boar.aggressive = true;
	w.step( 8, 1 / 30, () => w.log.some( e => e[ 0 ] === 'hurt' && e[ 1 ] === 'animal' ) );
	ok( w.log.some( e => e[ 0 ] === 'hurt' && e[ 1 ] === 'animal' ), 'an angry boar charges and gores' );
	// deer bolt
	const deer = A.spawn( 'deer', V( 20, GROUND, 0 ) );
	w.g.player.pos.set( 8, GROUND, 0 );
	w.step( 3 );
	ok( deer.state === 'flee' && dist2( deer.pos, w.g.player.pos ) > 18, `a deer bolts (${dist2( deer.pos, w.g.player.pos ).toFixed( 0 )} m)` );
	// sharks: never on land, attack swimmers in deep water
	ok( w.g.spawnables.shark.spawn( V( - 100, GROUND, 0 ), {} ) === null, 'no shark on dry land' );
	w.g.player.pos.set( 100, - 0.5, 0 ); w.g.player.swimming = true;
	const sh = w.g.spawnables.shark.spawn( V( 100, 0, 8 ), {} );
	ok( sh && w.g.hf.heightAt( sh.pos.x, sh.pos.z ) < - 4, 'a shark in deep water' );
	sh.stateT = 30; sh._set( 'attack' );
	w.step( 10, 1 / 30, () => w.log.some( e => e[ 0 ] === 'hurt' && e[ 1 ] === 'animal' && e.length ) && w.log.filter( e => e[ 0 ] === 'hurt' ).length >= 2 );
	ok( w.log.filter( e => e[ 0 ] === 'hurt' ).length >= 2, 'it bites the swimmer' );
	ok( w.g.hf.heightAt( sh.pos.x, sh.pos.z ) < - 2, 'and stays in deep water' );
	const shore = w.g.spawnables.shark.spawn( V( 40, GROUND, 0 ), {} );
	ok( shore && shore.pos.x > 60, 'summoned from the beach it appears offshore' );
	// butchering
	w.g.player.pos.set( 0, GROUND, 0 ); w.g.player.swimming = false;
	const goat = A.spawn( 'goat', V( 0, GROUND, - 2 ) );
	goat.damage( 500, { kind: 'bullet', zone: 'torso' } );
	w.step( 2 );
	w.lookAt( goat.centre( V() ) );
	const p = w.interact()[ 0 ];
	ok( p && p.label === 'Butcher' && p.sub === 'Goat', `prompt "${p?.label} / ${p?.sub}"` );
	p.action();
	ok( w.log.some( e => e[ 0 ] === 'item' && e[ 1 ] === 'raw_goat' ), 'butchering gives meat' );
	w.dispose();
}

// ---- bandits ------------------------------------------------------------------------------------------------------
console.log( 'bandits' );
{
	const w = await makeWorld( { avatars: [ 'm_casual2', 'm_casual3' ] } );
	quiet( w );
	let shots = 0;
	w.g.events.on( 'noise', ( e ) => { if ( e.kind === 'gunshot' && e.source?.type === 'npc' ) shots ++; } );
	const B = w.g.creatures.bandits;
	const b = B.spawn( V( 0, GROUND, - 30 ), { yaw: Math.PI, weapon: 'akm' } );
	w.step( 15 );
	const hurt = w.log.filter( e => e[ 0 ] === 'hurt' && e[ 1 ] === 'bullet' ).length;
	ok( shots >= 4, `a bandit opens fire (${shots} shots)` );
	ok( hurt >= 1 && hurt < shots, `and hits now and then (${hurt}/${shots})` );
	b.damage( 500, { kind: 'bullet', zone: 'torso', dir: V( 0, 0, - 1 ), source: w.g.player } );
	const loot = b.lootItems().map( s => s.id );
	ok( loot.includes( 'akm' ), `the body gives up its gun (${loot.join( ', ' )})` );
	ok( loot.some( id => id.startsWith( 'ammo_' ) ), 'and ammunition' );
	w.dispose();
}

// ---- summons, difficulty -------------------------------------------------------------------------------------------
console.log( 'summons' );
{
	const w = await makeWorld( { sea: 30 } );
	const names = [ 'zombie', 'zombie_runner', 'zombie_police', 'zombie_military', 'zombie_crawler', 'zombie_brute', 'zombie_civilian', 'zombie_tourist', 'zombie_medic',
		'zombie_firefighter', 'zombie_horde', 'boar', 'chicken', 'goat', 'deer', 'cow', 'nene', 'shark', 'turtle', 'bandit', 'bandit_group' ];
	const made = {};
	for ( const n of names ) {
		ok( !! w.g.spawnables[ n ], `/summon ${n}` );
		let r = null;
		try { r = w.g.spawnables[ n ]?.spawn( V( 0, GROUND, - 6 ), { yaw: 0, summoned: true } ); } catch ( e ) { ok( false, `${n} throws ${e.message}` ); }
		made[ n ] = r;
	}
	const resolve = async ( r ) => Array.isArray( r ) ? Promise.all( r.map( resolve ) ) : await r;
	for ( const n of names ) made[ n ] = await resolve( made[ n ] );
	const one = ( r ) => Array.isArray( r ) ? r.flat( 3 ).filter( Boolean ) : r ? [ r ] : [];
	for ( const n of names ) ok( one( made[ n ] ).length > 0, `${n} spawns (${one( made[ n ] ).map( e => e.kind || e.species || e.type ).slice( 0, 3 ).join( ' ' )})` );
	ok( one( made.zombie_horde ).length === 15, 'a horde of 15' );
	ok( one( made.bandit_group ).length === 3, 'a group of 3 bandits' );
	ok( one( made.zombie_crawler )[ 0 ].body.mode === 'crawl', 'the crawler crawls' );
	ok( one( made.zombie_brute )[ 0 ].health > 300, 'the brute is tough' );
	ok( one( made.zombie_runner )[ 0 ].chaseV > 4.4, 'the runner is fast' );
	w.dispose();
	// difficulty is read live
	const w2 = await makeWorld();
	const z = w2.zombie( 'civilian', V( 0, GROUND, - 30 ), { yaw: Math.PI } );
	z.target = w2.g.player; z.lastSeen.copy( w2.g.player.pos ); z.lastSeenT = w2.g.creatures.time; z._setState( 'chase' );
	w2.step( 0.5 );
	const vN = z.wantV;
	w2.g.difficulty = 'hard';
	w2.step( 0.5 );
	ok( vN > 1 && z.wantV > vN * 1.08, `/difficulty hard makes them faster at once (${vN.toFixed( 2 )} -> ${z.wantV.toFixed( 2 )})` );
	w2.dispose();
}

// ---- per-frame cost ----------------------------------------------------------------------------------------------
console.log( 'cost' );
{
	for ( const N of [ 30, 60 ] ) {
		const w = await makeWorld( { avatars: [ 'm_casual2', 'f_casual2', 'm_tourist1', 'm_casual1' ], walls: [ [ 0, - 20, 8, 0.3 ], [ 15, 5, 0.3, 6 ] ] } );
		w.g.survival.hurt = () => {};
		const ids = w.g.creatures.lib.loadedIds();
		for ( let i = 0; i < N; i ++ ) {
			const a = i / N * Math.PI * 2, r = 12 + ( i % 5 ) * 6;
			w.zombie( 'civilian', V( Math.cos( a ) * r, GROUND, Math.sin( a ) * r ), { avatar: ids[ i % ids.length ], yaw: a } );
		}
		let t = 0;
		const walk = () => { t += 1 / 60; w.g.player.pos.set( Math.cos( t * 0.2 ) * 4, GROUND, Math.sin( t * 0.2 ) * 4 ); };
		w.step( 10, 1 / 60, walk );
		const T = [];
		for ( let k = 0; k < 400; k ++ ) { const a = performance.now(); w.step( 1 / 60, 1 / 60, walk ); T.push( performance.now() - a ); }
		T.sort( ( a, b ) => a - b );
		const med = T[ 200 ], p95 = T[ 380 ];
		console.log( `  ${N} infected close by: ${med.toFixed( 2 )} ms median, ${p95.toFixed( 2 )} ms p95 (AI, animation and matrices, no drawing)` );
		ok( med < ( N === 30 ? 3 : 6 ), `${N} infected cost ${med.toFixed( 2 )} ms a frame` );
		w.dispose();
	}
}

console.log( `${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
