// `light`: lanterns, chemlights, torches, candles and tiki torches left burning where you put them. They feed the
// shared light pool (game.itemLights, the strongest few near the camera get real lights), glow, and burn down in game
// hours: batteries go flat (a lantern waits for new ones), a chemlight fades and is gone, a candle or a torch burns
// out, a tiki torch takes more oil. Rain puts out the open flames that stand outdoors.
import { addPlaceable } from './registry.js';
import { getItem } from '../ItemDB.js';
import { burnDown } from './logic.js';
import { glowSprite, flame, itemModel, placedDef } from './fx.js';
import * as THREE from 'three';

// what a placed light is: its light, how it burns, where the flame sits
export function lightSpec( p ) {
	const d = getItem( p.item ), pl = d?.place || {}, t = d?.tool || {};
	const L = pl.light || t.light || { range: 6, color: 0xffc080, intensity: 4 };
	const fire = !! pl.fire || t.kind === 'torch';
	return {
		L, fire, max: pl.burn ?? t.battery ?? 6, battery: !! t.battery && ! fire && t.kind !== 'chemlight', chem: t.kind === 'chemlight',
		upright: !! pl.upright, refuel: pl.refuel || null, flame: pl.flame ?? ( fire ? 0.05 : 0 ),
	};
}

const hrs = ( h ) => h >= 1 ? `${Math.round( h )} h left` : `${Math.max( 5, Math.round( h * 60 / 5 ) * 5 )} min left`;

addPlaceable( 'light', {
	radius: 0.15,
	place: { time: 1, gerund: 'Placing' },
	check( pos, g, spec, A ) {
		// a torch or a tiki torch is planted: it needs earth (not a floor, a road or a lot)
		if ( ! lightSpec( A.p ).upright ) return null;
		if ( g.world.isIndoors?.( pos ) ) return 'Outdoors only';
		if ( A.floor || ( g.hf.flagsNear?.( pos.x, pos.z ) & ( 1 | 4 | 8 | 16 ) ) ) return 'Needs soft ground';
		return null;
	},

	model( p ) {
		const S = lightSpec( p ), g = new THREE.Group();
		const m = itemModel( placedDef( p ) );
		let top = 0.1;
		if ( S.upright ) {
			// planted: the item's long axis (+x) stands up, a hand's width in the ground
			m.rotation.z = Math.PI / 2;
			m.updateMatrixWorld( true );
			const b = new THREE.Box3().setFromObject( m );
			m.position.set( - ( b.min.x + b.max.x ) / 2, - 0.12 - b.min.y, - ( b.min.z + b.max.z ) / 2 );
			top = b.max.y - b.min.y - 0.12;
		} else {
			m.updateMatrixWorld( true );
			top = new THREE.Box3().setFromObject( m ).max.y;
		}
		g.add( m );
		const on = !! p.stack?.data?.on && ! p.preview;
		if ( on && S.fire ) { const f = flame( S.flame * 2.2 ); f.position.y = top - 0.01; g.add( f ); }
		if ( on && ! S.fire ) { const s = glowSprite( S.L.color, S.chem ? 0.35 : 0.5 ); s.position.y = S.chem ? 0.02 : top * 0.55; g.add( s ); g.userData.glow = s; }
		g.userData.top = top;
		return g;
	},

	onPlace( p, g ) {
		const S = lightSpec( p ), st = p.stack;
		st.data.charge ??= S.max;
		if ( S.chem ) { st.data.on = true; } // snapped as it goes down
		else if ( S.battery ) st.data.on = st.data.charge > 0;
		// a lit torch stays lit; candles and tiki torches are lit where they stand
		g.placeables.refresh( p );
	},

	// after every (re)build: the light-pool source follows the state
	show( p, g ) { syncLight( p, g ); },

	update( p, dt, g, dh ) {
		const S = lightSpec( p ), st = p.stack;
		if ( ! st?.data?.on ) return;
		if ( dh > 0 && ! ( S.battery && g.mode === 'creative' ) ) st.data.charge = burnDown( st.data.charge, dh );
		// rain drowns an open flame outdoors now and then
		if ( S.fire && ( g.weather?.rain || 0 ) > 0.45 && dt > 0 && Math.random() < dt * 0.02 && ! g.world.isIndoors?.( p.pos ) ) { out( p, g, 'Rain put it out' ); return; }
		if ( st.data.charge > 0 ) return;
		const name = getItem( p.item )?.name || 'Light';
		if ( S.battery ) { out( p, g, null ); return; }
		if ( S.refuel ) { out( p, g, null ); return; }
		// chemlights, candles and torches are spent
		g.placeables.remove( p, { give: false } );
		if ( p.pos && g.player.pos.distanceTo( g.placeables.vec( p ) ) < 30 ) g.toast( `${name} went out`, 'info' );
	},

	sub( p ) {
		const S = lightSpec( p ), st = p.stack;
		if ( st.data.on ) return hrs( st.data.charge || 0 );
		if ( ! ( st.data.charge > 0 ) ) return S.battery ? 'Batteries dead' : S.refuel ? 'No oil' : 'Burnt out';
		return 'Off';
	},

	actions( p, g ) {
		const S = lightSpec( p ), st = p.stack, M = g.placeables, use = g.itemUse, A = [];
		const lit = !! st.data.on, has = st.data.charge > 0;
		if ( S.chem ) { /* nothing to switch: it glows until it fades */ }
		else if ( lit ) A.push( { label: S.fire ? 'Put out' : 'Turn off', run: () => { out( p, g, null ); M.sound( p, S.fire ? 'snap' : 'click', 0.4 ); } } );
		else if ( has ) {
			if ( S.fire ) A.push( { label: 'Light', run: () => {
				const src = g.mode === 'creative' ? null : use?.fireSource?.();
				if ( ! src && g.mode !== 'creative' ) { g.toast( 'Need a lighter or matches', 'warn' ); return; }
				M.timed( 'Lighting', 1.5, 'strike', () => { if ( src ) use.useUp( src ); on( p, g ); } );
			} } );
			else A.push( { label: 'Turn on', run: () => { on( p, g ); M.sound( p, 'click', 0.45 ); } } );
		}
		if ( S.battery && ( st.data.charge ?? 0 ) < S.max * 0.95 && g.player.inventory.count( 'batteries' ) > 0 ) A.push( { label: 'Replace batteries', run: () => {
			const bat = g.player.inventory.find( ( s ) => s.id === 'batteries' );
			M.timed( 'Replacing batteries', 3, 'click', () => { if ( ! use?.exists?.( bat ) ) return; use.consumeOne( bat ); st.data.charge = S.max; M.refresh( p ); } );
		} } );
		if ( S.refuel && ( st.data.charge ?? 0 ) < S.max * 0.9 ) {
			const oil = g.player.inventory.find( ( s ) => s.id === S.refuel );
			if ( oil ) A.push( { label: 'Add oil', run: () => M.timed( 'Filling', 3, 'pour', () => { if ( ! use?.exists?.( oil ) ) return; use.consumeOne( oil ); st.data.charge = S.max; M.refresh( p ); } ) } );
		}
		A.push( M.pickUpAction( p, { before: () => { if ( S.fire ) st.data.on = false; } } ) );
		return A;
	},

} );

function on( p, g ) {
	if ( ! ( p.stack.data.charge > 0 ) ) return;
	p.stack.data.on = true;
	g.placeables.refresh( p );
}

function out( p, g, msg ) {
	p.stack.data.on = false;
	g.placeables.refresh( p );
	if ( msg && g.player.pos.distanceTo( g.placeables.vec( p ) ) < 30 ) g.toast( msg, 'info' );
}

// the light-pool source follows the record's state
export function syncLight( p, g ) {
	const S = lightSpec( p ), lit = !! p.stack?.data?.on && p.stack.data.charge > 0;
	const top = p._obj?.userData.top ?? 0.1;
	g.placeables.light( p, lit ? { color: S.L.color, intensity: ( S.L.intensity || 4 ) * ( S.chem ? 1.5 : 1 ), range: S.L.range || 8, flicker: !! S.L.flicker || S.fire, lift: Math.max( 0.05, top ) } : null );
}
