// Weapons module checks (Node, no DOM): every shared weapon id from docs/ARCHITECTURE.md exists with the
// right category, cross references resolve (magazines, calibres, muzzle devices, attachment fits), the schema
// fields the game relies on are present, the balance targets hold, and the magazine / gun operations behave.
//   node test/weapons.mjs
import fs from 'node:fs';
import { getItem, makeStack, ammoOf, allItems } from '../src/game/items/ItemDB.js';
import { WEAPON_IDS, BALLISTIC } from '../src/game/items/defs/firearms.js';
import * as ops from '../src/weapons/ops.js';
import { PlayerInventory } from '../src/game/Inventory.js';

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// ---- the shared id list, straight from the architecture doc ------------------------------------------
const doc = fs.readFileSync( new URL( '../docs/ARCHITECTURE.md', import.meta.url ), 'utf8' );
const section = doc.split( 'Owned by Weapons' )[ 1 ].split( 'Owned by Items' )[ 0 ];
const groups = {};
let cur = null;
for ( const line of section.split( '\n' ) ) {
	const m = line.match( /^\s*-?\s*(Pistols|SMGs|Rifles|Precision \/ hunting|Shotguns|LMGs|Bows|Ammo|Magazines|Attachments|Melee|Throwables):\s*(.*)$/ );
	let rest = line;
	if ( m ) { cur = m[ 1 ]; rest = m[ 2 ]; }
	if ( ! cur ) continue;
	// "LMGs: m249, pkm      Bows: compound_bow, crossbow" sits on one line
	for ( const part of rest.split( /\s{3,}/ ) ) {
		const mm = part.match( /^(Bows|LMGs):\s*(.*)$/ );
		const g = mm ? mm[ 1 ] : cur;
		const ids = ( mm ? mm[ 2 ] : part ).split( ',' ).map( s => s.trim() ).filter( s => /^[a-z0-9_]+$/.test( s ) );
		( groups[ g ] ||= [] ).push( ...ids );
		if ( mm ) cur = g;
	}
}
const CAT = {
	Pistols: 'firearm', SMGs: 'firearm', Rifles: 'firearm', 'Precision / hunting': 'firearm', Shotguns: 'firearm', LMGs: 'firearm', Bows: 'firearm',
	Ammo: 'ammo', Magazines: 'magazine', Attachments: 'attachment', Melee: 'melee', Throwables: 'throwable',
};
const shared = Object.values( groups ).flat();
console.log( `shared ids: ${shared.length} (${Object.entries( groups ).map( ( [ k, v ] ) => k + ' ' + v.length ).join( ', ' )})` );
ok( shared.length > 120, 'parsed the shared id list from the doc' );
for ( const [ g, ids ] of Object.entries( groups ) ) for ( const id of ids ) {
	const d = getItem( id );
	ok( !! d, `${id} is defined` );
	if ( d ) ok( d.cat === CAT[ g ], `${id} is a ${CAT[ g ]} (got ${d.cat})` );
}
// nothing extra that the rest of the game doesn't know about
for ( const id of Object.values( WEAPON_IDS ).flat() ) ok( shared.includes( id ), `${id} is in the shared list` );

// ---- schema + cross references ------------------------------------------------------------------------
const calibers = new Set( allItems().filter( d => d.cat === 'ammo' ).map( d => d.ammo.caliber ) );
const RAR = [ 'common', 'uncommon', 'rare', 'epic', 'legendary' ];
for ( const d of allItems().filter( d => WEAPON_IDS.firearms.includes( d.id ) || d.cat !== 'firearm' ) ) {
	if ( ! [ 'firearm', 'ammo', 'magazine', 'attachment', 'melee', 'throwable' ].includes( d.cat ) ) continue;
	ok( d.name && d.desc, `${d.id} has a name and description` );
	ok( d.weight > 0 && d.size > 0 && d.stack >= 1, `${d.id} weight/size/stack` );
	ok( RAR.includes( d.rarity ), `${d.id} rarity` );
	ok( Array.isArray( d.tags ) && d.tags.length, `${d.id} has loot tags` );
	ok( d.model && d.model.type, `${d.id} has a model spec` );
}
for ( const id of WEAPON_IDS.firearms ) {
	const d = getItem( id ), f = d.firearm;
	ok( [ 'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'lmg', 'bow' ].includes( f.cls ), `${id} class` );
	ok( calibers.has( f.caliber ), `${id} calibre ${f.caliber} has ammo` );
	ok( f.feed === 'mag' || f.feed === 'internal', `${id} feed` );
	if ( f.feed === 'mag' ) {
		ok( f.mags?.length > 0, `${id} lists magazines` );
		for ( const m of f.mags || [] ) {
			const md = getItem( m );
			ok( md?.cat === 'magazine', `${id} magazine ${m} exists` );
			if ( md ) ok( md.magazine.caliber === f.caliber, `${id} magazine ${m} calibre ${md.magazine.caliber} = ${f.caliber}` );
		}
	} else ok( f.capacity >= 1, `${id} internal capacity` );
	ok( f.modes?.length && f.modes.every( m => ops.MODE_LABEL[ m ] ), `${id} fire modes` );
	for ( const k of [ 'rpm', 'damage', 'velocity', 'range', 'recoil', 'ads', 'noise', 'reload', 'handling' ] ) ok( f[ k ] > 0, `${id} ${k} > 0` );
	ok( f.spread >= 0 && f.hip >= 0, `${id} spread` );
	ok( f.slot === 'primary' || f.slot === 'sidearm', `${id} slot` );
	ok( typeof f.sound === 'string', `${id} sound` );
	for ( const m of f.muzzles || [] ) {
		const a = getItem( m );
		ok( a?.attachment?.slot === 'muzzle', `${id} muzzle ${m} is a muzzle device` );
		ok( ( f.rails || [] ).includes( 'muzzle' ), `${id} lists muzzles but has no muzzle rail` );
		if ( a ) ok( ops.attachmentFits( d, a ).ok, `${m} fits ${id}` );
	}
	ok( [ 'semi', 'auto', 'bolt', 'pump', 'lever', 'revolver', 'break', 'bow', 'crossbow', 'open' ].includes( f.action ), `${id} action ${f.action}` );
	if ( [ 'bolt', 'pump', 'lever' ].includes( f.action ) ) ok( f.boltTime > 0, `${id} boltTime` );
	if ( f.feed === 'internal' ) ok( f.perRound > 0, `${id} perRound` );
	ok( d.model.arch, `${id} model archetype` );
}
for ( const id of WEAPON_IDS.ammo ) {
	const a = getItem( id ).ammo;
	ok( BALLISTIC[ a.caliber ], `${id} ballistics for ${a.caliber}` );
	ok( a.pen >= 0 && a.drag > 0, `${id} pen/drag` );
	ok( allItems().some( d => d.firearm?.caliber === a.caliber ), `${id} is used by some gun` );
}
for ( const id of WEAPON_IDS.magazines ) {
	const m = getItem( id ).magazine;
	ok( calibers.has( m.caliber ) && m.capacity > 0, `${id} calibre/capacity` );
	ok( allItems().some( d => d.firearm?.mags?.includes( id ) ), `${id} fits some gun` );
}
for ( const id of WEAPON_IDS.attachments ) {
	const a = getItem( id );
	ok( [ 'optic', 'muzzle', 'light' ].includes( a.attachment.slot ), `${id} slot` );
	const fitsAny = allItems().some( d => d.firearm && ops.attachmentFits( d, a ).ok );
	ok( fitsAny, `${id} fits at least one gun` );
	if ( a.attachment.slot === 'optic' ) ok( a.attachment.zoom >= 1 && a.attachment.reticle, `${id} zoom/reticle` );
}
for ( const id of WEAPON_IDS.melee ) {
	const m = getItem( id ).melee;
	ok( m.damage > 0 && m.speed > 0 && m.reach > 1 && m.stamina > 0 && m.wear > 0, `${id} melee numbers` );
	ok( [ 'blade', 'blunt', 'axe', 'spear', 'fist' ].includes( m.kind ), `${id} melee kind` );
}
// the tools the survival systems look for
for ( const [ id, tool ] of [ [ 'kitchen_knife', 'cut' ], [ 'kitchen_knife', 'open_can' ], [ 'hunting_knife', 'skin' ], [ 'combat_knife', 'open_can' ], [ 'crowbar', 'pry' ], [ 'hatchet', 'chop' ], [ 'fire_axe', 'chop' ], [ 'shovel', 'dig' ] ] ) {
	ok( getItem( id ).melee.tools.includes( tool ), `${id} works as a ${tool} tool` );
}
for ( const id of WEAPON_IDS.throwables ) {
	const t = getItem( id ).throwable;
	ok( [ 'frag', 'smoke', 'flashbang', 'molotov' ].includes( t.kind ) && t.radius > 0, `${id} throwable` );
}

// ---- balance -------------------------------------------------------------------------------------------
// the infected have ~100 hp; heads take x4, limbs x0.6 (see Ballistics.js ZONE)
const HEAD = 4, ZOMBIE = 100;
for ( const id of WEAPON_IDS.firearms ) {
	const f = getItem( id ).firearm;
	if ( f.cls === 'bow' ) { ok( f.damage >= 60, `${id} bow kills in 2 body hits` ); continue; }
	// a shotgun's head shot lands at least a few pellets
	ok( f.damage * Math.min( f.pellets || 1, 3 ) * HEAD >= ZOMBIE, `${id} headshot kills (${f.damage} x ${HEAD})` );
	const hits = Math.ceil( ZOMBIE / ( f.damage * ( f.pellets || 1 ) ) );
	if ( f.cls === 'rifle' || f.cls === 'sniper' || f.cls === 'lmg' ) ok( hits >= 1 && hits <= 4, `${id} kills in 1-4 body hits (${hits})` );
	if ( f.cls === 'shotgun' ) ok( f.damage * f.pellets >= ZOMBIE, `${id} one-shots up close` );
}
ok( getItem( 'ruger_mk4' ).firearm.damage < getItem( 'glock17' ).firearm.damage, '.22 is weaker than 9 mm' );
ok( getItem( 'ruger_mk4' ).firearm.noise < getItem( 'glock17' ).firearm.noise, '.22 is quieter than 9 mm' );
for ( const id of WEAPON_IDS.melee ) {
	const m = getItem( id ).melee;
	const hits = Math.ceil( ZOMBIE / m.damage );
	ok( hits >= 1 && hits <= 5, `${id} kills in 1-5 swings (${hits})` );
}

// ---- operations -----------------------------------------------------------------------------------------
const inv = new PlayerInventory();
// pockets are tiny without clothes: give the test body a big pocket
inv.pockets = [];
inv.containers = function () { return [ { key: 'pockets', label: 'Pockets', capacity: 200, items: this.pockets, owner: null } ]; };

const m4 = makeStack( 'm4a1', 1, { full: true } );
ok( ammoOf( m4 ) === 31, 'full M4 = 30 + 1' );
inv.add( m4 );
ok( inv.weapons.primary === m4, 'M4 on the shoulder' );
const mag2 = makeStack( 'mag_stanag30' );
const ammo = makeStack( 'ammo_556', 60 );
ok( ops.loadMagazine( mag2, ammo ) === 30 && mag2.data.rounds === 30 && ammo.qty === 30, 'load 30 into a STANAG' );
ok( ops.loadMagazine( mag2, ammo ) === 0, 'a full magazine takes no more' );
const bad = makeStack( 'ammo_9mm', 20 );
ok( ops.loadMagazine( makeStack( 'mag_stanag30' ), bad ) === 0 && bad.qty === 20, 'wrong calibre is refused' );
inv.add( mag2 ); inv.add( ammo );
ok( ops.bestMagazine( inv, m4 ) === null, 'no reload needed with a full mag in' );
for ( let i = 0; i < 30; i ++ ) ok( ops.consumeRound( m4 ) === 'ammo_556', 'fires' );
ok( m4.data.chamber === 1 && m4.data.mag.data.rounds === 0, 'semi-auto feeds from the magazine' );
ok( ops.consumeRound( m4 ) && ! ops.readyToFire( m4 ), 'last round then empty' );
ok( ops.bestMagazine( inv, m4 ) === mag2, 'reload picks the full spare' );
ok( ops.reserveFor( inv, m4 ) === 60, 'reserve = spare mag + loose rounds' );
const unl = ops.unloadMagazine( mag2 );
ok( unl.id === 'ammo_556' && unl.qty === 30 && mag2.data.rounds === 0, 'empty a magazine' );

// pump shotgun: tube + chamber, manual cycle
const sg = makeStack( 'remington_870', 1, { full: true } );
ops.sanitizeGun( sg );
ok( ammoOf( sg ) === 6, '870 full = 5 + 1' );
ok( ops.consumeRound( sg ) && ! ops.readyToFire( sg ) && ops.canChamber( sg ), 'pump needs a pump after a shot' );
ok( ops.chamberRound( sg ) && ops.readyToFire( sg ) && sg.data.rounds === 4, 'pumping chambers the next shell' );
const buck = makeStack( 'ammo_12ga_slug', 10 );
ok( ops.loadInternal( sg, buck ) === 1 && sg.data.rounds === 5 && sg.data.ammo === 'ammo_12ga_slug' && buck.qty === 9, 'shells into the tube' );

// revolver: everything in the cylinder, never 7 in a 6-shooter
const rv = ops.sanitizeGun( makeStack( 'revolver_357', 1, { full: true } ) );
ok( ammoOf( rv ) === 6 && rv.data.chamber === 0, 'revolver holds exactly 6' );
for ( let i = 0; i < 6; i ++ ) ops.consumeRound( rv );
ok( ! ops.readyToFire( rv ) && ops.internalRoom( rv ) === 6, 'revolver empty after 6' );

// double barrel
const db = ops.sanitizeGun( makeStack( 'double_barrel', 1, { full: true } ) );
ok( ammoOf( db ) === 2, 'double barrel holds 2' );

// open bolt: fires straight from the magazine
const uzi = ops.sanitizeGun( makeStack( 'uzi', 1, { full: true } ) );
let shots = 0;
while ( ops.consumeRound( uzi ) ) shots ++;
ok( shots === 33, `Uzi empties 32 + 1 (${shots})` );

// unload a gun
const g17 = makeStack( 'glock17', 1, { full: true } );
const out = ops.unloadGun( g17 );
ok( out.mag?.id === 'mag_glock17' && out.mag.data.rounds === 17 && out.rounds[ 0 ]?.qty === 1 && ammoOf( g17 ) === 0, 'unload: mag out + chambered round' );

// attachments
ok( ops.attachmentFits( getItem( 'm4a1' ), getItem( 'optic_acog' ) ).ok, 'ACOG on an M4' );
ok( ! ops.attachmentFits( getItem( 'glock17' ), getItem( 'optic_acog' ) ).ok, 'no ACOG on a Glock' );
ok( ops.attachmentFits( getItem( 'glock17' ), getItem( 'supp_pistol' ) ).ok, 'suppressor on a Glock' );
ok( ! ops.attachmentFits( getItem( 'desert_eagle' ), getItem( 'supp_pistol' ) ).ok, 'no suppressor on a Deagle' );
ok( ops.attachmentFits( getItem( 'svd' ), getItem( 'optic_pso1' ) ).ok, 'PSO-1 on an SVD' );
ok( ! ops.attachmentFits( getItem( 'm4a1' ), getItem( 'optic_pso1' ) ).ok, 'no PSO-1 on an M4' );

// giving rounds back splits into full stacks
const inv2 = new PlayerInventory();
inv2.pockets = [];
inv2.containers = function () { return [ { key: 'pockets', label: 'Pockets', capacity: 50, items: this.pockets, owner: null } ]; };
ops.giveRounds( inv2, 'ammo_9mm', 120 );
ok( inv2.count( 'ammo_9mm' ) === 120, 'giveRounds keeps every round' );

// ---- models (headless geometry build, no DOM) ------------------------------------------------------------
try {
	const GM = await import( '../src/weapons/GunModels.js' );
	let worst = 0, worstId = '';
	for ( const id of WEAPON_IDS.firearms ) {
		const d = getItem( id );
		const data = GM.gunData( d );
		ok( data.info.muzzle && data.info.grips?.R, `${id} model has a muzzle and grips` );
		if ( d.firearm.feed === 'mag' ) ok( !! data.info.mag, `${id} model has a magwell` );
		if ( ( d.firearm.rails || [] ).includes( 'optic' ) ) ok( !! data.info.optic, `${id} model has an optic mount` );
		const { obj } = GM.buildGunView( d, 'world' );
		const tris = GM.countTris( obj );
		if ( tris > worst ) { worst = tris; worstId = id; }
		ok( tris < 9000, `${id} triangles ${tris}` );
	}
	console.log( `heaviest gun model: ${worstId} ${worst | 0} tris` );
	for ( const id of [ ...WEAPON_IDS.magazines, ...WEAPON_IDS.attachments, ...WEAPON_IDS.melee, ...WEAPON_IDS.throwables ] ) {
		const d = getItem( id );
		let n = 0;
		try {
			const o = d.cat === 'magazine' ? GM.buildMagView( d, 'world' ) : d.cat === 'attachment' ? GM.buildAttachmentView( d, 'world' ).obj : d.cat === 'melee' ? GM.buildMeleeView( d, 'world' ).obj : GM.buildThrowableView( d, 'world' );
			n = GM.countTris( o );
		} catch ( e ) { console.error( e ); }
		ok( n > 0 && n < 6000, `${id} model builds (${n | 0} tris)` );
	}
} catch ( e ) {
	console.log( 'model checks skipped:', e.message );
}

// ---- first-person arms: the rig builds, fingers close further round thinner grips, the hand frame is a rotation --------
try {
	const THREE = await import( 'three' );
	const A = await import( '../src/weapons/Arms.js' );
	for ( const side of [ 1, - 1 ] ) {
		const arm = new A.Arm( side );
		ok( arm.bones.length === 18 && arm.skin.skeleton, `arm ${side} rig` );
		const tris = arm.skin.geometry.index.count / 3;
		ok( tris > 3000 && tris < 12000, `arm ${side} skin ${tris} tris` );
		const g = { p: new THREE.Vector3( 0.1, - 0.1, - 0.4 ), a: new THREE.Vector3( 0.3, 0.95, 0 ).normalize(), n: new THREE.Vector3( 0, 0.1, 1 ).normalize(), r: 0.017 };
		const m = A.wristMatrix( g, side );
		const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
		m.extractBasis( x, y, z );
		ok( Math.abs( x.length() - 1 ) < 1e-6 && Math.abs( x.dot( y ) ) < 1e-6 && Math.abs( m.determinant() - 1 ) < 1e-6, `arm ${side} wrist frame is a rotation` );
		arm.setCurl( A.curlFor( 0.017 ), A.THUMB_POSE.wrap );
		arm.pose( new THREE.Vector3( side * 0.19, - 0.25, 0.1 ), m );
		arm.skin.updateMatrixWorld( true );
		const w = new THREE.Vector3().setFromMatrixPosition( arm.wrist.matrixWorld ), want = new THREE.Vector3().setFromMatrixPosition( m );
		ok( w.distanceTo( want ) < 1e-4, `arm ${side} puts the wrist where it is asked (${w.distanceTo( want ).toFixed( 5 )})` );
		const e = arm.foreBone.getWorldPosition( new THREE.Vector3() );
		ok( Math.abs( e.distanceTo( w ) - A.FORE_LEN ) < 1e-4, `arm ${side} forearm keeps its length` );
	}
	const sum = ( c ) => c.reduce( ( s, f ) => s + f[ 0 ] + f[ 1 ] + f[ 2 ], 0 );
	ok( sum( A.curlFor( 0.01 ) ) > sum( A.curlFor( 0.02 ) ) && sum( A.curlFor( 0.02 ) ) > sum( A.curlFor( 0.04 ) ), 'fingers close further round thinner grips' );
	for ( const r of [ 0.004, 0.012, 0.02, 0.03, 0.05 ] ) ok( A.curlFor( r ).every( f => f.every( a => a >= 0 && a <= 2 ) ), `curl angles in range for r ${r}` );
} catch ( e ) {
	fails ++; console.error( '  ✗ arms:', e.message );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
