// Placeable kinds and placed records (Node-safe: no DOM, no renderer).
//
//   addPlaceable( kind, def )          registers a kind (a later registration of the same kind replaces it)
//   getPlaceable( kind ), KINDS
//   placeOf( itemDef ) -> spec | null  an item's `place` field, normalised ({ kind, … })
//   makeRecord( o ) / serializeRecord( p ) / loadRecord( o )
//
// A kind def (every field optional):
//   update( p, dt, game, dh )     low-frequency tick: dt real seconds, dh game hours since this record's last tick
//                                 (near records tick ~4 times a second, far ones every 2 s)
//   frame( p, dt, game )          every frame while the player is within FRAME_R (trap jaws, held victims)
//   actions( p, game ) -> [ { label, run, hold? } ]   the F menu; the first is what a tap of F does
//   label( p, game ), sub( p, game )                  the prompt's name and state line
//   model( p, game ) -> Object3D  what it looks like placed (default: the item's own model; p.preview for the ghost)
//   show( p, game )               after every (re)build (lights, sounds following the state)
//   check( pos, game, spec, A ) -> reason | null       extra placement rule ('Needs soft ground'); A.floor is the box
//                                 the ghost stands on (a floor, a table) or null on the ground
//   onPlace( p, game ), onRemove( p, game )
//   serialize( p ) -> data for the save (default: p.data), load( p, data )
//   outdoors, soft, water (true: may stand in water, 'only': must), solid (bool or fn( p )), solidBox: { hy, k },
//   place: { time, gerund, sound }
// An item's `place` spec may carry the same placement fields (verb, gerund, time, outdoors, soft, water) and its
// kind's own options.
// The record: { id, kind, item (def id), pos ({ x, y, z }), yaw, stack, data, born (game hours) }.
export const KINDS = new Map();

export function addPlaceable( kind, def = {} ) {
	if ( typeof kind !== 'string' || ! kind ) throw new Error( 'addPlaceable: kind' );
	KINDS.set( kind, { kind, ...def } );
	return KINDS.get( kind );
}

export const getPlaceable = ( kind ) => KINDS.get( kind ) || null;

// an item name inside a sentence: 'Wire snare' -> 'wire snare', 'LED lantern' stays
export const lc = ( s ) => typeof s === 'string' && /^[A-Z][a-z]/.test( s ) ? s[ 0 ].toLowerCase() + s.slice( 1 ) : s;

// the item's placement spec: `place: 'light'` or `place: { kind: 'light', … }`
export function placeOf( def ) {
	const p = def?.place;
	if ( ! p ) return null;
	if ( typeof p === 'string' ) return { kind: p };
	return p.kind ? p : null;
}

let seq = 0;
export const newId = () => 'pl' + Date.now().toString( 36 ).slice( - 5 ) + ( ++ seq ).toString( 36 );

export function makeRecord( { id, kind, item, pos, yaw = 0, stack = null, data = {}, born = 0 } ) {
	return { id: id || newId(), kind, item: item || stack?.id || null, pos: { x: + pos.x || 0, y: + pos.y || 0, z: + pos.z || 0 }, yaw: + yaw || 0, stack, data: data || {}, born };
}

const r2 = ( v ) => Math.round( v * 100 ) / 100;

// plain JSON for save.world.placeables; the kind may shape its data (and drop runtime state)
export function serializeRecord( p ) {
	const K = getPlaceable( p.kind );
	let data = p.data;
	try { if ( K?.serialize ) data = K.serialize( p ); } catch ( e ) { console.error( 'placeable serialize', p.kind, e ); }
	return { i: p.id, k: p.kind, it: p.item, p: [ r2( p.pos.x ), r2( p.pos.y ), r2( p.pos.z ) ], y: r2( p.yaw ), s: p.stack ?? null, d: plain( data ), b: r2( p.born || 0 ) };
}

export function loadRecord( o ) {
	if ( ! o || typeof o.k !== 'string' || ! Array.isArray( o.p ) ) return null;
	const p = makeRecord( { id: o.i, kind: o.k, item: o.it, pos: { x: o.p[ 0 ], y: o.p[ 1 ], z: o.p[ 2 ] }, yaw: o.y, stack: o.s ?? null, data: {}, born: o.b || 0 } );
	const K = getPlaceable( p.kind );
	const data = o.d && typeof o.d === 'object' ? o.d : {};
	try { if ( K?.load ) K.load( p, data ); else p.data = data; } catch ( e ) { console.error( 'placeable load', p.kind, e ); p.data = data; }
	return p;
}

// runtime fields start with '_' (meshes, sound handles, held entities): never saved
function plain( d ) {
	if ( ! d || typeof d !== 'object' ) return {};
	const out = {};
	for ( const k in d ) if ( k[ 0 ] !== '_' && typeof d[ k ] !== 'function' ) out[ k ] = d[ k ];
	return JSON.parse( JSON.stringify( out ) );
}
