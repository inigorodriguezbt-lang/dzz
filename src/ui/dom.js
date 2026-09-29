// Small DOM helpers for the UI.
export function h( tag, attrs = {}, ...children ) {
	const [ t, ...cls ] = tag.split( '.' );
	const el = document.createElement( t || 'div' );
	if ( cls.length ) el.className = cls.join( ' ' );
	for ( const k in attrs ) {
		const v = attrs[ k ];
		if ( v == null || v === false ) continue;
		if ( k === 'class' ) el.className += ( el.className ? ' ' : '' ) + v;
		else if ( k === 'style' && typeof v === 'object' ) Object.assign( el.style, v );
		else if ( k.startsWith( 'on' ) && typeof v === 'function' ) el.addEventListener( k.slice( 2 ).toLowerCase(), v );
		else if ( k === 'html' ) el.innerHTML = v;
		else if ( k === 'text' ) el.textContent = v;
		else if ( k in el && typeof v !== 'string' ) el[ k ] = v;
		else el.setAttribute( k, v === true ? '' : v );
	}
	for ( const c of children.flat( Infinity ) ) {
		if ( c == null || c === false ) continue;
		el.appendChild( c instanceof Node ? c : document.createTextNode( String( c ) ) );
	}
	return el;
}

export function clear( el ) { while ( el.firstChild ) el.removeChild( el.firstChild ); return el; }

export function fmtTime( sec ) {
	sec = Math.floor( sec );
	const hh = Math.floor( sec / 3600 ), mm = Math.floor( sec / 60 ) % 60;
	return hh ? `${hh}h ${mm}m` : `${mm}m`;
}

export function fmtDate( ms ) {
	if ( ! ms ) return '';
	const d = new Date( ms );
	const now = new Date();
	const same = d.toDateString() === now.toDateString();
	return same ? 'Today ' + d.toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit' } ) : d.toLocaleDateString( [], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined } );
}

export function fmtDist( m ) { return m >= 1000 ? ( m / 1000 ).toFixed( m >= 10000 ? 0 : 1 ) + ' km' : Math.round( m ) + ' m'; }

// line icons (24x24, stroke currentColor)
export const ICON = {
	health: '<path d="M12 21s-7.5-4.6-9.3-9.6C1.4 7.6 4 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.2 0 5.8 3.1 4.5 6.9C19.5 16.4 12 21 12 21z"/>',
	blood: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
	food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.7 1.3-2.5 3.6-2.5 6.5V13H17V3zM17 13v8"/>',
	water: '<path d="M8 3h8l-1 3v2c2 1 3 3 3 5v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6c0-2 1-4 3-5V6z"/><path d="M6 14h12"/>',
	stamina: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
	temp: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 11v6"/>',
	energy: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
	breath: '<circle cx="8" cy="15" r="3"/><circle cx="15" cy="9" r="4"/><circle cx="17" cy="18" r="2"/>',
	bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
	map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
	gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
	craft: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"/>',
	skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.3 3 5.4V20h10v-3.6c1.8-1.1 3-2.9 3-5.4a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2M14 20v-2"/>',
	wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
};

export function icon( name, cls = '' ) {
	return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[ name ] || ''}</svg>`;
}
