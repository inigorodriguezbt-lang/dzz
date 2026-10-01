// `noise`: things left making a racket to pull the infected somewhere else — a wind-up alarm clock set to ring after
// a delay (it rings ~45 s, a pulse of noise every 2 s), or a radio left playing (a pulse every 4 s while the batteries
// last; a dead emergency radio can be cranked). The infected hear it through game.events 'noise' (ai/Creatures.js).
import { addPlaceable } from './registry.js';
import { getItem } from '../ItemDB.js';
import { alarmTick, deviceTick } from './logic.js';

const DELAYS = [ [ 20, '20 s' ], [ 60, '1 min' ], [ 180, '3 min' ] ];

function spec( p ) {
	const d = getItem( p.item ), pl = d?.place || {}, n = d?.noise || {};
	return { alarm: !! pl.alarm, radius: pl.radius ?? n.radius ?? 40, every: pl.every ?? 3, ring: pl.ring ?? n.seconds ?? 45, battery: d?.tool?.battery || 0 };
}

const secs = ( s ) => s >= 60 ? `${Math.ceil( s / 60 )} min` : `${Math.ceil( s )} s`;

addPlaceable( 'noise', {
	radius: 0.12,
	place: { time: 1, gerund: 'Placing' },

	onPlace( p ) {
		const S = spec( p );
		if ( S.alarm ) p.data = { left: 0, ring: 0, pulse: 0 };
		else { p.data = { on: false, pulse: 0 }; p.stack.data.charge ??= S.battery; }
	},

	show( p, g ) { sync( p, g ); },

	update( p, dt, g, dh ) {
		const S = spec( p ), D = p.data, M = g.placeables;
		if ( S.alarm ) {
			const r = alarmTick( D, dt, { ring: S.ring, every: 2 } );
			if ( r.start || r.stop ) sync( p, g );
			if ( r.emit ) M.noise( p, S.radius, 'alarm' );
			return;
		}
		// a radio: its charge is the stack's, so it goes back in your bag as it was
		const st = p.stack.data;
		const s = { on: D.on, charge: g.mode === 'creative' ? null : st.charge, pulse: D.pulse };
		const r = deviceTick( s, dt, dh, { every: S.every, drain: 1 } );
		D.on = s.on; D.pulse = s.pulse;
		if ( s.charge != null ) st.charge = s.charge;
		if ( r.emit ) M.noise( p, S.radius, 'radio' );
		if ( r.died ) { sync( p, g ); M.refresh( p ); }
	},

	sub( p ) {
		const S = spec( p ), D = p.data;
		if ( S.alarm ) return D.ring > 0 ? 'Ringing' : D.left > 0 ? `Rings in ${secs( D.left )}` : 'Not set';
		if ( D.on ) return 'Playing';
		return p.stack.data.charge > 0 ? 'Off' : 'Batteries dead';
	},

	actions( p, g ) {
		const S = spec( p ), D = p.data, M = g.placeables, A = [];
		if ( S.alarm ) {
			if ( D.ring > 0 || D.left > 0 ) A.push( { label: 'Turn off', run: () => { D.left = 0; D.ring = 0; sync( p, g ); M.sound( p, 'click', 0.5 ); } } );
			else for ( const [ s, txt ] of DELAYS ) A.push( { label: `Set ${txt}`, run: () => { D.left = s; D.ring = 0; M.sound( p, 'click', 0.5 ); sync( p, g ); } } );
		} else if ( D.on ) A.push( { label: 'Turn off', run: () => { D.on = false; sync( p, g ); M.sound( p, 'click', 0.45 ); } } );
		else if ( p.stack.data.charge > 0 || g.mode === 'creative' ) A.push( { label: 'Turn on', run: () => { D.on = true; D.pulse = 0; sync( p, g ); M.sound( p, 'click', 0.45 ); } } );
		else {
			if ( g.player.inventory.count( 'batteries' ) > 0 ) A.push( { label: 'Replace batteries', run: () => {
				const bat = g.player.inventory.find( ( s ) => s.id === 'batteries' );
				M.timed( 'Replacing batteries', 3, 'click', () => { if ( ! g.itemUse?.exists?.( bat ) ) return; g.itemUse.consumeOne( bat ); p.stack.data.charge = S.battery; } );
			} } );
			// the emergency radio has a hand crank
			if ( getItem( p.item )?.id === 'radio' ) A.push( { label: 'Crank', run: () => M.timed( 'Cranking', 6, 'reel', () => { p.stack.data.charge = Math.min( S.battery, ( p.stack.data.charge || 0 ) + 2 ); } ) } );
		}
		A.push( M.pickUpAction( p, { before: () => { D.on = false; D.left = 0; D.ring = 0; sync( p, g, true ); } } ) );
		return A;
	},

	serialize( p ) { return p.data; },
	onRemove( p, g ) { sync( p, g, true ); },
} );

// the ringing / playing loop follows the state
function sync( p, g, gone = false ) {
	const S = spec( p ), D = p.data, M = g.placeables;
	const name = S.alarm ? 'alarm_ring' : 'radio_loop';
	const want = ! gone && ( S.alarm ? D.ring > 0 : D.on );
	if ( want ) M.loop( p, name, S.alarm ? 1 : 0.55, S.alarm ? 7 : 4 );
	else M.stopLoop( p, name );
}
