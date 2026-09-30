// Item icons: rendered 3D thumbnails from render/Icons.js when that module is present, a category glyph meanwhile.
import { getItem } from '../game/items/ItemDB.js';

const mods = import.meta.glob( '../render/Icons.js' );
let Icons = null;
const waiting = new Map();

export async function loadIcons() {
	const f = mods[ '../render/Icons.js' ];
	if ( f ) { try { Icons = await f(); } catch ( e ) { console.warn( 'icons', e ); } }
}

const GLYPH = {
	firearm: '<path d="M3 10h14l2-2h2v4h-3l-1 2h-4l-1 4H8l1-4H3z"/>', ammo: '<rect x="6" y="6" width="3" height="12" rx="1.5"/><rect x="11" y="6" width="3" height="12" rx="1.5"/><rect x="16" y="6" width="3" height="12" rx="1.5"/>',
	magazine: '<path d="M9 3h6l-1 18H8z"/>', attachment: '<rect x="4" y="9" width="16" height="6" rx="2"/><circle cx="8" cy="12" r="1.5"/>',
	melee: '<path d="M4 20 16 8l3-5 1 1-5 3L3 19z"/>', clothing: '<path d="m7 4 5 2 5-2 4 4-3 3v9H6v-9L3 8z"/>', backpack: '<path d="M6 8h12v12H6z"/><path d="M9 8V5h6v3"/>',
	food: '<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M6 9h12"/>', drink: '<path d="M9 3h6v4l2 3v11H7V10l2-3z"/>',
	medical: '<rect x="4" y="6" width="16" height="13" rx="2"/><path d="M12 9v7M8.5 12.5h7"/>', tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"/>',
	throwable: '<circle cx="12" cy="14" r="6"/><path d="M12 8V4h3"/>', fuel: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 4v4h6"/>',
	misc: '<circle cx="12" cy="12" r="7"/>', material: '<path d="m4 16 8-10 8 10z"/>',
};

// the glyph drawn with a margin (a 33-unit box around the 24 grid) so it reads at 32u where a render gets 44u
export function glyphFor( id ) {
	const d = getItem( id );
	const g = GLYPH[ d?.cat ] || GLYPH.misc;
	return 'data:image/svg+xml;utf8,' + encodeURIComponent( `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.5 -4.5 33 33" fill="none" stroke="#B6BAC1" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${g}</svg>` );
}

function pending( id ) {
	let p = waiting.get( id );
	if ( ! p ) { p = Icons.iconFor( id ).catch( () => null ); waiting.set( id, p ); }
	return p;
}

// Sets img.src to the rendered icon. While it is still rendering the img stays empty (css hides an img without
// a src) rather than showing a line glyph in another style; the category glyph only stands in when the render
// fails or takes longer than GLYPH_AFTER.
const GLYPH_AFTER = 2500; // ms
export function setIcon( img, id ) {
	const s = Icons?.iconSync?.( id );
	if ( s ) { img.src = s; delete img.dataset.want; return; }
	img.dataset.want = id;
	if ( ! Icons?.iconFor ) { img.src = glyphFor( id ); return; }
	img.removeAttribute( 'src' );
	const late = setTimeout( () => { if ( img.dataset.want === id && ! img.getAttribute( 'src' ) ) img.src = glyphFor( id ); }, GLYPH_AFTER );
	pending( id ).then( url => { clearTimeout( late ); if ( img.dataset.want === id ) img.src = url || glyphFor( id ); } );
}

// queue renders ahead of time (the carried items when a world starts)
export function warmIcons( ids ) {
	if ( ! Icons?.iconFor ) return;
	for ( const id of new Set( ids ) ) if ( ! Icons.iconSync?.( id ) ) pending( id );
}

export function iconUrl( id ) { return Icons?.iconSync?.( id ) || glyphFor( id ); }
