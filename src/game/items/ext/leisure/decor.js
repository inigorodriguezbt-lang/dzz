// `leisure_decor`: a keepsake set out on display (a poster, a trophy, a snow globe, a hula figure, a koa bowl): F admires
// it like the item, and while you are within a few metres the display eases boredom and gloom a little each minute
// (three pieces count at most), so a decorated safehouse is a better place to sit out a storm. Node-safe: the poster's
// upright look comes from LEIS.look, set by models/ext/leisure.js in the browser (else the item's own model).
import { addPlaceable } from '../../placeables/registry.js';
import { getItem } from '../../ItemDB.js';
import { DECOR, decorRate } from './logic.js';
import { admire, admireSpec } from './admire.js';

export const LEIS = {
	look: {}, // item id -> ( p, game ) -> Object3D
};

addPlaceable( 'leisure_decor', {
	place: { time: 2, gerund: 'Setting out' },
	model: ( p, g ) => LEIS.look[ p.item ]?.( p, g ) || null,

	// one record a tick applies the rate for every piece within reach: the first of them in the list
	update( p, dt, g ) {
		const pl = g.player;
		if ( ! pl || ! ( dt > 0 ) ) return;
		if ( ( p.pos.x - pl.pos.x ) ** 2 + ( p.pos.z - pl.pos.z ) ** 2 > DECOR.r * DECOR.r || Math.abs( p.pos.y - pl.pos.y ) > 2.5 ) return;
		const near = ( g.placeables?.near?.( pl.pos, DECOR.r, 'leisure_decor' ) || [ p ] ).filter( q => Math.abs( q.pos.y - pl.pos.y ) <= 2.5 );
		if ( near[ 0 ] !== p ) return;
		const r = decorRate( near.length ), m = Math.min( dt, 4 ) / 60;
		g.survival?.mood?.( { boredom: r.boredom * m, unhappy: r.unhappy * m } );
	},

	actions( p, g ) {
		const d = getItem( p.item ), A = admireSpec( d ), M = g.placeables;
		const out = [];
		if ( A ) out.push( { label: A.verb, run: () => admire( g, p.stack, d, { placed: true } ) } );
		if ( M?.pickUpAction ) out.push( M.pickUpAction( p, { time: 1 } ) );
		return out;
	},
} );
