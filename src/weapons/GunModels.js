// Procedural weapon models: a parametric gun generator (AR / AK / pistols / revolvers / SMGs / shotguns / bolt
// actions / battle rifles / bullpups / LMGs / bows), magazines, ammo boxes, attachments, melee weapons and
// throwables. Every model is assembled from bevelled boxes, lathed and extruded profiles, merged per material.
//
// Gun frame: +x towards the muzzle, +y up, +z = the gun's right side (ejection port), bore axis on y = 0,
// x = 0 at the trigger. Moving parts (slide, bolt, pump, cylinder, barrels, lever, trigger, hammer, mag…) are
// separate groups with their pivot at the group origin so the view model can animate them.
//
// Item models (ItemModels.js convention): lying on the ground, origin at the centre of the bottom face, long axis +x.
// The first-person view builds its own upright copy with unfogged materials: buildGunView( def ).
//
// The toolkit (finishes, Parts, cartridges, grips) is models/kit.js; each family draws in its own models/*.js.
import * as THREE from 'three';
import { registerModelBuilder } from '../render/ItemModels.js';
import { getItem } from '../game/items/ItemDB.js';
import { Parts, instantiate, weaponMaterials, PI } from './models/kit.js';
import { magParts } from './models/mags.js';
import { arRifle } from './models/ar.js';
import { akRifle, svd } from './models/ak.js';
import { pistol, revolver, flareGun } from './models/pistols.js';
import { smg } from './models/smg.js';
import { pumpShotgun, doubleBarrel } from './models/shotguns.js';
import { boltRifle, leverRifle, mosin, barrett } from './models/bolt.js';
import { mini14, sks } from './models/rifles.js';
import { scar, g36, aug, fal, ebr } from './models/modern.js';
import { mg, bow } from './models/mg.js';
import { attachmentParts } from './models/attachments.js';
import { meleeParts } from './models/melee.js';
import { throwableParts } from './models/throw.js';
import { ammoBoxModel } from './models/ammo.js';

export { weaponMaterials, shape, Parts, instantiate, countTris, cartridge, CALIBERS } from './models/kit.js';
export { magParts, attachmentParts, meleeParts, throwableParts };

// ---- dispatch + caches ------------------------------------------------------------------------------------------------

const ARCH = {
	ar: arRifle, ak: akRifle, pistol, revolver, flare: flareGun,
	mp5: smg, uzi: smg, mp7: smg, vector: smg, mac10: smg, ump: smg,
	pump: pumpShotgun, spas: pumpShotgun, double: doubleBarrel,
	bolt: boltRifle, lever: leverRifle, mosin, svd, mini14, sks,
	scar, g36, aug, fal, ebr,
	barrett, m249: mg, pkm: mg, bow, crossbow: bow,
};

const GUN_CACHE = new Map();
// baked geometry + info for a firearm def (shared by the world model and the view model)
export function gunData( def ) {
	if ( GUN_CACHE.has( def.id ) ) return GUN_CACHE.get( def.id );
	const spec = def.model || {};
	const fn = ARCH[ spec.arch ] || arRifle;
	const r = fn( spec );
	const { P, info } = r;
	// optic mounts for guns without a top rail
	if ( info.optic && ( info.opticParts || [] ).includes( 'mount' ) && ! P.subs.mount ) {
		const [ ox, oy ] = info.optic;
		const m = P.sub( 'mount', ox, oy - 0.02, 0 );
		const rb = oy - 0.0038;
		m.box( 'blk', ox - 0.05, ox + 0.05, rb - 0.022, rb - 0.005, - 0.012, 0.012, 0.003 );
		m.rail( 'blk', ox - 0.055, ox + 0.055, rb, 0.0105 );
	}
	const baked = P.bake();
	const data = { baked, info, def };
	GUN_CACHE.set( def.id, data );
	return data;
}

const MAG_CACHE = new Map();
export function magData( def ) {
	if ( MAG_CACHE.has( def.id ) ) return MAG_CACHE.get( def.id );
	const d = { baked: magParts( def ).bake() };
	MAG_CACHE.set( def.id, d );
	return d;
}

// Upright copy for the first-person view (mode 'view': unfogged materials lit by the view scene): { obj, info, parts }
export function buildGunView( def, mode = 'view' ) {
	const data = gunData( def );
	const mats = weaponMaterials( mode );
	const obj = instantiate( data.baked, mats, false );
	const parts = obj.userData.parts;
	if ( parts.mount ) parts.mount.visible = false;
	return { obj, info: data.info, parts };
}

export function buildMagView( def, mode = 'view' ) {
	const obj = instantiate( magData( def ).baked, weaponMaterials( mode ), false );
	obj.name = def.id;
	return obj;
}

// lay an upright model on its right side... (left side down), bottom at y = 0, centred
function layDown( inner, rotX = - PI / 2 ) {
	const g = new THREE.Group();
	inner.rotation.x = rotX;
	g.add( inner );
	inner.updateMatrixWorld( true );
	const box = new THREE.Box3().setFromObject( inner );
	inner.position.set( - ( box.min.x + box.max.x ) / 2, - box.min.y, - ( box.min.z + box.max.z ) / 2 );
	return g;
}

registerModelBuilder( 'gun', ( spec, def ) => {
	const data = gunData( def );
	const mats = weaponMaterials();
	const inner = instantiate( data.baked, mats, true );
	if ( inner.userData.parts.mount ) inner.userData.parts.mount.visible = false;
	const f = def.firearm;
	if ( f?.feed === 'mag' && f.mags?.length && data.info.mag ) {
		const mdef = getItem( f.mags[ 0 ] );
		if ( mdef ) {
			const m = instantiate( magData( mdef ).baked, mats, true );
			m.position.set( ...data.info.mag.p ); m.rotation.z = data.info.mag.rake || 0;
			inner.add( m );
		}
	}
	return layDown( inner );
} );

registerModelBuilder( 'mag', ( spec, def ) => {
	const inner = instantiate( magData( def ).baked, weaponMaterials(), true );
	return layDown( inner );
} );

const ATT_CACHE = new Map();
export function attachmentData( def ) {
	if ( ATT_CACHE.has( def.id ) ) return ATT_CACHE.get( def.id );
	const { P, info } = attachmentParts( def );
	const d = { baked: P.bake(), info };
	ATT_CACHE.set( def.id, d );
	return d;
}
export function buildAttachmentView( def, mode = 'view' ) {
	const d = attachmentData( def );
	return { obj: instantiate( d.baked, weaponMaterials( mode ), false ), info: d.info };
}
registerModelBuilder( 'attachment', ( spec, def ) => {
	const d = attachmentData( def );
	const inner = instantiate( d.baked, weaponMaterials(), true );
	return layDown( inner, spec.kind === 'supp' || spec.kind === 'light' ? 0 : 0 );
} );

const MELEE_CACHE = new Map();
export function meleeData( def ) {
	if ( MELEE_CACHE.has( def.id ) ) return MELEE_CACHE.get( def.id );
	const { P, info } = meleeParts( def );
	const d = { baked: P.bake(), info };
	MELEE_CACHE.set( def.id, d );
	return d;
}
export function buildMeleeView( def, mode = 'view' ) {
	const d = meleeData( def );
	return { obj: instantiate( d.baked, weaponMaterials( mode ), false ), info: d.info };
}
registerModelBuilder( 'melee', ( spec, def ) => layDown( instantiate( meleeData( def ).baked, weaponMaterials(), true ), meleeData( def ).info.flat ? 0 : - PI / 2 ) );

const THROW_CACHE = new Map();
export function throwableData( def ) {
	if ( THROW_CACHE.has( def.id ) ) return THROW_CACHE.get( def.id );
	const d = { baked: throwableParts( def ).P.bake() };
	THROW_CACHE.set( def.id, d );
	return d;
}
export function buildThrowableView( def, mode = 'view' ) { return instantiate( throwableData( def ).baked, weaponMaterials( mode ), false ); }
registerModelBuilder( 'throwable', ( spec, def ) => {
	const inner = instantiate( throwableData( def ).baked, weaponMaterials(), true );
	// spec.lay: how a long thrown thing lies (a knife, a string of firecrackers: on its side)
	return layDown( inner, spec.lay ?? ( spec.kind === 'molotov' ? PI / 2 : 0 ) );
} );

registerModelBuilder( 'ammo_box', ammoBoxModel );
