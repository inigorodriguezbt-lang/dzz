// Small DOM helpers for the UI.
import { PATHS, icon as svgIcon, iconHTML } from './icons.js';

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

// Durations in game hours: 35 min, 4 h, 2 d 4 h
export function fmtDur( hours ) {
	hours = Math.max( 0, hours );
	if ( hours < 1 ) return Math.round( hours * 60 ) + ' min';
	if ( hours < 24 ) return Math.floor( hours ) + ' h';
	const d = Math.floor( hours / 24 ), hh = Math.floor( hours % 24 );
	return hh ? `${d} d ${hh} h` : `${d} d`;
}

// px per u, measured: the custom property itself can't be read as a number (it resolves to calc() text).
// UI keeps the result in ui.u; canvas code multiplies font sizes, line widths and marker sizes by it.
let _probe = null;
export function unitPx() {
	if ( ! _probe ) {
		_probe = document.createElement( 'div' );
		_probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:calc(100 * var(--u))';
		document.body.appendChild( _probe );
	}
	return _probe.getBoundingClientRect().width / 100 || 1;
}

// Icons live in icons.js (PATHS, icon() -> SVG element). This string form keeps the old signature.
export const ICON = PATHS;
export function icon( name, cls = '' ) { return iconHTML( name, 16, cls ); }

// Key cap: kc( input.label( 'reload' ) ) -> <span class="kc">R</span>. Mouse buttons (LMB / RMB from
// prettyCode) draw the mouse glyph instead of text; anything after it stays ('LMB 2×' -> glyph + 2×).
export function kc( label, cls = '' ) {
	const el = h( 'span.kc', { class: cls || null } );
	const m = /^(LMB|RMB)\s*(.*)$/.exec( String( label ) );
	if ( m ) {
		el.appendChild( svgIcon( m[ 1 ] === 'LMB' ? 'mouseL' : 'mouseR', 12 ) );
		if ( m[ 2 ] ) el.appendChild( document.createTextNode( m[ 2 ] ) );
	} else el.textContent = String( label );
	return el;
}

// key cap followed by its 1-2 word verb: hint( 'F', 'Search' )
export function hint( label, verb, cls = '' ) {
	return h( 'span.hint', { class: cls || null }, kc( label ), h( 'span', { text: verb } ) );
}
