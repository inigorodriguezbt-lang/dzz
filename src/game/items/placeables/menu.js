// The F menu of a placed thing (holding F on it): the game's popover list at the crosshair, on a clear screen so
// the pointer is free to click. Number keys pick a row, F the first, Esc or a click outside closes it.
import { popMenu } from '../../../ui/widgets.js';
import { h } from '../../../ui/dom.js';

// items: [ { label, meta?, run, disabled? } ]; returns false when there is no UI to show it in
export function openActionMenu( game, items ) {
	const ui = game.app?.ui;
	if ( ! ui?.show || typeof document === 'undefined' ) return false;
	const host = h( 'div.screen', { style: { background: 'transparent' } } );
	let done = false, closeMenu = null, onKey = null;
	const finish = ( fromScreen ) => {
		if ( done ) return;
		done = true;
		if ( onKey ) window.removeEventListener( 'keydown', onKey, true );
		if ( fromScreen ) closeMenu?.(); else if ( ui.screen === host ) ui.closeScreen();
	};
	ui.show( host, { onClose: () => finish( true ) } );
	closeMenu = popMenu( items.map( ( it, i ) => ( { label: it.label, meta: it.meta, hint: i < 9 ? { key: String( i + 1 ) } : null, disabled: it.disabled, def: i === 0, run: it.run } ) ),
		{ x: innerWidth / 2 + 20, y: innerHeight / 2 - 14 }, { parent: ui.root, audio: game.audio, cls: 'pl-menu', onClose: () => finish( false ) } );
	const el = ui.root.querySelector( '.pop.menu.pl-menu' );
	const rows = el ? [ ...el.querySelectorAll( 'button' ) ] : [];
	rows[ 0 ]?.focus();
	onKey = ( e ) => {
		if ( e.repeat ) return; // the F still held from opening the menu
		const m = /^Digit([1-9])$/.exec( e.code );
		const i = m ? + m[ 1 ] - 1 : game.input?.codes?.( 'interact' )?.includes( e.code ) ? 0 : - 1;
		if ( i < 0 || ! rows[ i ] || rows[ i ].disabled ) return;
		e.preventDefault(); e.stopImmediatePropagation();
		rows[ i ].click();
	};
	window.addEventListener( 'keydown', onKey, true );
	return true;
}
