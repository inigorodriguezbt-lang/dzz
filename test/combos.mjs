// Item-on-item mixes (Node, no DOM): node test/combos.mjs
//   the registry: every combo has a unique id, a verb, and names only real item ids
//   matchers in every form, orientation, find / accepts / partners (carried, the open container, the ground)
//   game.combine.run on a stub game with the real Inventory, Actions, ItemUse and Crafting: consumption (qty across
//   stacks, uses, portions down to the empty bottle, 'all', 0 kept), liquids (pour, draw from a side, from what you
//   carry), outputs (into the bag, dropped when full), repair caps and soft refusals, check() refusals, tools and the
//   fire station
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
const C = await import( '../src/game/items/combos.js' );
console.warn = warn0;
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const THREE = await import( 'three' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { LightPool } = await import( '../src/game/items/LightPool.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- registry -------------------------------------------------------------------------------------------------------
console.log( 'registry' );
ok( ! warnings.some( w => /duplicate combo|combo needs/.test( w ) ), 'no duplicate or malformed combos: ' + warnings.filter( w => /combo/.test( w ) ).join( '; ' ) );
const all = C.allCombos();
ok( all.length >= 25, `at least 25 combos (${all.length})` );
const ids = new Set();
for ( const c of all ) {
	ok( ! ids.has( c.id ), `combo id unique: ${c.id}` ); ids.add( c.id );
	ok( typeof c.verb === 'string' && c.verb.length > 1 && c.verb.length <= 24, `${c.id}: verb '${c.verb}'` );
	for ( const id of C.comboIds( c ) ) ok( ITEMS.has( id ), `${c.id}: names a real item ${id}` );
	for ( const [ id, q ] of c.out ) ok( Number.isInteger( q ) && q >= 1, `${c.id}: output ${id} qty ${q}` );
	ok( c.time === 0 || typeof c.time === 'function' || c.time > 0, `${c.id}: time` );
	for ( const s of [ 'a', 'b' ] ) { const u = c.use[ s ]; ok( u === 0 || u === 'all' || u > 0 || ( u && typeof u === 'object' ), `${c.id}: use.${s}` ); }
	// each side matches at least one real item, so the combo can ever be offered
	for ( const s of [ 'a', 'b' ] ) {
		let any = false;
		for ( const d of ITEMS.values() ) {
			const st = makeStack( d.id, d.stack, { full: true, liquid: 'water' } );
			if ( d.tool?.liquid ) { st.data.liquid = 'water'; st.data.amount = d.tool.liquid * 0.92; }
			if ( d.tool?.battery ) st.data.charge = 0;
			st.cond = 0.5;
			if ( C.matches( c[ s ], st, d ) ) { any = true; break; }
			if ( d.tool?.liquid ) { st.data.liquid = 'fuel'; if ( C.matches( c[ s ], st, d ) ) { any = true; break; } st.data.liquid = 'dirty'; if ( C.matches( c[ s ], st, d ) ) { any = true; break; } st.data.liquid = null; st.data.amount = 0; if ( C.matches( c[ s ], st, d ) ) { any = true; break; } }
		}
		ok( any, `${c.id}: side ${s} matches some item` );
	}
}
// every sound a combo names exists: an item sound (sounds.js) or an engine synth (a typo would just be silent)
{
	const { ITEM_SOUNDS } = await import( '../src/game/items/sounds.js' );
	const { SYNTH } = await import( '../src/audio/Synth.js' );
	for ( const c of all ) if ( c.sound ) ok( ITEM_SOUNDS.includes( c.sound ) || c.sound in SYNTH, `${c.id}: sound '${c.sound}' exists` );
}
// a domain registers more from its own file; the format normalises
C.addCombos( [ { id: 'test_dummy', verb: 'Poke', a: 'stone', b: 'stick', out: 'rags' }, { id: 'test_dummy2', verb: 'Poke', a: 'stone', b: 'stick', out: [ [ 'rags', 2 ], [ 'stick', 1, { x: 1 } ] ], use: { a: 0 } } ] );
const d1 = C.getCombo( 'test_dummy' ), d2 = C.getCombo( 'test_dummy2' );
ok( d1.use.a === 1 && d1.use.b === 1 && d1.out.length === 1 && d1.out[ 0 ][ 0 ] === 'rags' && d1.out[ 0 ][ 1 ] === 1, 'defaults: use 1/1, out [ id ] becomes [ [ id, 1 ] ]' );
ok( d2.use.a === 0 && d2.use.b === 1 && d2.out.length === 2 && d2.out[ 1 ][ 2 ].x === 1, 'out list with data, use a: 0' );
warnings.length = 0;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
C.addCombos( [ { id: 'test_dummy', verb: 'X', a: 'stone', b: 'stick' } ] );
console.warn = warn0;
ok( warnings.some( w => /duplicate combo test_dummy/.test( w ) ), 'a duplicate id warns' );
for ( let i = C.COMBOS.length - 1; i >= 0; i -- ) if ( /^test_dummy/.test( C.COMBOS[ i ].id ) ) C.COMBOS.splice( i, 1 );

// ---- matchers -------------------------------------------------------------------------------------------------------
console.log( 'matchers' );
{
	const bat = makeStack( 'batteries', 4 ), fl = makeStack( 'flashlight', 1 ), knife = makeStack( 'kitchen_knife', 1 ), tape = makeStack( 'duct_tape', 1 );
	const bottle = makeStack( 'water_bottle', 1, { liquid: 'water' } ), can = makeStack( 'gas_can', 1 ), shirt = makeStack( 'tshirt', 1 );
	const m = C.matches;
	ok( m( 'batteries', bat ) && ! m( 'batteries', fl ), 'id string' );
	ok( m( { id: 'flashlight' }, fl ) && m( { id: [ 'x', 'flashlight' ] }, fl ) && ! m( { id: 'batteries' }, fl ), '{ id } and an id list' );
	ok( m( { ids: [ 'a', 'batteries' ] }, bat ) && ! m( { ids: [ 'a' ] }, bat ), '{ ids }' );
	ok( m( { tag: 'kitchen' }, knife ) && m( { tag: [ 'nope', 'civilian' ] }, knife ) && ! m( { tag: 'military' }, knife ), '{ tag } and a tag list' );
	ok( m( { cat: 'melee' }, knife ) && m( { cat: [ 'clothing', 'melee' ] }, knife ) && ! m( { cat: 'tool' }, knife ), '{ cat } and a cat list' );
	ok( m( { tool: 'cut' }, knife ) && m( { tool: 'tape' }, tape ) && m( { tool: 'canopener' }, makeStack( 'multitool', 1 ) ) && ! m( { tool: 'cut' }, fl ), '{ tool }: kind, provides, melee tools' );
	const broken = makeStack( 'kitchen_knife', 1 ); broken.cond = 0;
	ok( ! m( { tool: 'cut' }, broken ), '{ tool }: a broken tool does not count' );
	ok( m( { liquid: 'water' }, bottle ) && m( { liquid: 'water', min: 0.5 }, bottle ) && ! m( { liquid: 'water', min: 0.6 }, bottle ) && ! m( { liquid: 'fuel' }, bottle ), '{ liquid, min }' );
	ok( m( { liquid: 'fuel', min: 4 }, can ) && m( { liquid: 'any' }, can ) && m( { liquid: [ 'dirty', 'fuel' ] }, can ), '{ liquid }: a fuel can holds fuel; any; kind list' );
	ok( ! m( { liquid: 'any' }, makeStack( 'water_bottle', 1 ) ), '{ liquid }: an empty bottle holds nothing' );
	ok( m( { fn: ( s, d ) => d.cat === 'clothing' && s.cond === 1 }, shirt ), '{ fn( stack, def ) }' );
	ok( m( { any: [ 'x', { cat: 'clothing' } ] }, shirt ) && ! m( { any: [ 'x', 'y' ] }, shirt ), '{ any }' );
	ok( m( { not: 'flashlight' }, shirt ) && ! m( { not: { cat: 'clothing' } }, shirt ), '{ not }' );
	ok( m( { cat: 'clothing', fn: () => true }, shirt ) && ! m( { cat: 'clothing', fn: () => false }, shirt ) && ! m( { cat: 'clothing', id: 'jeans' }, shirt ), 'fields AND together' );
	ok( m( [ 'x', 'tshirt' ], shirt ) && ! m( [ 'x' ], shirt ), 'an array is any-of' );
	ok( ! m( null, shirt ) && ! m( 'tshirt', null ), 'no matcher / no stack: no match' );
	// units
	ok( C.unitKind( getItem( 'duct_tape' ) ) === 'uses' && C.unitKind( getItem( 'rum' ) ) === 'portions' && C.unitKind( getItem( 'batteries' ) ) === 'qty' && C.unitKind( getItem( 'spam' ) ) === 'qty', 'unit kinds: uses, drink portions, else qty (food by the unit)' );
	ok( C.unitsIn( tape, 'uses' ) === 5 && C.unitsIn( bat, 'qty' ) === 4 && C.unitsIn( makeStack( 'rum', 1 ), 'portions' ) === 4, 'units in a stack' );
	ok( C.useSpec( { portions: 2 }, getItem( 'spam' ) ).kind === 'portions' && C.useSpec( 'all' ).all && C.useSpec( 0 ) === null, 'use specs' );
}

// ---- orientation and find -------------------------------------------------------------------------------------------
console.log( 'find' );
{
	const bat = makeStack( 'batteries', 2 ), fl = makeStack( 'flashlight', 1 ); fl.data.charge = 1;
	const f1 = C.findCombos( bat, fl ), f2 = C.findCombos( fl, bat );
	ok( f1.some( x => x.combo.id === 'insert_batteries' && x.a === bat && x.b === fl ), 'battery onto flashlight' );
	ok( f2.some( x => x.combo.id === 'insert_batteries' && x.a === bat && x.b === fl ), 'flashlight onto battery: the same combo, sides swapped back' );
	ok( C.comboLabel( C.getCombo( 'insert_batteries' ), bat, fl ) === 'Insert into Flashlight', 'label template: ' + C.comboLabel( C.getCombo( 'insert_batteries' ), bat, fl ) );
	ok( C.comboLabel( C.getCombo( 'sharpen_stone' ), makeStack( 'stone', 1 ), makeStack( 'machete', 1 ) ) === 'Sharpen Machete', 'default label: verb + B' );
	fl.data.charge = 8;
	ok( ! C.findCombos( bat, fl ).some( x => x.combo.id === 'insert_batteries' ), 'a full flashlight takes no batteries' );
	ok( C.findCombos( bat, bat ).length === 0, 'a stack never combines with itself' );
	const b1 = makeStack( 'water_bottle', 1, { liquid: 'water' } ), b2 = makeStack( 'canteen', 1 );
	b1.data.amount = 0.3;
	b2.data.liquid = 'water'; b2.data.amount = 0.2;
	const one = C.findCombos( b1, b2 ).filter( x => x.combo.id === 'pour' ), two = C.findCombos( b1, b2, { both: true } ).filter( x => x.combo.id === 'pour' );
	ok( one.length === 1 && one[ 0 ].a === b1, 'a drag pours the dragged container into the target' );
	ok( two.length === 2, 'both: the reverse pour is listed too (partners)' );
}

// ---- a stub game (as test/items.mjs) ---------------------------------------------------------------------------------
console.log( 'combine' );
const toasts = [], dropped = [], noises = [];
const ground = [];
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() },
	interact: { addProvider() { return () => {}; } }, settings: { get: () => true }, input: { pressed: () => false },
	world: { isIndoors: () => false, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } }, weather: { rain: 0, cover: 0.3 },
	player: { pos: new THREE.Vector3(), yaw: 0, stanceH: 1.6, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true,
	// the ground: world items with a stack
	items3d: {
		near: () => ground,
		byStack: ( s ) => ground.find( w => w.stack === s ) || null,
		remove: ( w ) => { const i = ground.indexOf( w ); if ( i >= 0 ) ground.splice( i, 1 ); return i >= 0; },
		claim: ( w ) => w, refresh() {},
	},
	app: { ui: { inventory: { other: null } } },
};
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.actions = new Actions( game );
const lights = new LightPool( game );
game.itemUse = new ItemUse( game, lights );
game.crafting = new Crafting( game, lights );
const K = game.combine = new Combine( game );
const inv = game.player.inventory;
inv.equip.back = makeStack( 'backpack_military', 1 );
inv.equip.legs = makeStack( 'cargo_pants', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const take = ( s ) => inv.remove( s );
const run = ( id, a, b ) => { const r = K.run( C.getCombo( id ), a, b ); finish(); return r; };
const has = ( s ) => !! inv.findAll( x => x === s ).length;

// batteries: one from a stack of four, the device full
{
	const bat = put( 'batteries', 4 ), fl = put( 'flashlight' ); fl.data.charge = 0.5;
	const acc = K.accepts( bat, fl );
	ok( acc?.ok && acc.verb === 'Insert into Flashlight' && acc.matches.length === 1, 'accepts: the drag verb ' + acc?.verb );
	ok( run( 'insert_batteries', bat, fl ) && fl.data.charge === 8 && bat.qty === 3, `batteries: one used (${bat.qty} left), flashlight full (${fl.data.charge})` );
	ok( K.accepts( bat, fl ) === null, 'a full flashlight is not a target any more' );
	const head = put( 'headlamp' ); head.data.charge = 0;
	const parts = K.partners( bat );
	ok( parts.some( p => p.other === head && p.ok && p.label === 'Insert into Headlamp' ), 'partners: the headlamp' );
	ok( ! parts.some( p => p.other === fl ), 'partners: not the full flashlight' );
	run( 'insert_batteries', bat, head ); run( 'insert_batteries', bat, put( 'lantern' ) ); take( fl ); take( head );
	const l2 = inv.find( s => s.id === 'lantern' ); l2.data.charge = 0;
	ok( bat.qty === 1, 'two more used' );
	run( 'insert_batteries', bat, l2 );
	ok( ! has( bat ) && l2.data.charge === 20, 'the last battery is gone from the bag' );
	take( l2 );
}

// duct tape: a use per patch, repair capped at 0.85, a soft refusal at the cap
{
	const tape = put( 'duct_tape' ), shirt = put( 'tshirt' ); shirt.cond = 0.5;
	ok( run( 'tape_clothing', tape, shirt ), 'tape onto a shirt runs' );
	near( shirt.cond, 0.7, 1e-9, 'tape: +0.2' );
	ok( tape.data.uses === 4, 'tape: one use gone' );
	run( 'tape_clothing', tape, shirt );
	near( shirt.cond, 0.85, 1e-9, 'tape: capped at 0.85' );
	const st = K.state( C.getCombo( 'tape_clothing' ), tape, shirt );
	ok( ! st.ok && st.soft && st.reason === 'Not damaged', 'at the cap: a soft refusal' );
	ok( ! K.partners( tape ).some( p => p.other === shirt && p.combo.id === 'tape_clothing' ), 'partners leave out what has nothing to mend' );
	ok( K.accepts( tape, shirt ) === null, 'accepts: only soft refusals: not a target' );
	// the sewing kit takes it the rest of the way
	const kit = put( 'sewing_kit' );
	ok( run( 'sew_clothing', kit, shirt ) && shirt.cond === 1 && kit.data.uses === 5, `sewing: back to 1 (${shirt.cond}), a use gone (${kit.data.uses})` );
	// uses run out: the roll is used up
	tape.data.uses = 1; shirt.cond = 0.3;
	run( 'tape_clothing', tape, shirt );
	ok( ! has( tape ) && toasts.includes( 'Duct tape used up' ), 'the last strip of tape: the roll is gone' );
	take( shirt ); take( kit );
}

// alcohol: a shot of rum disinfects a rag bandage; the last shot leaves the empty bottle
{
	const rum = put( 'rum' ), rag = put( 'bandage_rag', 3 );
	ok( run( 'disinfect_rag', rum, rag ), 'rum onto a rag bandage' );
	ok( rag.qty === 2 && rum.data.left === 3 && inv.count( 'bandage' ) === 1, `one rag (${rag.qty}), one shot (${rum.data.left}), a sterile bandage (${inv.count( 'bandage' )})` );
	rum.data.left = 1;
	run( 'disinfect_rag', rum, rag );
	ok( rum.id === 'empty_bottle' && ! rum.data.liquid && inv.count( 'bandage' ) === 2, 'the last shot: the empty bottle stays' );
	// wipes: a plain unit off a stack of ten
	const wipes = put( 'alcohol_wipes', 10 );
	run( 'disinfect_rag', wipes, rag );
	ok( wipes.qty === 9 && ! has( rag ) && inv.count( 'bandage' ) === 3, 'wipes: one of ten; the last rag is gone' );
	// boiling: the whole stack in a pot of water at a fire
	const rags2 = put( 'bandage_rag', 3 ), pot = put( 'cooking_pot' ); pot.data.liquid = 'dirty'; pot.data.amount = 1;
	const st = K.state( C.getCombo( 'boil_rags' ), rags2, pot );
	ok( ! st.ok && st.reason === 'Need a fire' && ! st.soft, 'boiling needs a fire: ' + st.reason );
	const pp = K.partners( pot ).find( p => p.combo.id === 'boil_rags' );
	ok( pp && ! pp.ok && pp.reason === 'Need a fire', 'partners list a hard refusal with its reason' );
	ok( K.accepts( rags2, pot )?.ok === false && K.accepts( rags2, pot ).reason === 'Need a fire', 'accepts: a hard refusal says why' );
	const fire = game.crafting.placeFire( 'campfire', new THREE.Vector3( 0.5, 0, 0 ), { lit: true, fuel: 2 } );
	ok( run( 'boil_rags', rags2, pot ), 'at the fire it runs' );
	ok( ! has( rags2 ) && inv.count( 'bandage' ) === 6 && has( pot ), `boil: all three rags became bandages (${inv.count( 'bandage' )}), the pot stays` );
	near( pot.data.amount, 0.8, 1e-9, 'boil: some water boiled off' );
	game.crafting.removeFire( fire );
	take( wipes ); take( pot ); take( rum );
	inv.consume( 'bandage', inv.count( 'bandage' ) );
}

// liquids: pour water into a pot; gasoline into a glass bottle, a rag in, a molotov
{
	const bottle = put( 'water_bottle', 1, { liquid: 'water' } ), pot = put( 'cooking_pot' ); pot.data.liquid = null; pot.data.amount = 0;
	ok( run( 'pour', bottle, pot ), 'pour water into the pot' );
	ok( pot.data.liquid === 'water' && Math.abs( pot.data.amount - 0.5 ) < 1e-9 && bottle.data.amount === 0 && bottle.data.liquid === null, `pot ${pot.data.amount} L ${pot.data.liquid}; bottle empty` );
	const can = put( 'gas_can' ); can.data.amount = 5;
	const glass = put( 'empty_bottle' );
	const acc = K.accepts( can, glass );
	ok( acc?.ok && /Pour into Glass bottle/.test( acc.verb ), 'gas can onto a glass bottle: ' + acc?.verb );
	run( 'pour', can, glass );
	ok( glass.data.liquid === 'fuel' && Math.abs( glass.data.amount - 0.75 ) < 1e-9 && Math.abs( can.data.amount - 4.25 ) < 1e-9, `bottle ${glass.data.amount} L fuel, can ${can.data.amount}` );
	ok( K.state( C.getCombo( 'pour' ), pot, glass ).reason === 'Holds something else' || ! K.find( pot, glass ).some( m => m.combo.id === 'pour' && m.a === pot ), 'no pouring water into gasoline' );
	ok( K.state( C.getCombo( 'pour' ), bottle.data.liquid ? bottle : pot, can ).reason === 'Fuel only', 'a fuel can takes only fuel' );
	ok( ! K.partners( pot ).some( p => p.combo.id === 'pour' && p.b === can ), 'partners: no pouring water into the gas can on offer' );
	const rags = put( 'rags', 6 );
	const m = K.find( rags, glass ).filter( x => x.state.ok );
	ok( m.length === 1 && m[ 0 ].combo.id === 'molotov_rag', 'rags onto the fuel bottle: one way: ' + m.map( x => x.combo.id ) );
	run( 'molotov_rag', rags, glass );
	ok( ! has( glass ) && rags.qty === 5 && inv.count( 'molotov' ) === 1, 'a molotov; bottle and one rag used' );
	// the quick way: an empty bottle, a rag, gasoline from a can you carry
	const glass2 = put( 'empty_bottle' );
	run( 'molotov_fill', rags, glass2 );
	ok( inv.count( 'molotov' ) === 2 && Math.abs( can.data.amount - 3.75 ) < 1e-9, `quick molotov: 0.5 L drawn from the can (${can.data.amount})` );
	// no fuel: refused with the reason
	can.data.amount = 0.1;
	const glass3 = put( 'empty_bottle' );
	const st = K.state( C.getCombo( 'molotov_fill' ), rags, glass3 );
	ok( ! st.ok && /Need 0.5 L gasoline/.test( st.reason ), 'no gasoline: ' + st.reason );
	// spirits: the whole bottle, only when nearly full
	const ok2 = put( 'okolehao' );
	ok( run( 'molotov_spirit', rags, ok2 ) && ! has( ok2 ) && inv.count( 'molotov' ) === 3, 'ʻōkolehao molotov: the bottle is used' );
	const half = put( 'whiskey' ); half.data.left = 1;
	ok( K.state( C.getCombo( 'molotov_spirit' ), rags, half ).reason === 'Bottle too empty', 'a nearly empty bottle refuses' );
	// poi: water drawn from the container on side a
	const taro = put( 'cooked_taro' ); bottle.data.liquid = 'water'; bottle.data.amount = 0.5;
	run( 'pound_poi', bottle, taro );
	ok( ! has( taro ) && inv.count( 'poi' ) === 1 && Math.abs( bottle.data.amount - 0.25 ) < 1e-9, 'poi: taro used, 0.25 L water drawn from the bottle' );
	// electrolytes: the bottle becomes a sports drink in place
	bottle.data.amount = 0.5;
	const mix = put( 'electrolyte_mix', 2 );
	run( 'mix_electrolytes', mix, bottle );
	ok( bottle.id === 'sports_drink' && mix.qty === 1 && has( bottle ), 'electrolytes: the water bottle is a sports drink' );
	for ( const s of [ pot, can, glass3, half, bottle, mix, rags ] ) take( s );
	inv.consume( 'molotov', inv.count( 'molotov' ) ); inv.consume( 'poi', 1 );
}

// tools and check(): arrows need a blade; the solar charger needs the sun
{
	const fe = put( 'feathers', 8 ), st = put( 'stick', 8 );
	const s1 = K.state( C.getCombo( 'make_arrows' ), fe, st );
	ok( ! s1.ok && s1.reason === 'Need a blade', 'arrows need a blade: ' + s1.reason );
	const knife = put( 'kitchen_knife' );
	ok( run( 'make_arrows', fe, st ) && fe.qty === 4 && st.qty === 6 && inv.count( 'arrow' ) === 4, `arrows: 4 feathers, 2 sticks used; 4 arrows (${inv.count( 'arrow' )})` );
	near( knife.cond, 0.99, 1e-9, 'the knife wore a little as a tool' );
	// several combos for one pair: a choice
	const rags = put( 'rags', 4 );
	const acc = K.accepts( rags, st );
	ok( acc?.ok && acc.matches.length === 2 && /Combine \(2\)/.test( acc.verb ), 'rags onto sticks: fire kit or splint (torch needs fuel): ' + acc?.verb );
	const sol = put( 'solar_charger' ), gps = put( 'gps' ); gps.data.charge = 0;
	game.world.sky.sunDir.set( 0, - 0.3, 1 ).normalize();
	ok( K.state( C.getCombo( 'solar_charge' ), sol, gps ).reason === 'Needs sunlight', 'solar at night: refused by check()' );
	game.world.sky.sunDir.set( 0, 1, 0 );
	run( 'solar_charge', sol, gps );
	ok( gps.data.charge > 4 && gps.data.charge < 14 && has( sol ), `solar: charged to ${gps.data.charge.toFixed( 1 )} h, the charger stays` );
	for ( const s of [ fe, st, knife, rags, sol, gps ] ) take( s );
	inv.consume( 'arrow', inv.count( 'arrow' ) );
}

// plain units across stacks; a hammer; noise; the nailed bat keeps the bat's condition
{
	const n1 = put( 'nails', 8 );
	const n2 = makeStack( 'nails', 8 ); inv.pockets.push( n2 ); // a separate pile
	const bat = put( 'baseball_bat' ); bat.cond = 0.6;
	n2.qty = 2;
	ok( K.state( C.getCombo( 'nail_bat' ), n1, bat ).reason === 'Need 12× Nails', 'too few nails: ' + K.state( C.getCombo( 'nail_bat' ), n1, bat ).reason );
	n2.qty = 8;
	ok( K.state( C.getCombo( 'nail_bat' ), n1, bat ).reason === 'Need a hammer', 'the nailed bat needs a hammer' );
	const hammer = put( 'hammer' );
	ok( K.state( C.getCombo( 'nail_bat' ), n1, bat ).ok, '8 + 8 nails count as 16' );
	noises.length = 0;
	run( 'nail_bat', n1, bat );
	ok( ! has( n1 ) && n2.qty === 4 && ! has( bat ), `12 nails used across both piles (${n2.qty} left), the bat used` );
	const nb = inv.find( s => s.id === 'nailed_bat' );
	ok( nb && Math.abs( nb.cond - 0.6 ) < 1e-9, 'the nailed bat keeps the bat\'s condition' );
	ok( noises.length === 1 && noises[ 0 ].radius === 25, 'hammering is heard' );
	take( n2 ); take( hammer ); take( nb );
}

// a shirt with something in its pocket is not cut up; an empty one gives rags
{
	const knife = put( 'kitchen_knife' );
	const worn = makeStack( 'tshirt', 1 ); inv.equip.torso = worn;
	worn.data.items = [ makeStack( 'gold_chain', 1 ) ];
	ok( K.state( C.getCombo( 'cut_rags' ), knife, worn ).reason === 'Empty it first', 'cut up: empty it first' );
	worn.data.items = [];
	run( 'cut_rags', knife, worn );
	ok( ! inv.equip.torso && inv.count( 'rags' ) >= 1, `the shirt became ${inv.count( 'rags' )} rags` );
	inv.consume( 'rags', inv.count( 'rags' ) ); take( knife );
}

// 'all', the open container and the ground: used up where they lie; outputs dropped when there is no room
{
	const other = { label: 'Crate', capacity: 20, items: [] };
	game.app.ui.inventory.other = other;
	const rum = makeStack( 'whiskey', 1 ); other.items.push( rum );
	const rags = makeStack( 'rags', 2 ); const w = { stack: rags }; ground.push( w );
	ok( K.partners( rags ).some( p => p.other === rum && p.combo.id === 'molotov_spirit' ), 'partners: the open container' );
	ok( K.partners( rum ).some( p => p.other === rags ), 'partners: the ground' );
	run( 'molotov_spirit', rags, rum );
	ok( other.items.length === 0 && rags.qty === 1 && ground.length === 1 && inv.count( 'molotov' ) === 1, 'the whiskey from the crate, a rag from the ground pile' );
	run( 'molotov_spirit', rags, ( other.items.push( makeStack( 'rum', 1 ) ), other.items[ 0 ] ) );
	ok( ground.length === 0, 'the last rag on the ground: the world item is removed' );
	game.app.ui.inventory.other = null;
	inv.consume( 'molotov', inv.count( 'molotov' ) );
	// full inventory: the output is dropped
	const keep = { back: inv.equip.back, legs: inv.equip.legs, pockets: inv.pockets };
	delete inv.equip.back; delete inv.equip.legs; inv.pockets = [];
	const knife = makeStack( 'kitchen_knife', 1 ); inv.weapons.melee = knife;
	const fish = makeStack( 'raw_fish', 1 ); ground.push( { stack: fish } );
	inv.pockets.push( makeStack( 'mre', 1 ), makeStack( 'mre', 1 ) ); // pockets full
	dropped.length = 0; toasts.length = 0;
	run( 'fish_bait', knife, fish );
	ok( dropped.some( s => s.id === 'fishing_bait' && s.qty === 4 ) && toasts.includes( 'No room, dropped' ), 'no room: the bait is dropped at your feet' );
	ok( ground.length === 0, 'the fish on the ground was used' );
	delete inv.weapons.melee;
	inv.equip.back = keep.back; inv.equip.legs = keep.legs; inv.pockets = keep.pockets;
}

// use 0 keeps a side; a weapon slot item is used up from its slot
{
	const stone = put( 'stone', 3 ), machete = makeStack( 'machete', 1 ); machete.cond = 0.4; inv.weapons.melee = machete;
	run( 'sharpen_stone', stone, machete );
	ok( stone.qty === 3 && Math.abs( machete.cond - 0.52 ) < 1e-9 && inv.weapons.melee === machete, `sharpen: the stones stay, the machete ${machete.cond.toFixed( 2 )}` );
	machete.cond = 0.7;
	ok( K.state( C.getCombo( 'sharpen_stone' ), stone, machete ).soft, 'a stone only gets an edge to 0.7' );
	const bat = makeStack( 'baseball_bat', 1 ); inv.weapons.melee = bat;
	put( 'nails', 12 ); const hammer = put( 'hammer' );
	run( 'nail_bat', inv.find( s => s.id === 'nails' ), bat );
	ok( inv.weapons.melee?.id === 'nailed_bat', 'a bat in the melee slot: used, and the nailed bat takes the slot' );
	delete inv.weapons.melee; take( stone ); take( hammer );
}

// the action: re-checked when it finishes, cancelled by moving; creative shortens it
{
	const lighter = put( 'lighter' ), torch = put( 'torch' );
	K.run( C.getCombo( 'light_torch' ), lighter, torch );
	ok( game.actions.busy && game.actions.current.combo?.id === 'light_torch' && game.actions.current.time === 2, 'a timed action carries the combo' );
	take( torch );
	finish();
	ok( ! torch.data.on && lighter.data.uses === undefined, 'the torch went before it finished: nothing happens' );
	const t2 = put( 'torch' );
	K.run( C.getCombo( 'light_torch' ), lighter, t2 );
	game.player.pos.set( 3, 0, 0 ); game.actions.update( 0.1 );
	ok( ! game.actions.busy && ! t2.data.on, 'moving cancels it' );
	game.player.pos.set( 0, 0, 0 );
	game.mode = 'creative';
	K.run( C.getCombo( 'light_torch' ), lighter, t2 );
	ok( game.actions.current.time <= 0.3, 'creative: shortened' );
	finish();
	ok( t2.data.on && t2.data.charge > 0 && lighter.data.uses === 119, 'the torch is lit, one use of the lighter' );
	game.mode = 'survival';
	take( lighter ); take( t2 );
}

// purifying: the doses scale with the water
{
	const tabs = put( 'purification_tablets', 1 ), jug = put( 'water_jug' ); jug.data.liquid = 'dirty'; jug.data.amount = 3.8;
	const d = getItem( 'purification_tablets' ).medical;
	const need = Math.ceil( 3.8 / ( d.purify || 1 ) );
	const st = K.state( C.getCombo( 'purify_water' ), tabs, jug );
	ok( need <= 1 ? st.ok : /Need \d+ (tablets|doses)/.test( st.reason ), 'purify: refuses without enough: ' + st.reason );
	tabs.qty = Math.min( getItem( 'purification_tablets' ).stack, need + 1 ); if ( d.uses ) tabs.data.uses = d.uses;
	run( 'purify_water', tabs, jug );
	ok( jug.data.liquid === 'water', 'purified' );
	take( tabs ); take( jug );
}

// cans and coconuts
{
	const opener = put( 'can_opener' ), tuna = put( 'canned_tuna', 3 );
	run( 'open_can', opener, tuna );
	const cans = inv.findAll( s => s.id === 'canned_tuna' );
	ok( cans.length === 2 && cans.some( s => s.qty === 1 && s.data.open && ! s.data.spill ), 'one can opened cleanly with the opener' );
	const coco = put( 'coconut' ), stone = put( 'stone', 1 );
	run( 'crack_coconut', stone, coco );
	ok( coco.id === 'coconut_open', 'a stone cracks a coconut' );
	for ( const s of [ opener, ...cans, coco, stone ] ) take( s );
}

// ---- review fixes ---------------------------------------------------------------------------------------------------
console.log( 'edge cases' );
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back && s !== inv.equip.legs ) take( s ); inv.hotbar.fill( null ); inv.hands = null; };

// labels: a placeholder may appear twice; the chooser's cost line
{
	const tpl = { verb: 'X', label: '{b} and {b} with {a}' };
	ok( C.comboLabel( tpl, makeStack( 'stone', 1 ), makeStack( 'stick', 1 ) ) === 'Sticks and Sticks with Stone' || /^(\S.*) and \1 with /.test( C.comboLabel( tpl, makeStack( 'stone', 1 ), makeStack( 'stick', 1 ) ) ), 'every {b} is filled: ' + C.comboLabel( tpl, makeStack( 'stone', 1 ), makeStack( 'stick', 1 ) ) );
	const rags = put( 'rags', 4 ), st = put( 'stick', 6 );
	const acc = K.accepts( rags, st );
	ok( acc.refused.some( m => m.combo.id === 'make_torch' && /gasoline/.test( m.state.reason ) ), 'rags onto sticks without fuel: the torch is listed as refused, with why' );
	ok( K.cost( C.getCombo( 'make_splint' ), rags, st ) === '2× Rags, 2× ' + getItem( 'stick' ).name, 'cost of a splint: ' + K.cost( C.getCombo( 'make_splint' ), rags, st ) );
	ok( K.cost( C.getCombo( 'insert_batteries' ), makeStack( 'batteries', 2 ), makeStack( 'flashlight', 1 ) ) === null, 'one of each: no cost line' );
	ok( /0\.5 L gasoline/.test( K.cost( C.getCombo( 'molotov_fill' ), rags, makeStack( 'empty_bottle', 1 ) ) ), 'a liquid shows in the cost' );
	clearInv();
}

// making something is not looting: no 'item:pick' (it counts towards the "Looted" stat)
{
	let picks = 0;
	const off = game.events.on( 'item:pick', () => picks ++ );
	const rags = put( 'rags', 4 ), st = put( 'stick', 6 );
	run( 'make_splint', rags, st );
	ok( inv.count( 'splint_improvised' ) === 1 && picks === 0, `a splint made, no pickup event (${picks})` );
	off?.();
	clearInv();
}

// plain units: the unit used takes its per-unit state with it
{
	const cans = put( 'canned_tuna', 3 ); cans.data.open = true; cans.data.spill = 0.1;
	K.consume( cans, 1 );
	ok( cans.qty === 2 && ! cans.data.open && ! cans.data.spill, 'the next can is a fresh, closed one' );
	clearInv();
}

// a bottle of spirits is one unit of its stack, however full: a stack of two (a domain's stackable spirit) loses one
{
	const rags = put( 'rags', 2 ), rum = put( 'rum' ); rum.qty = 2;
	run( 'molotov_spirit', rags, rum );
	ok( rum.qty === 1 && has( rum ) && inv.count( 'molotov' ) === 1, `one bottle used (${rum.qty} left)` );
	clearInv();
}

// bashing cans open: a hammer spills a quarter, a stone more; a knife opens it the clean way only
{
	const hammer = put( 'hammer' ), beans = put( 'canned_tuna', 2 );
	ok( K.find( hammer, beans ).map( m => m.combo.id ).join() === 'bash_can', 'a hammer onto a can: bash it open' );
	ok( K.find( put( 'kitchen_knife' ), beans ).map( m => m.combo.id ).join() === 'open_can', 'a knife onto a can: open it, no bashing' );
	run( 'bash_can', hammer, beans );
	const open = inv.find( s => s.id === 'canned_tuna' && s.data.open );
	ok( open && open.qty === 1 && open.data.spill === 0.25 && beans.qty === 1 && ! beans.data.open, 'one can bashed open, a quarter spilled' );
	near( hammer.cond, 0.98, 1e-9, 'the hammer wore' );
	const stone = put( 'stone', 1 );
	run( 'bash_can', stone, beans );
	ok( beans.data.open && beans.data.spill === 0.3, 'a stone spills more' );
	clearInv();
}

// purifying counts the tablets in every carried strip, as using them up does
{
	const t1 = put( 'purification_tablets', 2 ), t2 = makeStack( 'purification_tablets', 3 ); inv.pockets.push( t2 );
	const jug = put( 'water_jug' ); jug.data.liquid = 'dirty'; jug.data.amount = 3.8;
	const need = Math.ceil( 3.8 / ( getItem( 'purification_tablets' ).medical.purify || 1 ) );
	ok( need <= 5 && K.state( C.getCombo( 'purify_water' ), t1, jug ).ok, `${need} tablets from two strips of 2 and 3` );
	run( 'purify_water', t1, jug );
	ok( jug.data.liquid === 'water' && inv.count( 'purification_tablets' ) === 5 - need, `purified, ${inv.count( 'purification_tablets' )} tablets left` );
	clearInv();
}

// replace() keeps what a pocket held as far as it fits (jeans cut into shorts), the rest goes into your bags
{
	const jeans = makeStack( 'jeans', 1 ); jeans.cond = 0.6;
	const keep = { legs: inv.equip.legs };
	inv.equip.legs = jeans;
	const b1 = makeStack( 'bandage', 1 ), b2 = makeStack( 'bandage', 1 ), chain = makeStack( 'gold_chain', 1 );
	jeans.data.items = [ b1, b2, chain ];
	toasts.length = 0;
	const out = K.replace( jeans, 'board_shorts', {} );
	ok( out === jeans && inv.equip.legs === jeans && jeans.id === 'board_shorts' && Math.abs( jeans.cond - 0.6 ) < 1e-9, 'the worn jeans are shorts in the same slot, same condition' );
	ok( jeans.data.items.length === 1 && jeans.data.items[ 0 ] === b1, 'one bandage still fits in the shorts' );
	ok( has( b2 ) && has( chain ) && toasts.includes( 'Some things fell out' ), 'the rest went into the bags' );
	const tee = put( 'tshirt' ); tee.data.items = [ makeStack( 'batteries', 2 ) ];
	const r = K.replace( tee, 'rags', {} );
	ok( ! r.data.items && inv.count( 'batteries' ) === 2, 'replaced by something with no pockets: the contents are kept in the bags' );
	inv.equip.legs = keep.legs;
	clearInv();
}

// a torch on the ground is picked up before it is lit (only carried lights shine and burn down)
{
	const lighter = put( 'lighter' ), torch = makeStack( 'torch', 1 ); ground.push( { stack: torch } );
	const st = K.state( C.getCombo( 'light_torch' ), lighter, torch );
	ok( ! st.ok && st.reason === 'Pick it up first', 'a torch on the ground: ' + st.reason );
	ground.length = 0;
	clearInv();
}

// the same thing several times over: the partner list offers the one that needs it most
{
	const bat = put( 'batteries', 4 ), f1 = put( 'flashlight' ), f2 = put( 'flashlight' );
	f1.data.charge = 6; f2.data.charge = 1;
	const rows = K.partners( bat ).filter( p => p.combo.id === 'insert_batteries' );
	ok( rows.length === 1 && rows[ 0 ].other === f2, 'two flashlights: one row, the emptier one' );
	clearInv();
}

// a bat bound to a hotbar key and held: the nailed bat takes the key and the hands
{
	const bat = makeStack( 'baseball_bat', 1 ); inv.weapons.melee = bat;
	inv.hotbar[ 3 ] = bat.uid; inv.hands = bat.uid;
	let held = null;
	game.hands = { select: ( s ) => { held = s; inv.hands = s.uid; } };
	put( 'nails', 12 ); put( 'hammer' );
	run( 'nail_bat', inv.find( s => s.id === 'nails' ), bat );
	const nb = inv.find( s => s.id === 'nailed_bat' );
	ok( nb && inv.hotbar[ 3 ] === nb.uid && held === nb, 'hotbar key 4 and the hands moved to the nailed bat' );
	delete game.hands;
	delete inv.weapons.melee;
	clearInv();
}

// died or respawned mid-action: nothing happens to the body's things
{
	const tape = put( 'duct_tape' ), shirt = put( 'tshirt' ); shirt.cond = 0.4;
	K.run( C.getCombo( 'tape_clothing' ), tape, shirt );
	game.dead = true;
	finish(); // (Game does not update actions while dead; a stray finish must still do nothing)
	game.dead = false;
	ok( shirt.cond === 0.4 && tape.data.uses === undefined, 'dead: the patch did not land' );
	K.run( C.getCombo( 'tape_clothing' ), tape, shirt );
	const old = game.player.inventory;
	game.player.inventory = new PlayerInventory();
	finish();
	game.player.inventory = old;
	ok( shirt.cond === 0.4, 'respawned (a fresh inventory): the old action does nothing' );
	clearInv();
}

// save -> load: what combos read lives in the stack data, so it survives a JSON round trip
{
	const glass = put( 'empty_bottle' ); glass.data.liquid = 'fuel'; glass.data.amount = 0.6;
	const tape = put( 'duct_tape' ); tape.data.uses = 2;
	const jeans = put( 'jeans' ); jeans.cond = 0.3;
	put( 'rags', 3 );
	const saved = JSON.parse( JSON.stringify( inv.serialize() ) );
	const old = game.player.inventory;
	const inv2 = new PlayerInventory(); inv2.load( saved );
	game.player.inventory = inv2;
	const g2 = inv2.find( s => s.id === 'empty_bottle' ), r2 = inv2.find( s => s.id === 'rags' ), t2 = inv2.find( s => s.id === 'duct_tape' ), j2 = inv2.find( s => s.id === 'jeans' );
	ok( K.accepts( r2, g2 )?.verb === 'Make molotov', 'after loading: rags onto the gasoline bottle still make a molotov' );
	K.run( C.getCombo( 'molotov_rag' ), r2, g2 ); game.actions.update( 999 );
	K.run( C.getCombo( 'tape_clothing' ), t2, j2 ); game.actions.update( 999 );
	ok( inv2.count( 'molotov' ) === 1 && t2.data.uses === 1 && Math.abs( j2.cond - 0.5 ) < 1e-9, 'loaded stacks combine: molotov made, tape 2 -> 1 use, jeans 0.3 -> 0.5' );
	game.player.inventory = old;
	clearInv();
}

// ---- one action, one menu row: an item-use verb that does a mix stands for it (ItemUse.actions: combos) and the
// inventory's Combine list leaves that mix out; a tool's "Verb X" on something else is only in the Combine list
console.log( 'menu: no action twice' );
{
	clearInv();
	const U = game.itemUse;
	const verbs = ( s ) => U.actions( s );
	const one = ( s, v ) => verbs( s ).find( a => a.verb === v );
	const jeans = put( 'jeans' ); jeans.cond = 0.5;
	const kit = put( 'sewing_kit' ), tape = put( 'duct_tape' ), knife = put( 'kitchen_knife' ), clean = put( 'weapon_cleaning_kit' );
	const glock = put( 'glock17' ); glock.cond = 0.5;
	const lighter = put( 'lighter' ), torch = put( 'torch' ), opener = put( 'can_opener' ), beans = put( 'canned_beans' ), coco = put( 'coconut' );
	const aa = put( 'batteries', 2 ), fl = put( 'flashlight' ); fl.data.charge = 0;
	const tabs = put( 'purification_tablets', 4 ), dirty = put( 'water_bottle' ); dirty.data.liquid = 'dirty'; dirty.data.amount = 0.5;
	// the tools: no one-click "Repair Jeans", "Patch Jeans", "Clean Glock", "Light torch", "Open Baked beans", "Insert into Flashlight"
	for ( const [ s, re ] of [ [ kit, /^Repair / ], [ tape, /^Patch / ], [ clean, /^Clean / ], [ lighter, /^Light torch/ ], [ opener, /^Open / ], [ aa, /^Insert into/ ] ] ) {
		ok( ! verbs( s ).some( a => re.test( a.verb ) ), `${s.id}: no ${re} verb (Combine has it): ${verbs( s ).map( a => a.verb ).join( ', ' )}` );
		ok( K.partners( s ).length > 0, `${s.id}: its Combine list has the mixes` );
	}
	// the things themselves keep their verb, which stands for the mix
	const stands = ( s, v, id ) => ok( one( s, v )?.combos?.some( c => ( c.id || c ) === id ), `${s.id}: "${v}" stands for ${id}` );
	stands( jeans, 'Repair', 'sew_clothing' );
	stands( jeans, 'Rip into rags', 'cut_rags' );
	stands( beans, 'Open', 'open_can' );
	stands( coco, 'Crack open', 'crack_coconut' );
	stands( torch, 'Light', 'light_torch' );
	stands( fl, 'Replace batteries', 'insert_batteries' );
	stands( tabs, 'Purify water', 'purify_water' );
	ok( one( tabs, 'Purify water' ).combos[ 0 ].other === dirty, 'the tablets\' Purify water names the bottle it picks' );
	// what the inventory menu shows: the Combine list without what the verbs stand for (InventoryUI._combineRow)
	const shown = ( s ) => {
		const cov = new Set();
		for ( const a of verbs( s ) ) for ( const c of a.combos || [] ) cov.add( typeof c === 'string' ? c : c.id + '|' + c.other?.uid );
		return K.partners( s ).filter( p => ! cov.has( p.combo.id ) && ! cov.has( p.combo.id + '|' + p.other?.uid ) );
	};
	ok( ! shown( jeans ).some( p => [ 'sew_clothing', 'cut_rags' ].includes( p.combo.id ) ) && shown( jeans ).some( p => p.combo.id === 'tape_clothing' ), 'jeans: Combine keeps the tape patch, not the repair or the rags' );
	ok( ! shown( coco ).some( p => p.combo.id === 'crack_coconut' ), 'coconut: no "Crack Coconut" under Combine' );
	ok( ! shown( fl ).some( p => p.combo.id === 'insert_batteries' ), 'flashlight: no "Insert into Flashlight" under Combine' );
	ok( shown( aa ).some( p => p.combo.id === 'insert_batteries' && p.other === fl ), 'the AAs: Combine offers the flashlight' );
	// a crack with a stone, as the mix allows (no blade carried)
	take( knife ); put( 'stone' );
	verbs( coco ).find( a => a.verb === 'Crack open' ).run(); finish();
	ok( inv.count( 'coconut_open' ) === 1, 'a stone cracks a coconut too' );
	clearInv();
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
