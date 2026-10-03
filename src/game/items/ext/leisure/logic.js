// The leisure domain's numbers and pure helpers (Node-safe, no three.js): what a smoke, a game, a surf session and an
// admired keepsake do for the mood, how a flask fills, where the shore is, and how many keepsakes make a collection.
import { getItem } from '../../ItemDB.js';

// ---- mood ---------------------------------------------------------------------------------------------------------------

// real seconds of play per game day (time.dayMinutes): keepsakes cheer fully once a day (itemUse.funDamp)
export const daySeconds = ( g ) => Math.max( 60, ( g?.time?.dayMinutes || 48 ) * 60 );

// a collection: every other kind of keepsake you carry or keep on display close by adds a tenth, up to half again
export const COLLECT = { step: 0.1, max: 1.5, displayR: 10 };
export const collectionK = ( kinds ) => Math.min( COLLECT.max, 1 + COLLECT.step * Math.max( 0, kinds - 1 ) );

// keepsakes on display: each within reach eases boredom and gloom a little a minute, three at most (three take
// about two thirds off the boredom of sitting about indoors, 1.55 a minute, and lift gloom a little faster than calm)
export const DECOR = { r: 8, max: 3, boredom: - 0.35, unhappy: - 0.1 };
export const decorRate = ( n ) => {
	const k = Math.min( DECOR.max, Math.max( 0, n ) );
	return { boredom: DECOR.boredom * k, unhappy: DECOR.unhappy * k };
};

// games and toys: seconds of play before one cheers fully again
export const REPEAT = { toy: 120, game: 600, solo: 300, hug: 600, smoke: 300, ride: 1800 };

// ---- vices ----------------------------------------------------------------------------------------------------------------

// a cigarette, a cigar: seconds, mood, noise (a lighter's flick, a cough), stamina
export const SMOKE = {
	cigarette: { time: 7, fun: { stress: - 12, unhappy: - 2 }, noise: 5, stamina: 4 },
	cigar: { time: 18, fun: { stress: - 18, unhappy: - 6, boredom: - 8 }, noise: 5, stamina: 6 },
	vape: { time: 4, fun: { stress: - 8, unhappy: - 1 }, noise: 0, stamina: 1, charge: 0.25 },
	chew: { time: 4, fun: { stress: - 7 }, noise: 0, stamina: 0 },
};
// a vape's tank: puffs between refills
export const VAPE_TANK = 20;
export const vapeJuice = ( s ) => Math.max( 0, Math.min( VAPE_TANK, s?.data?.juice ?? VAPE_TANK ) );

// a bottle of strong spirits (several shots), as combos.js and the pharmacy read it
export const isSpirit = ( s, d ) => d?.tags?.includes( 'spirit' ) || ( ( d?.drink?.alcohol || 0 ) >= 0.25 && ( d?.drink?.portions || 1 ) >= 3 );
// the flask: shots it holds, and the room left in an empty or part-drunk one
export const FLASK_SHOTS = 4;
export function flaskRoom( s ) {
	if ( s?.id === 'hip_flask' ) return FLASK_SHOTS;
	if ( s?.id === 'hip_flask_full' ) return Math.max( 0, FLASK_SHOTS - ( s.data?.left ?? FLASK_SHOTS ) );
	return 0;
}
// shots left in a bottle (the top one may be part-drunk; a stack of full bottles below it)
export function shotsIn( s ) {
	const d = getItem( s?.id ), p = d?.drink?.portions || 1;
	return s ? Math.max( 0, s.data?.left ?? p ) + ( s.qty - 1 ) * p : 0;
}
// "Flask (dark rum)": what was poured in
export const flaskName = ( d ) => `Flask (${d.name[ 0 ].toLowerCase() + d.name.slice( 1 )})`;

// ---- the shore ---------------------------------------------------------------------------------------------------------------

// sea floor this far below the water counts as the sea (inland pools and streams sit above sea level)
const SEA_DEPTH = - 0.4;
const RINGS = [ 3, 6, 10, 15 ];
// standing at the water's edge or in the shallows, not up on a cliff
export function atShore( g ) {
	const p = g.player, hf = g.hf;
	if ( ! p || ! hf ) return false;
	if ( p.vehicle ) return false;
	if ( p.swimming ) return true;
	if ( p.pos.y > 4 ) return false;
	const h = hf.baseHeight ? ( x, z ) => hf.baseHeight( x, z ) : ( x, z ) => hf.heightAt( x, z );
	for ( const r of RINGS ) for ( let k = 0; k < 8; k ++ ) {
		const a = k / 8 * Math.PI * 2;
		if ( h( p.pos.x + Math.cos( a ) * r, p.pos.z + Math.sin( a ) * r ) < SEA_DEPTH ) return true;
	}
	return false;
}

// a surf session or a bodyboard: real seconds, game hours that pass, mood, stamina, board wear
export const RIDE = {
	surf: { verb: 'Surf', gerund: 'Surfing', time: 14, hours: 1, fun: { boredom: - 50, unhappy: - 24, stress: - 14 }, stamina: 35, wear: 0.02, noise: 14 },
	bodyboard: { verb: 'Bodyboard', gerund: 'Bodyboarding', time: 10, hours: 0.5, fun: { boredom: - 30, unhappy: - 14, stress: - 8 }, stamina: 25, wear: 0.03, noise: 12 },
};

// ---- throwing a toy -----------------------------------------------------------------------------------------------------------

// a frisbee sails far and lands with a clatter the infected go to look at; a ball less far
export const THROW = { frisbee: { dist: 16, noise: 22, delay: 0.9 }, ball: { dist: 12, noise: 16, delay: 0.6 } };
// where a throw lands: the distance clipped short of what it hits
export const landDist = ( dist, hitT ) => hitT != null && hitT < dist ? Math.max( 0.8, hitT - 0.4 ) : dist;

// ---- odds and ends -------------------------------------------------------------------------------------------------------------

// two dice, or a coin: the toast
export const diceText = ( a, b ) => a === b ? `Double ${a}` : `${a} and ${b}`;
export const coinText = ( r ) => r < 0.5 ? 'Heads' : 'Tails';
