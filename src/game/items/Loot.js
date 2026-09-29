// Loot tables (placeholder API; the full tables replace this file).
//   rollLoot( table, rnd, n? ) -> [ ItemStack ]   n: number of rolls (default from the table)
//   LOOT_TABLES: names -> table
import { makeStack, ITEMS } from './ItemDB.js';

export const LOOT_TABLES = {};

export function rollLoot( table, rnd = Math.random, n = 1 ) {
	const ids = [ ...ITEMS.keys() ];
	const out = [];
	for ( let i = 0; i < n && ids.length; i ++ ) {
		const s = makeStack( ids[ Math.floor( rnd() * ids.length ) ], 1, { loot: true, rnd } );
		if ( s ) out.push( s );
	}
	return out;
}
