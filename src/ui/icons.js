// The UI icon set (docs/UI_SPEC.md section 3): outline glyphs on a 24 grid, stroke 1.5 so a 16u icon
// has exactly 1 px lines. Fill only where the markup says fill="currentColor". Colour comes from
// `color` (currentColor), sizes from the .i classes in css/base.css: 16u default, 24u, 12u.

// inner SVG markup per icon, for a 0 0 24 24 viewBox
export const PATHS = {
	// status (vitals strip, status screen)
	health: '<path d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.2 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
	blood: '<path d="M12 3.5c3 3.6 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.9 6-10.5Z"/>',
	food: '<path d="M6 3v5.5a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-1.8.9-3 3.4-3 6.5V13h3"/>',
	water: '<path d="M9.5 3h5M10.25 3v2.5L8 8.25V19.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5V8.25L13.75 5.5V3M8 12.5h8"/>',
	temp: '<path d="M14 14.3V5a2 2 0 0 0-4 0v9.3a4 4 0 1 0 4 0ZM12 17V9.5"/>',
	energy: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
	stamina: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z"/>',
	breath: '<circle cx="8.5" cy="15.5" r="3.25"/><circle cx="15.5" cy="8.5" r="3.75"/><circle cx="17" cy="18" r="1.75"/>',
	// conditions, keyed by Survival.conditions() id
	bleed: '<path d="M10 3c2.4 2.9 4.8 5.8 4.8 8.4a4.8 4.8 0 0 1-9.6 0C5.2 8.8 7.6 5.9 10 3ZM18 13c1.1 1.4 2.2 2.7 2.2 3.9a2.2 2.2 0 0 1-4.4 0c0-1.2 1.1-2.5 2.2-3.9Z"/>',
	frac: '<path d="M7.2 15.3 10.5 12M13.5 12l3.3-3.3M10.5 12l1.2-2 .6 2.6 1.2-.6"/><path d="M7.2 15.3a2 2 0 1 0-2.4 2.4 2 2 0 1 0 1.5 1.5 2 2 0 1 0 .9-3.9ZM16.8 8.7a2 2 0 1 0 2.4-2.4 2 2 0 1 0-1.5-1.5 2 2 0 1 0-.9 3.9Z"/>',
	inf: '<circle cx="12" cy="12" r="4"/><path d="M12 8V5.5M12 18.5V16M15.46 10l2.17-1.25M6.37 15.25 8.54 14M15.46 14l2.17 1.25M6.37 8.75 8.54 10"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="18.93" cy="8" r="1.5"/><circle cx="5.07" cy="16" r="1.5"/><circle cx="18.93" cy="16" r="1.5"/><circle cx="5.07" cy="8" r="1.5"/>',
	sick: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 15.5q1.125-1.25 2.25 0t2.25 0 2.25 0 2.25 0M9 9.75h.01M15 9.75h.01"/>',
	cold: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
	hot: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
	wet: '<path d="M7 15a4 4 0 0 1 .6-7.95 5 5 0 0 1 9.5 1.5A3.25 3.25 0 0 1 17 15H7ZM8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
	drunk: '<path d="M8 3h8l-.4 4.6a3.6 3.6 0 0 1-7.2 0L8 3ZM12 11.2V20M8.5 20.5h7M8.3 6.5h7.4"/>',
	caf: '<path d="M5 9h11v4.5A5.5 5.5 0 0 1 10.5 19A5.5 5.5 0 0 1 5 13.5V9ZM16 10.5h1.25a2.25 2.25 0 0 1 0 4.5H16M8.5 3.5v2.5M12.5 3.5v2.5"/>',
	pk: '<path d="M10.6 19.4 19.4 10.6a4.24 4.24 0 0 0-6-6L4.6 13.4a4.24 4.24 0 0 0 6 6ZM8.5 8.5l7 7"/>',
	heavy: '<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="14.5" r="6"/>',
	// equipment and weapon slots (empty-slot glyphs, drawn at 24u)
	head: '<path d="M4.5 16a6.5 6.5 0 0 1 13 0M4.5 16h17M11 9.5V8"/>',
	eyes: '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 13.5 2.5 9M20.5 13.5l1-4.5"/>',
	face: '<path d="M4 9.5c2.5-1 5.2-1.5 8-1.5s5.5.5 8 1.5v2.5c0 4.4-3.6 8-8 8s-8-3.6-8-8V9.5ZM8.5 13h7M9.5 16h5"/>',
	torso: '<path d="M8.5 3.5 4 5.75 2.5 10.5l3 1V20.5h13v-9l3-1L20 5.75 15.5 3.5a3.5 3.5 0 0 1-7 0Z"/>',
	vest: '<path d="M7 3.5h2.5a2.5 2.5 0 0 0 5 0H17l2 3v14H5v-14l2-3ZM8.5 12h7v5h-7Z"/>',
	back: '<path d="M7 9a5 5 0 0 1 10 0v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5V9ZM9.5 4V5.5M14.5 4v1.5M9.5 4h5M9.5 14h5v3.5h-5Z"/>',
	gloves: '<path d="M8 21v-3.5l-3.2-4.3a1.4 1.4 0 0 1 2.2-1.7L8.5 13V5.25a1.25 1.25 0 0 1 2.5 0V11V4.25a1.25 1.25 0 0 1 2.5 0V11V5.25a1.25 1.25 0 0 1 2.5 0V11V7.25a1.25 1.25 0 0 1 2.5 0V15c0 2.5-1 4.5-2 6M8 18.25h9"/>',
	hands: '<path d="M8 21v-3.5l-3.2-4.3a1.4 1.4 0 0 1 2.2-1.7L8.5 13V5.25a1.25 1.25 0 0 1 2.5 0V11V4.25a1.25 1.25 0 0 1 2.5 0V11V5.25a1.25 1.25 0 0 1 2.5 0V11V7.25a1.25 1.25 0 0 1 2.5 0V15c0 2.5-1 4.5-2 6"/>',
	legs: '<path d="M6 3.5h12l1 17h-5l-2-10-2 10H5l1-17ZM6 7h12"/>',
	feet: '<path d="M7 3.5h5v8.5l6.25 2.2A2.5 2.5 0 0 1 20 16.6V19H4.5v-3.2L7 12V3.5ZM4.5 19v1.5H20V19"/>',
	belt: '<path d="M2.5 10h6.5M15 10h6.5M2.5 14h6.5M15 14h6.5M9 8h6v8H9ZM12 12h3"/>',
	primary: '<path d="M2.5 10.5h12l1.5-1.5h5.5v3h-4.5l-1 1.5H11l-1.25 4.5h-2.5l1-4.5H2.5v-3Z"/>',
	sidearm: '<path d="M4 7h15.5v4.5H11l-1.25 5.5H6.25l1.2-5.5H4V7ZM11 11.5v1.75h2.25"/>',
	melee: '<path d="M4 20l3.25-3.25M5.75 14.75l3.5 3.5M8.25 15.75 18.5 5.5 20.5 3.5c.4 3.1-.9 6.3-3.6 9L12 17.25"/>',
	// actions and chrome
	close: '<path d="M6 6l12 12M18 6 6 18"/>',
	sort: '<path d="M4 6h10M4 12h7M4 18h4M17.5 5v14M14.5 16l3 3 3-3"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	minus: '<path d="M5 12h14"/>',
	locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
	fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
	layers: '<path d="M12 3.5l9 4.5-9 4.5-9-4.5 9-4.5ZM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',
	pin: '<path d="M12 21s6-5.3 6-10.5a6 6 0 0 0-12 0C6 15.7 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2"/>',
	marker: '<path d="M12 3.5 18 12l-6 8.5L6 12l6-8.5Z"/>',
	edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>',
	duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
	export: '<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>',
	import: '<path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13A1.5 1.5 0 0 0 20 19v-2.5"/>',
	trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"/>',
	chevron: '<path d="M9 6l6 6-6 6"/>',
	check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
	reset: '<path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.5M4 3.5v5h5"/>',
	fuel: '<path d="M4.5 20.5v-15A1.5 1.5 0 0 1 6 4h6a1.5 1.5 0 0 1 1.5 1.5v15M3 20.5h12M4.5 10h9M13.5 8.5h2l2.5 2.5v6a1.25 1.25 0 0 0 2.5 0V9L18.5 7"/>',
	wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1Z"/>',
	// a curved box magazine with its base plate: reads as a magazine at 16u (the reserve in the weapon panel)
	magazine: '<path d="M8 3.5h6.5l.5 6c.3 3.4 1.5 6.6 3.4 9.5h-6C10 16.3 8.4 12.8 8.1 9.4L8 3.5ZM8.1 7.5h6.7M11.2 21h8.5"/>',
	altitude: '<path d="M2.5 19.5 9 9.5l4 6 2.5-3.5 6 7.5Z"/>',
	flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3C8 9 6 11.5 6 15a6 6 0 0 0 6 6Z"/>',
	car: '<path d="M3.5 16v-3.5L5.7 7h12.6l2.2 5.5V16H3.5Zm0 0v2.5h3V16m11 0v2.5h3V16M3.5 12.5h17"/>',
	skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.9 3-5.4a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2M14 20v-2"/>',
	mouseL: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/><path d="M12 3a6 6 0 0 0-6 6h6V3Z" fill="currentColor"/>',
	mouseR: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 9h12"/><path d="M12 3a6 6 0 0 1 6 6h-6V3Z" fill="currentColor"/>',
	player: '<path d="M12 3 19 20l-7-4-7 4 7-17Z" fill="currentColor"/>',
};

const SIZE_CLASS = { 12: 'i12', 16: '', 24: 'i24' };
const NS = 'http://www.w3.org/2000/svg';

function classOf( size, cls ) {
	return [ 'i', SIZE_CLASS[ size ] ?? '', cls ].filter( Boolean ).join( ' ' );
}

// SVG element: icon( 'health' ), icon( 'head', 24 ), icon( 'chevron', 12, 'rot90' ).
// Sizes are 12, 16 or 24 (u); anything else falls back to the 16u box.
export function icon( name, size = 16, cls = '' ) {
	const svg = document.createElementNS( NS, 'svg' );
	svg.setAttribute( 'class', classOf( size, cls ) );
	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'aria-hidden', 'true' );
	svg.innerHTML = PATHS[ name ] || '';
	return svg;
}

// the same as markup, for code that builds innerHTML strings
export function iconHTML( name, size = 16, cls = '' ) {
	return `<svg class="${classOf( size, cls )}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[ name ] || ''}</svg>`;
}
