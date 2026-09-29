// Small shared helpers for the items module (no three.js, Node-safe).
import { getItem } from './ItemDB.js';

export const LIQUIDS = { water: 'water', dirty: 'dirty water', sea: 'seawater', fuel: 'gasoline' };
export function liquidName( l ) { return LIQUIDS[ l ] || l || 'nothing'; }

// mixing liquids: the worse one wins (a splash of seawater makes a bottle of water salty)
const BADNESS = { water: 0, dirty: 1, sea: 2, fuel: 3 };
export function worstLiquid( a, b ) { return ( BADNESS[ a ] ?? 0 ) >= ( BADNESS[ b ] ?? 0 ) ? a : b; }

// does a stack provide a tool kind: its tool kind, extra kinds a tool provides, or a melee weapon's tools
export function provides( stack, kind ) {
	const d = getItem( stack.id );
	if ( ! d || stack.cond <= 0 ) return false;
	return d.tool?.kind === kind || !! d.tool?.provides?.includes( kind ) || !! d.melee?.tools?.includes( kind );
}

export function findTool( inv, kind ) {
	return inv.find( ( s ) => provides( s, kind ) );
}

export const fmtHour = ( h ) => {
	const hh = Math.floor( ( ( h % 24 ) + 24 ) % 24 ), mm = Math.floor( ( h % 1 ) * 60 );
	return `${String( hh ).padStart( 2, '0' )}:${String( mm ).padStart( 2, '0' )}`;
};

export const cardinal = ( deg ) => [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][ Math.round( ( ( deg % 360 ) + 360 ) % 360 / 45 ) % 8 ];
