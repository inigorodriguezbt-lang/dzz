// Shared controls with the behaviour the spec gives them (docs/UI_SPEC.md 4.4-4.7, 4.14), so every
// screen gets the same keyboard handling, viewport flipping and sounds. Styles live in css/components.css.
import { h, kc } from './dom.js';
import { icon } from './icons.js';

const PAD = 8; // popovers stay this many px inside the viewport

// Segmented control. options: [ [ value, label ] ] (a label may be a Node); disabled: set of values.
// Left / Right change the value while it has focus. Returns the element; el.set( v ) updates it.
export function seg( options, value, onChange, { fill = false, disabled = null, audio = null } = {} ) {
	const el = h( 'div.seg' + ( fill ? '.fill' : '' ), { role: 'radiogroup' } );
	const btns = options.map( ( [ v, label ] ) => {
		const b = h( 'button', { type: 'button', role: 'radio', disabled: !! disabled?.has?.( v ), onclick: () => pick( v ) }, label );
		b._v = v;
		return b;
	} );
	el.append( ...btns );
	const paint = () => { for ( const b of btns ) { const on = b._v === value; b.classList.toggle( 'on', on ); b.setAttribute( 'aria-checked', on ); b.tabIndex = on ? 0 : - 1; } };
	const pick = ( v, focus = false ) => {
		if ( v === value ) return;
		value = v; paint();
		if ( focus ) btns.find( b => b._v === v )?.focus();
		audio?.ui?.();
		onChange?.( v );
	};
	el.addEventListener( 'keydown', e => {
		if ( e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' ) return;
		e.preventDefault();
		const live = btns.filter( b => ! b.disabled );
		const i = live.findIndex( b => b._v === value );
		const n = live[ ( i + ( e.code === 'ArrowRight' ? 1 : - 1 ) + live.length ) % live.length ];
		if ( n ) pick( n._v, true );
	} );
	el.set = v => { value = v; paint(); };
	paint();
	return el;
}

// Toggle switch (button role=switch). el.set( on ) updates it without firing onChange.
export function toggle( on, onChange, { audio = null } = {} ) {
	const el = h( 'button.toggle', { type: 'button', role: 'switch' } );
	const paint = () => { el.classList.toggle( 'on', !! on ); el.setAttribute( 'aria-checked', !! on ); };
	el.onclick = () => { on = ! on; paint(); audio?.ui?.(); onChange?.( on ); };
	el.set = v => { on = v; paint(); };
	paint();
	return el;
}

// Slider + value label. onInput fires while dragging; onChange on release (for settings that are
// expensive to apply, like the GUI scale). Shift + arrow steps ten times further.
export function slider( { min, max, step = 1, value, fmt = v => String( v ), onInput = null, onChange = null } ) {
	const inp = h( 'input.slider', { type: 'range', min, max, step, value } );
	const val = h( 'span.val' );
	const paint = () => { val.textContent = fmt( + inp.value ); inp.style.setProperty( '--p', ( ( inp.value - min ) / ( max - min ) * 100 ).toFixed( 2 ) + '%' ); };
	inp.addEventListener( 'input', () => { paint(); onInput?.( + inp.value ); } );
	inp.addEventListener( 'change', () => onChange?.( + inp.value ) );
	inp.addEventListener( 'keydown', e => {
		if ( ! e.shiftKey ) return;
		const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: - 1, ArrowDown: - 1 }[ e.code ];
		if ( ! d ) return;
		e.preventDefault();
		inp.value = Math.min( max, Math.max( min, + inp.value + d * step * 10 ) );
		paint(); onInput?.( + inp.value ); onChange?.( + inp.value );
	} );
	inp.set = v => { inp.value = v; paint(); };
	paint();
	return [ inp, val ];
}

// Keep a fixed-position element inside the viewport: prefer (x, y), flip to the other side of the
// point when it would cross the right or bottom edge.
export function placePop( el, x, y, { flipX = x, flipY = y } = {} ) {
	el.style.left = '0px'; el.style.top = '0px';
	const r = el.getBoundingClientRect();
	let l = x, t = y;
	if ( l + r.width > innerWidth - PAD ) l = flipX - r.width;
	if ( t + r.height > innerHeight - PAD ) t = flipY - r.height;
	el.style.left = Math.round( Math.max( PAD, Math.min( l, innerWidth - PAD - r.width ) ) ) + 'px';
	el.style.top = Math.round( Math.max( PAD, Math.min( t, innerHeight - PAD - r.height ) ) ) + 'px';
}

let openMenu = null;

// Context menu / popover list. items: [ { label, hint?, icon?, run, def?, danger?, disabled?, on? } | null ]
// (null draws a separator; hint is text or a key-cap label: { key: 'Shift' }). at: { x, y } for a context
// menu, or an anchor element for a popover (opens under it, right-aligned; { align: 'left' } for a select).
// Up / Down move, Enter runs, Esc or a pointerdown outside closes. Returns close(), or null when the call
// only closed the popover already open on that anchor.
export function popMenu( items, at, { parent = document.getElementById( 'ui' ), audio = null, align = 'right', width = null, onClose = null, cls = '' } = {} ) {
	// clicking the anchor of an open popover closes it
	if ( at instanceof Element && at._popClose ) { at._popClose(); return null; }
	openMenu?.();
	const el = h( 'div.pop.menu', { role: 'menu', class: cls || null } );
	if ( width ) el.style.width = width + 'px';
	const rows = [];
	for ( const it of items ) {
		if ( ! it ) { el.appendChild( h( 'div.sep' ) ); continue; }
		const hint = it.hint == null ? null : typeof it.hint === 'object' && it.hint.key ? kc( it.hint.key, 'out' ) : h( 'span.h', { text: it.hint } );
		const b = h( 'button', { type: 'button', role: 'menuitem', tabIndex: - 1, disabled: !! it.disabled, class: [ it.def && 'def', it.danger && 'danger', it.on && 'on' ].filter( Boolean ).join( ' ' ) || null,
			onclick: () => { close(); audio?.ui?.(); it.run?.(); } },
		it.icon ? icon( it.icon ) : null, h( 'span', { text: it.label } ), hint );
		rows.push( b );
		el.appendChild( b );
	}
	parent.appendChild( el );
	if ( at instanceof Element ) {
		const r = at.getBoundingClientRect();
		if ( width === null && align === 'left' ) el.style.minWidth = r.width + 'px';
		const w = el.getBoundingClientRect().width;
		placePop( el, align === 'left' ? r.left : r.right - w, r.bottom + 4, { flipY: r.top - 4 } );
	} else placePop( el, at.x, at.y );
	let idx = rows.findIndex( b => b.classList.contains( 'on' ) );
	const focus = i => { idx = i; rows[ i ]?.focus(); };
	const key = e => {
		const live = rows.filter( b => ! b.disabled );
		if ( e.code === 'Escape' ) close();
		else if ( e.code === 'ArrowDown' || e.code === 'ArrowUp' ) {
			const d = e.code === 'ArrowDown' ? 1 : - 1;
			let cur = live.indexOf( rows[ idx ] );
			if ( cur < 0 ) cur = d > 0 ? - 1 : 0; // nothing focused yet: Down goes to the first row, Up to the last
			if ( live.length ) focus( rows.indexOf( live[ ( cur + d + live.length ) % live.length ] ) );
		} else if ( e.code === 'Enter' || e.code === 'NumpadEnter' ) { if ( rows[ idx ] && ! rows[ idx ].disabled ) rows[ idx ].click(); else return; }
		else return;
		e.preventDefault(); e.stopImmediatePropagation();
	};
	const outside = e => { if ( ! el.contains( e.target ) && ! ( at instanceof Element && at.contains( e.target ) ) ) close(); };
	const close = () => {
		if ( ! el.isConnected ) return;
		el.remove();
		window.removeEventListener( 'keydown', key, true );
		window.removeEventListener( 'pointerdown', outside, true );
		if ( openMenu === close ) openMenu = null;
		if ( at instanceof Element ) at._popClose = null;
		onClose?.();
	};
	window.addEventListener( 'keydown', key, true );
	window.addEventListener( 'pointerdown', outside, true );
	openMenu = close;
	if ( at instanceof Element ) at._popClose = close;
	el.close = close;
	return close;
}

// Select (4.7): a button with the current label and a chevron; the list opens under it at its width.
export function select( options, value, onChange, { audio = null } = {} ) {
	const lab = h( 'span' );
	const el = h( 'button.btn.select', { type: 'button', 'aria-haspopup': 'menu' }, lab, icon( 'chevron', 12 ) );
	const paint = () => { lab.textContent = options.find( o => o[ 0 ] === value )?.[ 1 ] ?? ''; };
	el.onclick = () => popMenu( options.map( ( [ v, l ] ) => ( { label: l, on: v === value, run: () => { value = v; paint(); onChange?.( v ); } } ) ), el, { align: 'left', audio } );
	el.set = v => { value = v; paint(); };
	paint();
	return el;
}
