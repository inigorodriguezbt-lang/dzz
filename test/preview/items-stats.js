// Model statistics for the item catalogue (not shipped): /test/preview/items-stats.html
// Builds every item model through the world instancer path and reports triangles, draw parts and size per item.
import '../../src/game/items/defs/index.js';
import { ITEMS } from '../../src/game/items/ItemDB.js';
import { instanceParts, modelInfo } from '../../src/render/ItemModels.js';

const weaponMods = import.meta.glob( '../../src/weapons/*Models.js' );
for ( const f of Object.values( weaponMods ) ) { try { await f(); } catch ( e ) { console.warn( 'weapon models', e ); } }
const rows = [];
for ( const d of ITEMS.values() ) {
	let tris = 0, parts = 0, fallback = false;
	try {
		const P = instanceParts( d );
		parts = P.length;
		for ( const p of P ) tris += p.geometry.attributes.position.count / 3;
		const info = modelInfo( d );
		rows.push( { id: d.id, cat: d.cat, type: d.model?.type, tris: Math.round( tris ), parts, size: info.size.toArray().map( v => + v.toFixed( 3 ) ) } );
	} catch ( e ) { rows.push( { id: d.id, error: String( e ) } ); fallback = true; }
	void fallback;
}
window.__stats = rows;
window.__ready = true; window.__done = true;
