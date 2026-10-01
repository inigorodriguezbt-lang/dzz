// `collector`: a rain barrel or a tarp rigged between stakes fills while it rains on it (game.weather.rain, none
// under a roof), up to its capacity. F fills a carried water container, drinks from it or tips it out. Rainwater that
// has sat three days without fresh rain goes stale (dirty water: boil or purify it).
import * as THREE from 'three';
import { addPlaceable, lc } from './registry.js';
import { getItem } from '../ItemDB.js';
import { rainFill, collectedLiquid, STALE_H } from './logic.js';
import { placedModel } from '../models/ext/placeables.js';
import { waterMaterial, itemModel } from './fx.js';
import { liquidName, worstLiquid } from '../util.js';

function spec( p ) {
	const pl = getItem( p.item )?.place || {};
	return { cap: pl.litres ?? 60, area: pl.area ?? 1, tarp: pl.shape === 'tarp' };
}

// how hard it rains on the collector: the weather is local to the player, so far collectors get the state's rain
export function rainAt( p, g ) {
	const W = g.weather;
	if ( ! W ) return 0;
	if ( g.world.isIndoors?.( g.placeables.vec( p ) ) ) return 0;
	const d = Math.hypot( p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z );
	if ( d < 400 ) return W.rain || 0;
	return { showers: 0.45, overcast: 0.15, storm: 1 }[ W.state ] || 0;
}

let discGeo = null;

addPlaceable( 'collector', {
	outdoors: true,
	solid: ( p ) => ! spec( p ).tarp,
	place: { time: 2.5, gerund: 'Setting up' },

	model( p ) {
		const S = spec( p ), d = getItem( p.item );
		const g = new THREE.Group();
		g.add( S.tarp ? placedModel( 'tarp', { color: d.model?.color } ) : itemModel( d ) );
		discGeo = discGeo || new THREE.CircleGeometry( 1, 24 ).rotateX( - Math.PI / 2 );
		const w = new THREE.Mesh( discGeo, waterMaterial( p.data.liquid ) );
		w.receiveShadow = true;
		w.visible = false;
		g.add( w );
		g.userData.water = w;
		level( p, w );
		return g;
	},

	onPlace( p ) { p.data = { L: 0, liquid: 'water', rainAt: null }; },
	show( p ) { level( p ); },

	update( p, dt, g, dh ) {
		const S = spec( p ), D = p.data;
		const rain = rainAt( p, g );
		if ( rain > 0.05 && dh > 0 ) {
			const before = D.L;
			D.L = rainFill( D.L, S.cap, rain, dh, S.area );
			if ( D.L > before ) {
				// fresh rain on stale water doesn't make it clean
				D.liquid = before > 0.5 ? worstLiquid( D.liquid || 'water', 'water' ) : 'water';
				D.rainAt = g.time.hours;
			}
		}
		if ( D.L > 0.05 && D.rainAt != null && collectedLiquid( g.time.hours - D.rainAt ) === 'dirty' ) D.liquid = 'dirty';
		if ( D.L <= 0.05 ) { D.L = 0; D.liquid = 'water'; }
		if ( Math.abs( ( p._shownL ?? - 1 ) - D.L ) > 0.2 || p._shownLiq !== D.liquid ) level( p );
	},

	sub( p ) {
		const S = spec( p ), D = p.data;
		return `${D.L < 10 ? D.L.toFixed( 1 ) : Math.round( D.L )} / ${S.cap} L` + ( D.L > 0.05 && D.liquid === 'dirty' ? ' · stale' : '' );
	},

	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( D.L > 0.05 ) {
			const c = fillable( g, D.liquid );
			if ( c ) A.push( { label: `Fill ${lc( getItem( c.id ).name )}`, run: () => fill( p, g, c ) } );
			const S = g.survival;
			if ( S && ( S.thirst ?? 100 ) < 95 ) A.push( { label: 'Drink', run: () => M.timed( 'Drinking', 3, 'drink', () => {
				const sip = Math.min( 0.5, D.L );
				S.drink( null, sip, D.liquid );
				D.L -= sip;
				level( p );
			} ) } );
			A.push( { label: 'Tip out', run: () => M.timed( 'Emptying', 2, 'pour', () => { D.L = 0; level( p ); } ) } );
		}
		A.push( M.pickUpAction( p, { check: () => D.L > 1 ? 'Empty it first' : null, time: spec( p ).tarp ? 3 : 1.5, label: spec( p ).tarp ? 'Take down' : 'Pick up' } ) );
		return A;
	},
} );

// the first carried container with room that can take this water (rain only tops up clean water or nothing)
function fillable( g, liquid ) {
	const ok = ( s, d ) => d?.tool?.liquid && ( s.data.amount || 0 ) < d.tool.liquid - 0.01 && ( ! s.data.liquid || ( s.data.amount || 0 ) < 0.01 || s.data.liquid === liquid );
	return g.player.inventory.find( ok );
}

function fill( p, g, c ) {
	const D = p.data, M = g.placeables, d = getItem( c.id ), cap = d.tool.liquid;
	M.timed( `Filling ${lc( d.name )}`, Math.min( 8, 2 + cap * 1.2 ), 'pour', () => {
		if ( ! g.itemUse?.exists?.( c ) ) return;
		const cur = c.data.amount || 0, take = Math.min( cap - cur, D.L );
		if ( take <= 0 ) return;
		c.data.liquid = cur > 0.01 && c.data.liquid ? worstLiquid( c.data.liquid, D.liquid ) : D.liquid;
		c.data.amount = cur + take;
		D.L -= take;
		level( p );
		g.player.inventory.changed();
		g.toast( `${d.name}: ${c.data.amount.toFixed( 1 )} L ${liquidName( c.data.liquid )}`, c.data.liquid === 'water' ? 'good' : 'info' );
	} );
}

// the water surface: up the barrel's inside, or a pool spreading in the tarp's sag
function level( p, w = p._obj?.userData.water ) {
	if ( ! w || ! p.data ) return;
	const S = spec( p ), D = p.data, k = Math.min( 1, ( D.L || 0 ) / S.cap );
	w.visible = ( D.L || 0 ) > 0.05;
	w.material = waterMaterial( D.liquid );
	if ( S.tarp ) { const r = 0.12 + 0.45 * Math.sqrt( k ); w.scale.setScalar( r ); w.position.y = 0.39 + 0.42 * ( r / 0.75 ) ** 2 * 0.98 - 0.005; }
	else { w.scale.setScalar( 0.26 ); w.position.y = 0.05 + 0.8 * k; }
	p._shownL = D.L; p._shownLiq = D.liquid;
}

export { STALE_H };
