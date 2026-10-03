// The arms domain's numbers and pure rules (docs/ITEMS_PLAN.md "arms"), Node-safe: no three.js, no DOM. The defs,
// the thrown-thing kinds (throw.js), the placed tripwire (kinds.js), the runtime (runtime.js) and test/ext-arms.mjs
// all read them from here.
import { getItem } from '../../ItemDB.js';

export const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );

// ---- classes of gun ----------------------------------------------------------------------------------------------

// long guns take the rail-free fittings (a sling, a stock wrap, a bayonet, a taped-on light)
export const LONG = [ 'rifle', 'shotgun', 'sniper', 'lmg', 'smg' ];
// a bayonet wants a barrel to sit under: rifles, shotguns and bolt guns
export const BAYONET_FITS = [ 'rifle', 'shotgun', 'sniper' ];
export const isLong = ( d ) => !! d?.firearm && LONG.includes( d.firearm.cls );

// parts kits by class: what each mends
export const KIT_CLASSES = {
	parts_pistol: [ 'pistol' ],
	parts_rifle: [ 'rifle', 'sniper', 'smg', 'lmg' ],
	parts_shotgun: [ 'shotgun' ],
};
export const kitFits = ( kitId, gunDef ) => !! gunDef?.firearm && ( KIT_CLASSES[ kitId ] || [] ).includes( gunDef.firearm.cls );

// ---- gun care ------------------------------------------------------------------------------------------------------

export const CARE = {
	oil: { repair: 0.1, max: 0.85, time: 4 },          // a few drops of gun oil and a rag
	bore: { repair: 0.3, max: 0.97, time: 10 },        // the cleaning rod through the bore, oiled
	kit: { repair: 0.45, max: 1, time: 12 },           // new springs and pins
	blade: { repair: 0.08, max: 0.9, time: 3 },        // oil on a blade keeps the rust off
	whet: { repair: 0.22, max: 0.95, time: 6 },        // a whetstone puts a real edge back
};

// ---- thrown things -------------------------------------------------------------------------------------------------

// firecrackers: a fuse, then pops in quick bursts for `dur` seconds; every `every` s a pulse of noise the infected hear
export const FIRECRACKER = {
	firecracker_string: { fuse: 1.6, pops: 36, dur: 6, noise: 55, every: 0.5, flash: 1 },
	firecracker_roll: { fuse: 2.4, pops: 150, dur: 18, noise: 80, every: 0.5, flash: 1.5 },
};

// the pop times of a string: bursts of rapid pops with short gaps, front-loaded like a real string. rnd: [0,1)
export function popTimes( spec, rnd = Math.random ) {
	const out = [];
	let t = 0;
	while ( out.length < spec.pops && t < spec.dur ) {
		const burst = 3 + Math.floor( rnd() * 7 );
		for ( let i = 0; i < burst && out.length < spec.pops && t < spec.dur; i ++ ) { out.push( t ); t += 0.03 + rnd() * 0.07; }
		t += 0.05 + rnd() * 0.3;
	}
	return out;
}

// what a hit does where it lands (thrown knives, slingshot shot): head shots count most
export const ZONE_MULT = { head: 2.5, torso: 1, arm: 0.6, leg: 0.6 };
export const hitDamage = ( base, zone, speedK = 1 ) => base * ( ZONE_MULT[ zone ] ?? 1 ) * clamp( speedK, 0.3, 1.1 );

export const KNIFE_THROW = { dmg: 42, speed: 21, up: 0.06, keep: 1 };

// the slingshot: steel shot hits harder and is often found again, a stone is everywhere
export const SLING = {
	speed: 52, cooldown: 0.7, noise: 6, wear: 0.004,
	// (the infected take blunt head hits harder still: a steel ball to the head nearly drops one)
	ammo: { steel_shot: { dmg: 26, keep: 0.6 }, stone: { dmg: 18, keep: 0.75 } },
	order: [ 'steel_shot', 'stone' ],
};

// a thrown alarm clock rings this soon after it lands; a thrown radio plays
export const THROWN_ALARM = { delay: 3, speed: 13 };

// ---- noise makers --------------------------------------------------------------------------------------------------

export const HORN = {
	air_horn: { radius: 130, sound: 'arms_airhorn' },
	party_horn: { radius: 22, sound: 'arms_partyhorn' },
};

// ---- the can tripwire ----------------------------------------------------------------------------------------------

// a 2.6 m line between two stakes; anything that walks through it within `radius` rattles the cans
export const TRIP = { len: 2.6, radius: 0.32, noise: 26, hornNoise: 140, warn: 90, reset: 3 };

// the line's ends from a placed record (yaw turns local +x: (cos, -sin) in x / z, as three.js does)
export function tripEnds( pos, yaw, len = TRIP.len ) {
	const cx = Math.cos( yaw ) * len / 2, cz = - Math.sin( yaw ) * len / 2;
	return [ pos.x - cx, pos.z - cz, pos.x + cx, pos.z + cz ];
}

// distance from a point to a segment in the ground plane
export function segDist( px, pz, ax, az, bx, bz ) {
	const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
	const t = L > 0 ? clamp( ( ( px - ax ) * dx + ( pz - az ) * dz ) / L, 0, 1 ) : 0;
	return Math.hypot( px - ( ax + dx * t ), pz - ( az + dz * t ) );
}

// does something at (x, z) with this radius cross the line
export function crossesTrip( e, pos, yaw, r = 0.3 ) {
	const [ ax, az, bx, bz ] = tripEnds( pos, yaw );
	return segDist( e.x, e.z, ax, az, bx, bz ) < TRIP.radius + r * 0.5;
}

// ---- armour --------------------------------------------------------------------------------------------------------

// arm guards taped or strapped over the sleeves of a top: bite protection added to the garment (stack.data.mods.bite)
export const GUARDS = { magazine_guards: 0.3, kevlar_sleeves: 0.42 };

// the riot shield: blocks bites and blows that come from the front, at a cost in stamina and wear
export const SHIELD = { cos: 0.42, stamina: 7, minStamina: 4, wear: 0.015, slow: 0.9, kinds: [ 'bite', 'scratch', 'melee', 'animal' ] };

// the attacker is in front of you: dir points from the attacker to you, look is where you face (x / z)
export function inFront( dir, look, cos = SHIELD.cos ) {
	const L = Math.hypot( look.x, look.z ) || 1, D = Math.hypot( dir.x, dir.z ) || 1;
	return - ( dir.x * look.x + dir.z * look.z ) / ( L * D ) > cos;
}

// ---- small helpers -------------------------------------------------------------------------------------------------

// a knife small enough to tape under a barrel or onto a pole
export const smallBlade = ( d ) => !! d?.melee && d.melee.kind === 'blade' && ! d.melee.twoHanded && d.size <= 1;

// a gun's attachment in a slot, if any
export const attIn = ( gun, slot ) => gun?.data?.att?.[ slot ] || null;

// a magazine or a comic to roll round a forearm (the leisure domain tags theirs 'magazine' / 'comic')
export const rollable = ( d ) => !! d && d.cat === 'book' && ( d.id === 'comic_book' || d.tags.includes( 'magazine' ) || d.tags.includes( 'comic' ) );

export const defOf = ( s ) => getItem( s?.id );
