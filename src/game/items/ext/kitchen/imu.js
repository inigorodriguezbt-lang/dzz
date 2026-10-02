// `imu`: a Hawaiian earth oven, dug with a shovel ("Dig imu"). Build a fire in the pit with firewood and stones; when
// the stones are hot, lay in food wrapped in ti leaves (a pig's worth of boar meat comes out as kalua pig, laulau
// steam through, taro and ʻulu soften), cover it with earth and leave it: it cooks over game hours, and a shovel digs
// the feast back up. Hot stones left uncovered cool off. Node-safe (the look is set by models/ext/kitchen.js).
import { addPlaceable } from '../../placeables/registry.js';
import { getItem, makeStack, freshness } from '../../ItemDB.js';
import { provides } from '../../util.js';
import { POT_COOKED } from '../../recipes.js';

export const IMU = {
	look: null, // ( stage, { sand, food, stones } ) -> Object3D, set by the model file in the browser
	HEAT_H: 1, // game hours for the stones to heat
	COOL_H: 3, // hot stones left uncovered this long go cold
	COOK_H: 4, // game hours buried
	CAP: 8, // wrapped things it holds
	WOOD: 3, STONES: 3,
};

// what the imu makes of a raw thing: boar becomes kalua pig, anything else with a cooked form gets it
export function imuOut( id ) {
	if ( id === 'raw_boar' ) return 'kalua_pig';
	const d = getItem( id );
	return d?.food?.raw && d.food.cooked && getItem( d.food.cooked ) ? d.food.cooked : null;
}

const shovel = ( g ) => g.player.inventory.find( ( s ) => provides( s, 'dig' ) );
const fireSource = ( g ) => g.itemUse?.fireSource?.() || g.player.inventory.find( ( s, d ) => d?.tool?.kind === 'lighter' || d?.tool?.kind === 'matches' );
const count = ( g, id ) => g.player.inventory.count( id );
const hoursLeft = ( p, g ) => Math.max( 0, ( p.data.until ?? 0 ) - g.time.hours );

// take n of an id from what you carry (loose units first; through itemUse so it works wherever they are)
function take( g, id, n ) {
	const inv = g.player.inventory, U = g.itemUse;
	for ( const s of inv.findAll( ( x ) => x.id === id ) ) {
		while ( n > 0 && s.qty > 0 ) { if ( U?.consumeOne ) U.consumeOne( s ); else { s.qty --; if ( s.qty <= 0 ) inv.remove( s ); } n --; }
		if ( n <= 0 ) break;
	}
	inv.changed();
}

// the raw things you carry that it can cook (one unit each, up to room): not what has gone off, and not rice or eggs,
// which want a pot of water
export function cookable( g, room ) {
	const out = [];
	for ( const s of g.player.inventory.allStacks() ) {
		if ( ! imuOut( s.id ) || POT_COOKED[ s.id ] || s.data?.items?.length || freshness( s ) <= 0 ) continue;
		for ( let i = 0; i < s.qty && out.length < room; i ++ ) out.push( s );
	}
	return out;
}

// what was laid in comes back out raw, aged by the hours it sat there
function takeOut( p, g ) {
	const D = p.data, inv = g.player.inventory, sat = Math.max( 0, g.time.hours - ( D.laid ?? g.time.hours ) );
	for ( const id of D.food ) {
		const s = makeStack( id, 1 );
		if ( ! s ) continue;
		s.data.age = sat;
		if ( inv.add( s ) > 0 ) g.dropStack( s );
	}
	D.food = [];
	inv.changed();
}

const STAGE_SUB = { pit: 'Empty pit', fire: 'Heating stones', hot: 'Hot stones', cooking: 'Cooking', done: 'Ready' };

addPlaceable( 'imu', {
	outdoors: true,
	soft: true,
	place: { time: 10, gerund: 'Digging' },

	model( p, game ) {
		const sand = !! game?.world?.isBeach?.( p.pos.x, p.pos.z );
		const D = p.data || {};
		return IMU.look?.( D.stage || 'pit', { sand, food: ( D.food || [] ).length, stones: ( D.stones || 0 ) > 0 } ) || null;
	},

	onPlace( p ) { p.data = { stage: 'pit', food: [] }; },

	show( p, g ) {
		const M = g.placeables;
		if ( p.data.stage === 'fire' ) M.light( p, { color: 0xff8a3a, intensity: 12, range: 10, flicker: true, lift: 0.3 } );
		else if ( p.data.stage === 'hot' ) M.light( p, { color: 0xff5a1a, intensity: 3, range: 4, flicker: true, lift: 0.15 } );
		else M.light( p, null );
		if ( p.data.stage === 'fire' ) M.loop?.( p, 'fire_loop', 0.5, 5 ); else M.stopLoop?.( p, 'fire_loop' );
	},

	update( p, dt, g ) {
		const D = p.data, h = g.time.hours;
		if ( D.stage === 'fire' && h >= D.t + IMU.HEAT_H ) { D.stage = 'hot'; D.t = h; g.placeables.refresh( p ); }
		// hot stones left uncovered go cold (the stones and anything laid on them stay in the pit)
		else if ( D.stage === 'hot' && h >= D.t + IMU.COOL_H ) { D.stage = 'pit'; g.placeables.refresh( p ); }
		else if ( D.stage === 'cooking' && h >= D.until ) { D.stage = 'done'; D.t = h; g.placeables.refresh( p ); }
	},

	label() { return 'Imu'; },
	sub( p, g ) {
		const D = p.data;
		if ( D.stage === 'cooking' ) { const l = hoursLeft( p, g ); return `Cooking · ${l >= 1 ? Math.ceil( l ) + ' h' : Math.ceil( l * 60 ) + ' min'} left`; }
		if ( D.stage === 'hot' && D.food.length ) return `${D.food.length} wrapped · hot stones`;
		return STAGE_SUB[ D.stage ] || '';
	},

	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		// food laid in and not yet buried can come back out
		if ( ( D.stage === 'pit' || D.stage === 'hot' ) && D.food.length ) A.push( { label: 'Take out food', run: () => M.timed( 'Unwrapping', 3, 'unwrap', () => {
			if ( D.stage !== 'pit' && D.stage !== 'hot' ) return;
			takeOut( p, g );
			M.refresh( p );
		} ) } );
		if ( D.stage === 'pit' && ! D.food.length ) {
			// the stones of a fire gone cold are still in the pit
			const stones = () => Math.max( 0, IMU.STONES - ( D.stones || 0 ) );
			A.push( { label: 'Build fire', run: () => {
				if ( count( g, 'firewood' ) < IMU.WOOD ) { g.toast( `Need ${IMU.WOOD} firewood`, 'warn' ); return; }
				if ( count( g, 'stone' ) < stones() ) { g.toast( `Need ${IMU.STONES} stones`, 'warn' ); return; }
				const src = fireSource( g );
				if ( ! src ) { g.toast( 'Need a lighter or matches', 'warn' ); return; }
				M.timed( 'Building fire', 6, 'hit_wood', () => {
					if ( D.stage !== 'pit' || D.food.length || count( g, 'firewood' ) < IMU.WOOD || count( g, 'stone' ) < stones() ) return;
					take( g, 'firewood', IMU.WOOD );
					take( g, 'stone', stones() );
					g.itemUse?.useUp?.( src );
					D.stage = 'fire'; D.t = g.time.hours; D.stones = IMU.STONES;
					g.skills?.xp?.( 'survival', 2 );
					M.refresh( p );
				} );
			} } );
			if ( shovel( g ) ) A.push( { label: 'Fill in', run: () => M.timed( 'Filling in', 5, 'dig', () => {
				// the stones come back out of the earth
				if ( D.stones > 0 ) { const st = makeStack( 'stone', D.stones ); if ( st && g.player.inventory.add( st ) > 0 ) g.dropStack( st ); }
				M.remove( p, { give: false } );
			} ) } );
		}
		if ( D.stage === 'fire' ) A.push( { label: 'Wait for the stones', run: () => g.toast( 'Stones heating', 'info' ) } );
		if ( D.stage === 'hot' ) {
			const room = IMU.CAP - D.food.length;
			const can = cookable( g, room );
			if ( room > 0 ) A.push( { label: can.length ? `Lay in food (${Math.min( can.length, count( g, 'ti_leaves' ) || can.length )})` : 'Lay in food', run: () => {
				const list = cookable( g, IMU.CAP - D.food.length );
				if ( ! list.length ) { g.toast( 'Nothing raw to cook', 'warn' ); return; }
				const leaves = count( g, 'ti_leaves' );
				if ( ! leaves ) { g.toast( 'Need ti leaves to wrap it', 'warn' ); return; }
				const n = Math.min( list.length, leaves );
				M.timed( 'Wrapping food', 3 + n, 'unwrap', () => {
					if ( D.stage !== 'hot' ) return;
					let done = 0;
					for ( const s of cookable( g, Math.min( n, IMU.CAP - D.food.length ) ) ) {
						if ( ! count( g, 'ti_leaves' ) || ! ( s.qty > 0 ) ) break;
						if ( ! D.food.length ) D.laid = g.time.hours;
						D.food.push( s.id );
						if ( g.itemUse?.consumeOne ) g.itemUse.consumeOne( s ); else s.qty --;
						take( g, 'ti_leaves', 1 );
						done ++;
					}
					if ( done ) M.refresh( p );
				} );
			} } );
			if ( D.food.length ) A.push( { label: 'Cover with earth', run: () => {
				const sh = shovel( g );
				if ( ! sh ) { g.toast( 'Need a shovel', 'warn' ); return; }
				M.timed( 'Covering', 8, 'dig', () => {
					if ( D.stage !== 'hot' ) return;
					D.stage = 'cooking'; D.t = g.time.hours; D.until = g.time.hours + IMU.COOK_H;
					g.itemUse?.wear?.( sh, 0.01 );
					g.survival?.useStamina?.( 15 );
					M.refresh( p );
				} );
			} } );
		}
		if ( D.stage === 'cooking' ) A.push( { label: 'Leave it', run: () => g.toast( `${Math.ceil( hoursLeft( p, g ) )} h left`, 'info' ) } );
		if ( D.stage === 'done' ) A.push( { label: 'Dig up', run: () => {
			const sh = shovel( g );
			if ( ! sh ) { g.toast( 'Need a shovel', 'warn' ); return; }
			M.timed( 'Digging up', 8, 'dig', () => {
				if ( D.stage !== 'done' ) return;
				openImu( p, g );
				g.itemUse?.wear?.( sh, 0.01 );
				M.refresh( p );
			} );
		} } );
		return A;
	},
} );

// the feast comes up: each wrapped thing cooked (practice can stretch a pig to a second plate), the stones back, the
// pit empty and ready for another fire
export function openImu( p, g, rnd = Math.random ) {
	const D = p.data, inv = g.player.inventory;
	const lvl = g.skills?.level?.( 'cooking' ) || 0;
	// food sat in the cooling earth since it finished starts its shelf life then
	const sat = Math.max( 0, g.time.hours - ( D.t ?? g.time.hours ) );
	const got = [];
	for ( const id of D.food ) {
		const out = imuOut( id );
		if ( ! out ) continue;
		const n = id === 'raw_boar' && rnd() < 0.15 + lvl * 0.06 ? 2 : 1;
		const s = makeStack( out, n );
		if ( ! s ) continue;
		s.data.age = sat;
		if ( inv.add( s ) > 0 ) g.dropStack( s );
		got.push( out );
	}
	const st = makeStack( 'stone', D.stones || IMU.STONES );
	if ( st && inv.add( st ) > 0 ) g.dropStack( st );
	D.food = [];
	D.stage = 'pit';
	D.stones = 0;
	if ( got.length ) {
		g.skills?.xp?.( 'cooking', 10 + got.length * 3 );
		// a feast out of the ground
		g.survival?.mood?.( { unhappy: - 6, boredom: - 8 } );
		g.toast( `Imu: ${got.length} cooked`, 'good' );
	}
	inv.changed();
	return got;
}
