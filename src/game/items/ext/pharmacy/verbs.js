// The pharmacy's right-click verbs (hooks.js addUseActions). Node-safe.
//   thermometer: Take temperature; blood pressure cuff: Check blood pressure; stethoscope: Listen to chest, Listen
//     (the infected moving out of sight close by); exact readouts as toasts (Survival.vitals)
//   sunscreen: Apply (3 h); vinegar (any item tagged vinegar but the spray, which is medicine): Douse sting
//   spirits: Disinfect cut (a shot poured on it, not drunk); super glue: Glue cut (closes a bleeding cut)
//   ti leaves: Cool forehead (a fever, the heat); a crutch: Hold
import { addUseActions } from '../../hooks.js';
import { getItem } from '../../ItemDB.js';
import { provides } from '../../util.js';

const SPIRIT = ( d ) => ( d.drink?.alcohol || 0 ) >= 0.25 && ( d.drink?.portions || 1 ) >= 3;
// how far the stethoscope hears the infected through walls (m)
export const LISTEN_R = 14;

// the readouts, from Survival.vitals()
export const readout = {
	thermometer: ( v ) => `${v.temp.toFixed( 1 )} °C`,
	bpcuff: ( v ) => `BP ${v.sys}/${v.dia} · Pulse ${v.hr}`,
	stethoscope: ( v ) => `Pulse ${v.hr} · ${v.lungs}`,
};

// the infected moving close by that you can't see (behind walls, floors, a door): what a stethoscope on a wall hears
export function listenCount( g, r = LISTEN_R ) {
	const p = g.player, near = g.entities?.near?.( p.pos, r, 'zombie' ) || [];
	let n = 0;
	for ( const z of near ) {
		if ( ! z.alive ) continue;
		const eye = { x: p.pos.x, y: p.eye ?? p.pos.y + 1.6, z: p.pos.z }, at = { x: z.pos.x, y: z.pos.y + 1.4, z: z.pos.z };
		const seen = g.physics?.lineOfSight ? g.physics.lineOfSight( eye, at ) : true;
		if ( ! seen ) n ++;
	}
	return n;
}

// one portion of a drink off the bottle (as drinking it would, without drinking it): the last leaves the container
function pourShot( use, stack ) {
	const d = getItem( stack.id ), k = d.drink;
	const one = k.portions > 1 ? use.splitOne( stack ) : stack;
	one.data.left = ( one.data.left ?? k.portions ) - 1;
	if ( one.data.left > 0 ) { use.changed( use.where( one ) ); return; }
	if ( k.container && getItem( k.container ) ) use.transform( one, k.container, { liquid: null, amount: 0 } );
	else use.consumeOne( one );
}

// a portion of a food (a seasoning bottle) or one unit
function takeOne( use, stack ) {
	const d = getItem( stack.id );
	const p = d.food?.portions || 1;
	if ( p <= 1 ) { use.consumeOne( stack ); return; }
	const one = use.splitOne( stack );
	one.data.left = ( one.data.left ?? p ) - 1;
	if ( one.data.left <= 0 ) use.consumeOne( one ); else use.changed( use.where( one ) );
}

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use, S = g.survival;
	if ( ! S?.ailing ) return;
	const kind = def.tool?.kind;

	// ---- the instruments: exact readouts ----
	if ( kind === 'thermometer' || kind === 'bpcuff' || kind === 'stethoscope' ) {
		const verb = kind === 'thermometer' ? 'Take temperature' : kind === 'bpcuff' ? 'Check blood pressure' : 'Listen to chest';
		const time = kind === 'thermometer' ? 3 : kind === 'bpcuff' ? 6 : 4;
		ctx.first( verb, () => use.timed( verb === 'Take temperature' ? 'Taking temperature' : verb === 'Check blood pressure' ? 'Checking blood pressure' : 'Listening', time, 'click', () => {
			g.toast( readout[ kind ]( S.vitals() ), 'info' );
			// a little practice, less when repeated soon
			use.xp( 'first_aid', use.funDamp( 'pharm_' + kind, 300, true ) > 0.9 ? 1 : 0 );
		} ) );
		if ( kind === 'stethoscope' ) ctx.add( 'Listen', () => use.timed( 'Listening', 4, null, () => {
			const n = listenCount( g );
			g.toast( n ? `${n} moving close` : 'Quiet', n ? 'warn' : 'info' );
		} ) );
	}

	// ---- sunscreen ----
	if ( kind === 'sunscreen' ) ctx.first( 'Apply', () => use.timed( 'Applying sunscreen', 5, 'spray', () => {
		if ( ! use.exists( stack ) ) return;
		S.treat( { fx: { sunscreen: 3 } } );
		use.useUp( stack );
	} ) );

	// ---- vinegar on a jellyfish sting (the kitchen's vinegar; the lifeguard spray is medicine) ----
	if ( def.tags?.includes( 'vinegar' ) && ! def.medical && S.sting > 0.02 ) ctx.first( 'Douse sting', () => use.timed( 'Dousing sting', 2, 'pour', () => {
		if ( ! use.exists( stack ) ) return;
		S.treat( { cure: { sting: 1 } } );
		takeOne( use, stack );
		use.xp( 'first_aid', 2 );
	} ) );

	// ---- a shot of spirits poured on an open cut ----
	if ( def.drink && SPIRIT( def ) && ( S.ailing( 'dirty' ) || S.cut > 0 ) ) ctx.add( 'Disinfect cut', () => use.timed( 'Disinfecting', 3, 'pour', () => {
		if ( ! use.exists( stack ) ) return;
		S.treat( { infection: 0.15 } );
		pourShot( use, stack );
		use.xp( 'first_aid', 2 );
	} ) );

	// ---- super glue closes a bleeding cut (and seals it clean) ----
	if ( provides( stack, 'glue' ) && def.cat === 'tool' && S.bleeding > 0 ) ctx.add( 'Glue cut', () => use.timed( 'Gluing cut', 4, 'bandage', () => {
		if ( ! use.exists( stack ) || S.bleeding <= 0 ) return;
		S.bleeding = Math.max( 0, S.bleeding - 1 );
		S.openWound( 200 );
		S.woundClean = true;
		use.useUp( stack );
		use.xp( 'first_aid', 3 );
		g.toast( S.bleeding > 0 ? `Still bleeding (${S.bleeding})` : 'Bleeding stopped', S.bleeding > 0 ? 'warn' : 'good' );
	} ) );

	// ---- cool ti leaves on the forehead for a fever or the heat ----
	if ( def.id === 'ti_leaves' && ( S.ailing( 'hot' ) > 0.05 || S.lepto > 0 || S.cut > 0.5 ) ) ctx.add( 'Cool forehead', () => use.timed( 'Cooling', 4, 'tear', () => {
		if ( ! use.exists( stack ) ) return;
		S.temp -= 0.4;
		S.treat( { cure: { heat: 0.2 } } );
		use.consumeOne( stack );
	} ) );

	// ---- a crutch goes in the hands ----
	if ( def.crutch && g.hands?.select && g.player.inventory.hands !== stack.uid ) ctx.add( 'Hold', () => { g.app?.ui?.closeScreen?.(); g.hands.select( stack ); } );
} );
