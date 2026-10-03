// The leisure domain's right-click verbs (hooks.js addUseActions). Node-safe (three.js only for vectors).
//   keepsakes: Admire (Shake a snow globe), once a game day, more with a collection (admire.js); a gold coin Flips
//   toys and games (def.toy): Play solitaire, koi-koi, kōnane, the harmonica, a yo-yo, a handheld game (drains its AA
//     cells); Hug a plush; Solve / Scramble a puzzle cube; Roll dice; the songbook adds "Play songs" to the ukulele
//     and the harmonica
//   vices: Smoke a cigarette or cigar (needs a lighter, matches or a fire: one use of the light, a flick and a cough
//     the infected can hear close by), Vape (charge and juice), Chew; Open a carton into packs
//   the shore: Surf, Bodyboard (only at the water's edge or in the shallows: a game hour passes, big lift, tiring)
//   throwing: a frisbee or a ball sails ahead and lands with a clatter the infected go to look at
//   seasonal: Pop a party popper (loud), Put on a glow bracelet (a weak light for hours)
//   the travel guide: Mark sights (the nearest fruit stand and beach camp on the map)
import * as THREE from 'three';
import { addUseActions } from '../../hooks.js';
import { getItem } from '../../ItemDB.js';
import { playItemSound } from '../../sounds.js';
import { SMOKE, VAPE_TANK, vapeJuice, REPEAT, RIDE, THROW, atShore, landDist, diceText, coinText } from './logic.js';
import { admire, admireSpec } from './admire.js';
import { ensureLeisSound, playLeisSound } from './sounds.js';

// the ukulele has no `fun` of its own (ItemUse's Play falls back to this); songs lift it more
export const UKE_FUN = { boredom: - 20, unhappy: - 8, stress: - 5 };
export const SONG_K = 1.6;
const SMOKE_KEY = { id: 'smoke', fun: null };
const THROW_FUN = { id: 'throw', fun: { boredom: - 3 } };
const FLIP_FUN = { id: 'flip', fun: { boredom: - 1 } };
const DOUBLE_SIX = { unhappy: - 3 };

const noise = ( g, pos, radius, kind ) => {
	if ( radius > 0 ) g.events?.emit?.( 'noise', { pos: pos.clone ? pos.clone() : new THREE.Vector3( pos.x, pos.y, pos.z ), radius, source: g.player, kind } );
};
const say = ( g, text, kind = 'warn' ) => { g.toast( text, kind ); return false; };
// one of our sounds rendered before the action plays it (item sounds are ItemUse.timed's own)
const ready = ( g, name ) => { if ( name ) ensureLeisSound( g.audio, name ); return name || null; };
const give = ( g, id, n ) => g.combine?.give ? g.combine.give( id, n ) : g.itemUse.give( id, n );

// ---- toys and games -------------------------------------------------------------------------------------------------

export function play( g, stack, def ) {
	const U = g.itemUse, T = def.toy, p = g.player;
	if ( p.swimming || p.underwater ) return say( g, 'Not now' );
	if ( T.light && ! U.canSee() ) return say( g, 'Too dark' );
	if ( T.calm && U.danger() ) return say( g, 'Not now' );
	if ( T.charge && ! ( ( stack.data.charge ?? 0 ) >= T.charge * 0.5 ) && g.mode !== 'creative' ) return say( g, 'Batteries dead' );
	if ( T.noise ) noise( g, p.pos, T.noise, def.id );
	U.timed( T.gerund || `Playing ${def.name}`, T.time, ready( g, T.sound ), () => {
		if ( ! U.exists( stack ) ) return;
		if ( T.charge ) { U.drain( stack, T.charge ); U.changed( U.where( stack ) ); }
		U.applyFun( def, 1, { repeat: T.repeat ?? REPEAT.toy } );
	}, { cancelOnMove: ! T.move } );
	return true;
}

// the songbook's songs on an instrument: longer, louder for longer, and better than strumming
export function playSongs( g, stack, def ) {
	const U = g.itemUse, p = g.player, uke = def.id === 'ukulele';
	if ( p.swimming || p.underwater ) return say( g, 'Not now' );
	const sound = uke ? 'strum' : 'leis_harmonica', radius = uke ? 45 : ( def.toy?.noise || 30 );
	noise( g, p.pos, radius, def.id );
	const act = U.timed( 'Playing songs', 12, ready( g, sound ), () => {
		if ( ! U.exists( stack ) ) return;
		U.applyFun( def, SONG_K, { repeat: REPEAT.toy, fallback: UKE_FUN } );
	} );
	// a few more bars while it lasts
	for ( let t = 3; t < 12; t += 3 ) setTimeout( () => { if ( g.actions.current === act ) { if ( uke ) playItemSound( g, sound, { vol: 0.8 } ); else playLeisSound( g, sound ); } }, t * 1000 );
	return true;
}

// a puzzle cube: solving takes a while, scrambling a moment
export function solve( g, stack, def ) {
	const U = g.itemUse;
	if ( ! U.canSee() ) return say( g, 'Too dark' );
	U.timed( 'Solving', def.puzzle.time, null, () => {
		if ( ! U.exists( stack ) ) return;
		stack.data.solved = true;
		U.changed( U.where( stack ) );
		U.applyFun( def, 1, { repeat: REPEAT.game } );
		g.toast( 'Solved', 'good' );
	} );
	return true;
}

export function rollDice( g, def, rnd = Math.random ) {
	const a = 1 + Math.floor( rnd() * 6 ), b = 1 + Math.floor( rnd() * 6 );
	playLeisSound( g, 'leis_dice' );
	g.toast( diceText( a, b ), 'info' );
	g.itemUse.applyFun( def, 1, { repeat: 30 } );
	if ( a === 6 && b === 6 ) g.survival?.mood?.( DOUBLE_SIX );
	return [ a, b ];
}

// ---- vices ----------------------------------------------------------------------------------------------------------------

// a light for a smoke: a lit fire close by, else a lighter or matches with a use left (null: none)
export function lightFor( g ) {
	if ( g.nearFire?.( g.player.pos ) ) return { fire: true };
	const src = g.itemUse.fireSource();
	return src ? { src } : null;
}

export function smoke( g, stack, def, light = null ) {
	const U = g.itemUse, p = g.player, k = SMOKE[ def.smoke ];
	if ( ! k ) return false;
	if ( p.swimming || p.underwater ) return say( g, 'Not now' );
	const L = light ? { src: light } : lightFor( g );
	if ( ! L ) return say( g, 'Need a lighter or matches' );
	playItemSound( g, 'strike', { vol: 0.5 } );
	noise( g, p.pos, k.noise, 'smoke' );
	U.timed( def.smoke === 'cigar' ? 'Smoking cigar' : 'Smoking', k.time, null, () => {
		if ( ! U.exists( stack ) ) return;
		if ( L.src && U.exists( L.src ) ) U.useUp( L.src );
		if ( def.tool?.uses ) U.useUp( stack ); else U.consumeOne( stack );
		SMOKE_KEY.fun = k.fun;
		U.applyFun( SMOKE_KEY, 1, { repeat: REPEAT.smoke } );
		g.survival?.useStamina?.( k.stamina );
		playLeisSound( g, 'leis_exhale' );
	} );
	return true;
}

export function vape( g, stack ) {
	const U = g.itemUse, p = g.player, k = SMOKE.vape;
	if ( p.swimming || p.underwater ) return say( g, 'Not now' );
	if ( vapeJuice( stack ) <= 0 ) return say( g, 'Tank empty' );
	if ( ( stack.data.charge ?? 0 ) < k.charge && g.mode !== 'creative' ) return say( g, 'Battery flat' );
	U.timed( 'Vaping', k.time, ready( g, 'leis_exhale' ), () => {
		if ( ! U.exists( stack ) ) return;
		stack.data.juice = vapeJuice( stack ) - 1;
		U.drain( stack, k.charge );
		U.changed( U.where( stack ) );
		SMOKE_KEY.fun = k.fun;
		U.applyFun( SMOKE_KEY, 1, { repeat: REPEAT.smoke } );
	} );
	return true;
}

export function chew( g, stack ) {
	const U = g.itemUse, k = SMOKE.chew;
	U.timed( 'Chewing', k.time, null, () => {
		if ( ! U.exists( stack ) ) return;
		U.useUp( stack );
		SMOKE_KEY.fun = k.fun;
		U.applyFun( SMOKE_KEY, 1, { repeat: REPEAT.smoke } );
	} );
	return true;
}

// ---- the shore ---------------------------------------------------------------------------------------------------------------

export function ride( g, stack, def ) {
	const U = g.itemUse, S = g.survival, R = RIDE[ def.ride ];
	if ( ! R ) return false;
	if ( ! atShore( g ) ) return say( g, 'At the shore only' );
	if ( ! U.canSee() ) return say( g, 'Too dark' );
	if ( U.danger() ) return say( g, 'Not now' );
	if ( ( S?.stamina ?? 100 ) < R.stamina * 0.5 && g.mode !== 'creative' ) return say( g, 'Too tired' );
	const fun = { id: 'ride', fun: R.fun };
	U.timed( R.gerund, R.time, 'splash', () => {
		if ( ! U.exists( stack ) ) return;
		// a session in the waves: an hour goes by (as reading passes time)
		if ( ! g.timeFrozen && g.time ) { g.time.hours += R.hours; S?.passTime?.( R.hours ); }
		S?.useStamina?.( R.stamina );
		if ( S && 'wet' in S ) S.wet = 1;
		U.applyFun( fun, 1, { repeat: REPEAT.ride } );
		U.wear( stack, R.wear );
		U.changed( U.where( stack ) );
		noise( g, g.player.pos, R.noise, 'splash' );
	}, { cancelOnMove: false } );
	return true;
}

// ---- throwing a toy ----------------------------------------------------------------------------------------------------------

const _dir = new THREE.Vector3(), _eye = new THREE.Vector3();
// throw one ahead: it lands where the throw ends or short of what it hits; the infected hear it land
export function throwToy( g, stack, def ) {
	const U = g.itemUse, p = g.player, T = THROW[ def.throwToy ];
	if ( ! T ) return null;
	if ( p.vehicle || p.swimming ) return say( g, 'Not now' ) || null;
	_dir.set( - Math.sin( p.yaw ), 0, - Math.cos( p.yaw ) );
	_eye.set( p.pos.x, ( p.eye ?? p.pos.y + 1.6 ) - 0.2, p.pos.z );
	const hit = g.physics?.raycast?.( _eye, _dir, T.dist );
	const d = landDist( T.dist, hit?.t );
	const at = new THREE.Vector3( _eye.x + _dir.x * d, _eye.y, _eye.z + _dir.z * d );
	const ground = g.physics?.ground ? g.physics.ground( at.x, at.z, at.y, 0.1, 0 ).y : ( g.hf?.heightAt?.( at.x, at.z ) ?? p.pos.y );
	const one = stack.qty > 1 ? U.splitOne( stack ) : stack;
	U.discard( one );
	at.y = Math.max( ground, Math.min( at.y, ground + 1.2 ) );
	const it = g.items3d?.spawn?.( one, at, { persistent: true, settle: true } ) || null;
	if ( ! it ) g.dropStack?.( one, at );
	playLeisSound( g, 'leis_whoosh' );
	setTimeout( () => g.audio?.play?.( 'drop', { pos: at, vol: 0.6 } ), T.delay * 1000 );
	at.y = ground;
	noise( g, at, T.noise, 'thud' );
	if ( ! U.danger() ) U.applyFun( THROW_FUN, 1, { repeat: 20 } );
	return at;
}

// ---- the menu -----------------------------------------------------------------------------------------------------------------

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, U = ctx.use;
	if ( ! g || ! U ) return;
	const t = def.tool;

	// keepsakes
	// (the double-click default for a keepsake; a watch keeps Check time first)
	const A = admireSpec( def );
	if ( A ) ( t ? ctx.add : ctx.first )( A.verb, () => admire( g, stack, def ) );
	if ( def.flip ) ctx.add( 'Flip', () => {
		playLeisSound( g, 'leis_coin' );
		g.toast( coinText( Math.random() ), 'info' );
		U.applyFun( FLIP_FUN, 1, { repeat: 30 } );
	} );

	// toys and games
	if ( def.toy ) ctx.first( def.toy.verb || 'Play', () => play( g, stack, def ) );
	if ( ( def.id === 'ukulele' || def.toy?.songs ) && U.knowledge?.songs ) ctx.add( 'Play songs', () => playSongs( g, stack, def ) );
	if ( def.puzzle ) {
		if ( stack.data.solved ) ctx.add( 'Scramble', () => { stack.data.solved = false; U.changed( U.where( stack ) ); playItemSound( g, 'click', { vol: 0.4 } ); } );
		else ctx.first( 'Solve', () => solve( g, stack, def ) );
	}
	if ( def.dice ) ctx.first( 'Roll', () => rollDice( g, def ) );
	if ( def.throwToy ) ctx.add( 'Throw', () => { if ( g.app?.ui?.closeScreen ) g.app.ui.closeScreen(); throwToy( g, stack, def ); } );
	if ( def.ride ) ctx.first( RIDE[ def.ride ].verb, () => ride( g, stack, def ) );

	// vices
	// (a lighter dragged onto it is the same smoke: leis_light_up, left out of its Combine list)
	if ( def.smoke ) ctx.first( 'Smoke', () => smoke( g, stack, def ), [ t?.uses ? `${U.usesLeft( stack )}/${t.uses}` : null ], [ 'leis_light_up' ] );
	if ( t?.kind === 'vape' ) ctx.first( 'Vape', () => vape( g, stack ), [ `${vapeJuice( stack )}/${VAPE_TANK}` ] );
	if ( t?.kind === 'chew' ) ctx.first( 'Chew', () => chew( g, stack ), [ `${U.usesLeft( stack )}/${t.uses}` ] );
	if ( def.unbox ) ctx.first( 'Open', () => U.timed( 'Opening', 2, 'unwrap', () => {
		if ( ! U.exists( stack ) ) return;
		U.consumeOne( stack );
		give( g, def.unbox[ 0 ], def.unbox[ 1 ] );
	} ) );

	// seasonal
	if ( def.pop ) ctx.first( 'Pop', () => {
		playLeisSound( g, 'leis_pop' );
		noise( g, g.player.pos, def.pop, 'pop' );
		U.applyFun( def, 1, { repeat: 60 } );
		U.consumeOne( stack );
	} );
	if ( def.glow && ! stack.data.on ) ctx.first( 'Put on', () => {
		U.snapChemlight( stack, false );
		U.applyFun( def, 1, { repeat: REPEAT.solo } );
	} );

	// the travel guide's maps
	if ( def.sights && ! stack.data.marked ) ctx.add( 'Mark sights', () => {
		if ( ! U.canSee() ) return say( g, 'Too dark' );
		U.timed( 'Looking up', 5, null, () => {
			if ( ! U.exists( stack ) ) return;
			let n = 0;
			for ( const kind of def.sights ) if ( g.sites?.reveal?.( kind, g.player.pos ) ) n ++;
			stack.data.marked = true;
			U.changed( U.where( stack ) );
			g.toast( n ? 'Marked on map' : 'Nothing nearby', n ? 'good' : 'info' );
		} );
	} );
} );

// for the tests: an item's id -> its first leisure verb, as the menu orders them
export const VERB_OF = ( d ) => d?.toy?.verb || ( d?.toy ? 'Play' : d?.smoke ? 'Smoke' : d?.ride ? RIDE[ d.ride ].verb : admireSpec( d )?.verb || null );
export { getItem };
