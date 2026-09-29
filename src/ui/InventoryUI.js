// The inventory: what you wear and carry (right), your character with equipment and weapon slots (middle),
// and what is around you — an opened container, the ground, the creative catalog or crafting (left).
// Drag and drop between any of them; double-click for the default action, Shift-click to move across,
// right-click for every action, 1-9 over an item binds it to the hotbar.
import { h, clear } from './dom.js';
import { setIcon } from './itemIcons.js';
import { ITEMS, getItem, displayName, condLabel, condColor, freshness, ammoOf, stackWeight, stackVolume, CATEGORY_LABEL, makeStack } from '../game/items/ItemDB.js';
import { EQUIP_SLOTS, WEAPON_SLOTS, SLOT_LABEL, addToItems, containerVolume, containerWeight, itemsOf, capacityOf } from '../game/Inventory.js';

const GROUND_R = 2.6;

export class InventoryUI {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.leftTab = 'near';
		this.other = null; // opened world container
		this.catFilter = 'all';
		this.search = '';
	}

	get game() { return this.ui.game; }
	get inv() { return this.game.player.inventory; }

	open( other = null ) {
		this.other = other;
		if ( other ) this.leftTab = 'near';
		this.tooltip = h( 'div.tooltip.tw-glass', { hidden: true } );
		this.left = h( 'div.inv-col' ); this.mid = h( 'div.inv-col' ); this.right = h( 'div.inv-col' );
		const title = h( 'div', {}, h( 'h2', { text: 'Inventory' } ), this.sub = h( 'div.sub' ) );
		const head = h( 'div.panel-head', {}, title, h( 'div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
			h( 'span.dim', { style: { fontSize: '11px' }, text: 'Double-click: use / equip · Shift-click: move · Right-click: actions · 1–9: hotbar' } ),
			h( 'button.x-btn', { text: '✕', onclick: () => this.ui.closeScreen() } ) ) );
		this.panel = h( 'div.panel.inv', {}, head, h( 'div.panel-body', {}, this.left, this.mid, this.right ) );
		this.el = h( 'div.screen.clear', { style: { background: 'rgba(3,8,12,0.45)' } }, this.panel, this.tooltip );
		this.el.addEventListener( 'contextmenu', e => e.preventDefault() );
		this.el.addEventListener( 'pointerdown', e => { if ( this.ctx && ! this.ctx.contains( e.target ) ) this._closeCtx(); if ( e.target === this.el ) this.ui.closeScreen(); } );
		this.keyH = e => this._key( e );
		window.addEventListener( 'keydown', this.keyH, true );
		this.ui.show( this.el, { inventory: true, onClose: () => this._onClose() } );
		this.app.audio.play( 'zipper', { bus: 'ui', vol: 0.5 } );
		this.version = - 1;
		this.render();
	}

	_onClose() {
		window.removeEventListener( 'keydown', this.keyH, true );
		this._closeCtx();
		if ( this.other ) this.game.events.emit( 'container:close', { container: this.other } );
		this.other = null;
		this.drag = null;
		document.querySelectorAll( '.drag-ghost' ).forEach( e => e.remove() );
	}

	_key( e ) {
		const k = e.code;
		const inv = this.app.input;
		if ( this.hover && /^Digit[1-9]$/.test( k ) ) {
			e.preventDefault(); e.stopPropagation();
			const i = + k.slice( 5 ) - 1;
			if ( this.hover.loc.type === 'ground' || this.hover.loc.type === 'other' || this.hover.loc.type === 'catalog' ) return;
			const hb = this.inv.hotbar;
			for ( let j = 0; j < 9; j ++ ) if ( hb[ j ] === this.hover.stack.uid ) hb[ j ] = null;
			hb[ i ] = this.hover.stack.uid;
			this.inv.changed();
			this.app.audio.ui();
			return;
		}
		if ( inv.codes( 'inventory' ).includes( k ) || k === 'Escape' ) { e.preventDefault(); e.stopPropagation(); this.ui.closeScreen(); }
	}

	// ---- rendering ------------------------------------------------------------------------------------

	update() {
		if ( ! this.el?.isConnected ) return;
		// close the container if the player walked away from it
		if ( this.other?.pos && this.game.player.pos.distanceTo( this.other.pos ) > 4 ) { this.other = null; this.render(); return; }
		const nearKey = ( this.game.items3d?.near?.( this.game.player.pos, GROUND_R ) || [] ).map( w => w.id ).join( ',' );
		if ( this.inv.version !== this.version || nearKey !== this._nearKey || this.dirty ) { this._nearKey = nearKey; this.render(); }
	}

	render() {
		this.dirty = false;
		this.version = this.inv.version;
		const inv = this.inv;
		const w = inv.totalWeight();
		this.sub.textContent = `${w.toFixed( 1 )} kg carried${w > 30 ? ' — overloaded' : ''}`;
		this._renderLeft();
		this._renderMid();
		// right: my containers
		clear( this.right );
		const cs = inv.containers();
		const cap = cs.reduce( ( a, c ) => a + c.capacity, 0 ), used = cs.reduce( ( a, c ) => a + containerVolume( c.items ), 0 );
		this.right.appendChild( h( 'h3', {}, 'Carried', h( 'span.dim', { text: `${used} / ${cap} space` } ) ) );
		const sc = h( 'div.scroll' );
		for ( const c of cs ) sc.appendChild( this._container( c, { type: 'container', container: c } ) );
		if ( cs.length === 1 ) sc.appendChild( h( 'div.cont-empty', { style: { padding: '14px' }, text: 'Wear clothes with pockets or a backpack to carry more.' } ) );
		this.right.appendChild( sc );
	}

	_renderLeft() {
		const g = this.game;
		clear( this.left );
		const tabs = h( 'div.cat-tabs', { style: { marginBottom: '4px' } } );
		const tabList = [ [ 'near', this.other ? this.other.label : 'Nearby' ], [ 'craft', 'Crafting' ] ];
		if ( g.mode === 'creative' ) tabList.push( [ 'catalog', 'Catalog' ] );
		if ( ! tabList.find( t => t[ 0 ] === this.leftTab ) ) this.leftTab = 'near';
		for ( const [ k, l ] of tabList ) tabs.appendChild( h( 'button' + ( this.leftTab === k ? '.on' : '' ), { text: l, onclick: () => { this.leftTab = k; this.render(); } } ) );
		this.left.appendChild( tabs );
		const sc = h( 'div.scroll' );
		if ( this.leftTab === 'near' ) {
			if ( this.other ) sc.appendChild( this._container( { ...this.other, label: this.other.label }, { type: 'other', container: this.other } ) );
			const ground = ( g.items3d?.near?.( g.player.pos, GROUND_R ) || [] ).filter( wi => wi.stack );
			const block = h( 'div.cont', { 'data-drop': 'ground' },
				h( 'div.cont-head', {}, h( 'span', { text: 'Ground' } ), h( 'span.cap', { text: ground.length ? ground.length + ' items' : '' } ) ),
				h( 'div.cont-items', {}, ground.length ? ground.map( wi => this._item( wi.stack, { type: 'ground', worldItem: wi } ) ) : h( 'div.cont-empty', { text: 'Drop items here' } ) ) );
			this._dropTarget( block, { type: 'ground' } );
			sc.appendChild( block );
			if ( this.other || ground.length ) sc.appendChild( h( 'div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
				h( 'button.btn.small', { text: 'Take all', onclick: () => this._takeAll( ground ) } ) ) );
		} else if ( this.leftTab === 'craft' ) {
			sc.appendChild( this._crafting() );
		} else if ( this.leftTab === 'catalog' ) {
			sc.appendChild( this._catalog() );
		}
		this.left.appendChild( sc );
	}

	_renderMid() {
		const inv = this.inv, S = this.game.survival;
		clear( this.mid );
		this.mid.appendChild( h( 'h3', {}, 'Character', h( 'span.dim', { text: this.game.mode === 'creative' ? 'Creative' : `Day ${this.game.day}` } ) ) );
		const eq = h( 'div.equip' );
		for ( const slot of EQUIP_SLOTS ) eq.appendChild( this._slot( slot, inv.equip[ slot ], { type: 'equip', slot } ) );
		this.mid.appendChild( eq );
		this.mid.appendChild( h( 'h3', { style: { marginTop: '6px' } }, 'Weapons' ) );
		const we = h( 'div.equip', { style: { gridTemplateColumns: 'repeat(4, 1fr)' } } );
		for ( const slot of WEAPON_SLOTS ) we.appendChild( this._slot( slot, inv.weapons[ slot ], { type: 'weapon', slot } ) );
		this.mid.appendChild( we );
		const held = inv.heldStack();
		this.mid.appendChild( h( 'div.dim', { style: { fontSize: '11px', margin: '2px 0 4px' }, text: held ? `In hands: ${displayName( held )}` : 'Hands empty' } ) );
		const w = inv.totalWeight();
		let insul = 0, bite = 0;
		for ( const s of Object.values( inv.equip ) ) { const c = s && getItem( s.id )?.clothing; if ( c ) { insul += c.insulation || 0; bite = Math.max( bite, c.armor?.bite || 0 ); } }
		this.mid.appendChild( h( 'div.weight-bar', {}, h( 'i', { style: { width: Math.min( 100, w / 45 * 100 ) + '%', backgroundPosition: Math.min( 100, w / 45 * 100 ) + '% 0' } } ) ) );
		this.mid.appendChild( h( 'div.char-stats', {},
			h( 'span', { text: 'Weight' } ), h( 'span', { text: `${w.toFixed( 1 )} kg` } ),
			h( 'span', { text: 'Health' } ), h( 'span', { text: Math.round( S.health ) + '%' } ),
			h( 'span', { text: 'Blood' } ), h( 'span', { text: Math.round( S.blood ) + ' ml' } ),
			h( 'span', { text: 'Body temp' } ), h( 'span', { text: S.temp.toFixed( 1 ) + ' °C' } ),
			h( 'span', { text: 'Outside' } ), h( 'span', { text: Math.round( S.envTemp ) + ' °C' } ),
			h( 'span', { text: 'Insulation' } ), h( 'span', { text: Math.round( insul * 100 ) + '%' } ),
			h( 'span', { text: 'Bite protection' } ), h( 'span', { text: Math.round( bite * 100 ) + '%' } ),
			h( 'span', { text: 'Wet' } ), h( 'span', { text: Math.round( S.wet * 100 ) + '%' } ),
			h( 'span', { text: 'Infected killed' } ), h( 'span', { text: this.game.stats.zombies || 0 } ),
		) );
	}

	_container( c, loc ) {
		const used = containerVolume( c.items );
		const full = used >= c.capacity;
		const img = c.owner ? h( 'img' ) : null;
		if ( img ) setIcon( img, c.owner.id );
		const el = h( 'div.cont', {},
			h( 'div.cont-head', {}, img, h( 'span', { text: c.label } ), h( 'span.cap' + ( full ? '.full' : '' ), { text: `${used}/${c.capacity}` } ) ),
			h( 'div.cap-bar', {}, h( 'i', { style: { width: Math.min( 100, used / Math.max( 1, c.capacity ) * 100 ) + '%' } } ) ),
			h( 'div.cont-items', {}, c.items.length ? c.items.map( s => this._item( s, { ...loc, items: c.items } ) ) : h( 'div.cont-empty', { text: 'Empty' } ) ) );
		this._dropTarget( el, loc );
		return el;
	}

	_slot( slot, stack, loc ) {
		const el = h( 'div.slot' + ( stack ? '.filled' : '' ), { title: SLOT_LABEL[ slot ] }, h( 'span.lab', { text: SLOT_LABEL[ slot ] } ) );
		if ( stack ) {
			const it = this._item( stack, loc );
			it.style.width = '100%'; it.style.height = '100%'; it.style.border = '0'; it.style.background = 'transparent';
			el.appendChild( it );
		}
		this._dropTarget( el, loc );
		return el;
	}

	_item( stack, loc ) {
		const def = getItem( stack.id );
		const img = h( 'img', { alt: '' } );
		setIcon( img, stack.id );
		const a = ammoOf( stack );
		const q = a !== null ? String( a ) : stack.qty > 1 ? String( stack.qty ) : '';
		const fresh = def?.food ? freshness( stack ) : 1;
		const el = h( 'div.item.r-' + ( def?.rarity || 'common' ) + ( fresh <= 0 ? '.spoiled' : '' ), {}, img,
			q ? h( 'span.q', { text: q } ) : null,
			( def?.cat === 'firearm' || def?.cat === 'melee' || def?.cat === 'clothing' || def?.cat === 'backpack' || def?.cat === 'tool' ) && stack.cond < 0.999 ? h( 'div.cond', {}, h( 'i', { style: { width: ( stack.cond * 100 ) + '%', background: condColor( stack.cond ) } } ) ) : null,
			this.inv.hands === stack.uid ? h( 'span.tag', { text: 'HELD', style: { color: 'var(--tw-aqua)' } } ) : null );
		const hb = this.inv.hotbar.indexOf( stack.uid );
		if ( hb >= 0 && loc.type !== 'ground' && loc.type !== 'other' ) el.appendChild( h( 'span.tag', { text: String( hb + 1 ), style: { left: 'auto', right: '3px', top: '2px' } } ) );
		el.addEventListener( 'pointerenter', e => { this.hover = { stack, loc }; this._tip( stack, e ); } );
		el.addEventListener( 'pointermove', e => this._tipMove( e ) );
		el.addEventListener( 'pointerleave', () => { if ( this.hover?.stack === stack ) this.hover = null; this.tooltip.hidden = true; } );
		el.addEventListener( 'pointerdown', e => this._down( e, stack, loc, el ) );
		el.addEventListener( 'dblclick', () => this._default( stack, loc ) );
		el.addEventListener( 'contextmenu', e => { e.preventDefault(); this._menu( e, stack, loc ); } );
		// dropping onto an item: load ammo into mags / guns, attach, merge
		el.addEventListener( 'pointerup', () => { if ( this.drag?.active && this.drag.stack !== stack ) this._dropOnItem( stack, loc ); } );
		return el;
	}

	// ---- tooltip -------------------------------------------------------------------------------------

	_tip( stack, e ) {
		if ( this.drag?.active ) return;
		const d = getItem( stack.id );
		if ( ! d ) return;
		const rows = [];
		const r = ( k, v ) => rows.push( h( 'span', { text: k } ), h( 'span', { text: v } ) );
		r( 'Weight', stackWeight( stack ).toFixed( 2 ) + ' kg' );
		r( 'Size', String( stackVolume( stack ) ) );
		if ( [ 'firearm', 'melee', 'clothing', 'backpack', 'tool', 'attachment' ].includes( d.cat ) ) r( 'Condition', condLabel( stack.cond ) );
		if ( d.firearm ) {
			const f = d.firearm;
			r( 'Calibre', ( f.caliber || '' ).toUpperCase() ); r( 'Damage', String( f.damage * ( f.pellets || 1 ) ) ); r( 'Rate of fire', ( f.rpm || 0 ) + ' rpm' );
			r( 'Modes', ( f.modes || [] ).join( ', ' ) ); r( 'Range', ( f.range || 0 ) + ' m' );
			r( 'Loaded', String( ammoOf( stack ) ) + ( stack.data.mag ? ` (${displayName( stack.data.mag )})` : f.feed === 'internal' ? ` / ${f.capacity}` : '' ) );
			const att = Object.values( stack.data.att || {} ).filter( Boolean ).map( a => getItem( a.id )?.name ).join( ', ' );
			if ( att ) r( 'Attached', att );
		}
		if ( d.magazine ) { r( 'Rounds', `${stack.data.rounds || 0} / ${d.magazine.capacity}` ); r( 'Calibre', ( d.magazine.caliber || '' ).toUpperCase() ); }
		if ( d.ammo ) r( 'Calibre', ( d.ammo.caliber || '' ).toUpperCase() );
		if ( d.melee ) { r( 'Damage', String( d.melee.damage ) ); r( 'Speed', d.melee.speed + '/s' ); r( 'Reach', d.melee.reach + ' m' ); }
		if ( d.clothing || d.backpack ) {
			const c = d.clothing || d.backpack;
			r( 'Slot', SLOT_LABEL[ c.slot ] || c.slot ); if ( c.capacity ) r( 'Storage', String( c.capacity ) );
			if ( c.insulation ) r( 'Insulation', Math.round( c.insulation * 100 ) + '%' );
			if ( c.armor?.bite ) r( 'Bite protection', Math.round( c.armor.bite * 100 ) + '%' );
			if ( c.armor?.bullet ) r( 'Ballistic', Math.round( c.armor.bullet * 100 ) + '%' );
			if ( c.waterproof ) r( 'Waterproof', Math.round( c.waterproof * 100 ) + '%' );
		}
		if ( d.food ) { r( 'Calories', String( d.food.kcal || 0 ) ); if ( d.food.water ) r( 'Water', String( d.food.water ) ); if ( d.food.spoil ) r( 'Freshness', Math.round( freshness( stack ) * 100 ) + '%' ); if ( d.food.raw ) r( 'Raw', 'cook it first' ); if ( d.food.opener ) r( 'Sealed', 'needs a can opener or a blade' ); }
		if ( d.drink ) { r( 'Hydration', String( d.drink.water ?? 0 ) ); if ( d.drink.alcohol ) r( 'Alcohol', 'yes' ); }
		if ( d.medical ) { const m = d.medical; if ( m.bleed ) r( 'Stops bleeding', String( m.bleed ) ); if ( m.heal ) r( 'Heals', String( m.heal ) ); if ( m.infection ) r( 'Treats infection', Math.round( m.infection * 100 ) + '%' ); if ( m.splint ) r( 'Splints fractures', 'yes' ); if ( m.blood ) r( 'Blood', '+' + m.blood + ' ml' ); }
		if ( d.tool?.battery ) r( 'Battery', Math.round( ( stack.data.charge || 0 ) / d.tool.battery * 100 ) + '%' );
		if ( d.tool?.liquid ) r( 'Contents', stack.data.liquid ? `${( stack.data.amount || 0 ).toFixed( 2 )} L ${stack.data.liquid}` : 'empty' );
		if ( d.fuel ) r( 'Fuel', ( stack.data.amount ?? d.fuel.litres ).toFixed( 1 ) + ' L' );
		clear( this.tooltip ).append(
			h( 'div.cat', { text: `${CATEGORY_LABEL[ d.cat ] || d.cat} · ${d.rarity}` } ),
			h( 'h4', { text: displayName( stack ) + ( stack.qty > 1 ? ` ×${stack.qty}` : '' ) } ),
			d.desc ? h( 'div.desc', { text: d.desc } ) : null,
			h( 'div.stats', {}, ...rows ),
			h( 'div.hint', { text: this._defaultLabel( stack, this.hover?.loc ) ? `Double-click: ${this._defaultLabel( stack, this.hover?.loc )}` : '' } ) );
		this.tooltip.hidden = false;
		this._tipMove( e );
	}

	_tipMove( e ) {
		if ( this.tooltip.hidden ) return;
		const r = this.tooltip.getBoundingClientRect();
		let x = e.clientX + 18, y = e.clientY + 14;
		if ( x + r.width > innerWidth - 8 ) x = e.clientX - r.width - 14;
		if ( y + r.height > innerHeight - 8 ) y = innerHeight - r.height - 8;
		this.tooltip.style.left = x + 'px'; this.tooltip.style.top = y + 'px';
	}

	// ---- drag and drop -------------------------------------------------------------------------------

	_down( e, stack, loc, el ) {
		if ( e.button !== 0 ) return;
		if ( e.shiftKey ) { e.preventDefault(); this._quickMove( stack, loc ); return; }
		this.drag = { stack, loc, x: e.clientX, y: e.clientY, active: false, el };
		const move = ( ev ) => {
			const d = this.drag;
			if ( ! d ) return;
			if ( ! d.active && Math.hypot( ev.clientX - d.x, ev.clientY - d.y ) > 5 ) {
				d.active = true;
				d.ghost = h( 'div.drag-ghost', {}, h( 'img', { src: el.querySelector( 'img' ).src } ) );
				document.body.appendChild( d.ghost );
				el.classList.add( 'dragging' );
				this.tooltip.hidden = true;
			}
			if ( d.active ) { d.ghost.style.left = ev.clientX + 'px'; d.ghost.style.top = ev.clientY + 'px'; }
		};
		const up = () => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
			const d = this.drag;
			if ( d && ! d.active && loc.type === 'catalog' ) { this.game.give( stack.id, 1 ); this.app.audio.ui(); this.dirty = true; }
			setTimeout( () => { if ( this.drag === d ) this.drag = null; d?.ghost?.remove(); el.classList.remove( 'dragging' ); }, 0 );
		};
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
	}

	_dropTarget( el, loc ) {
		el.addEventListener( 'pointerenter', () => { if ( this.drag?.active ) el.classList.add( 'drop-ok' ); } );
		el.addEventListener( 'pointerleave', () => el.classList.remove( 'drop-ok' ) );
		el.addEventListener( 'pointerup', ( e ) => {
			el.classList.remove( 'drop-ok' );
			const d = this.drag;
			if ( ! d?.active || d.handled ) return;
			// item-on-item handling ran first (bubbling from the child item)
			if ( e.target.closest( '.item' ) && e.target.closest( '.item' ) !== d.el && d.itemHandled ) return;
			d.handled = true;
			this.move( d.stack, d.loc, loc );
		} );
	}

	_dropOnItem( target, tloc ) {
		const d = this.drag;
		const a = getItem( d.stack.id ), b = getItem( target.id );
		if ( ! a || ! b ) return;
		const H = this.game.hands;
		let done = false;
		if ( a.ammo && b.magazine && a.ammo.caliber === b.magazine.caliber ) { H?.loadMagazine?.( target, d.stack ); done = true; }
		else if ( a.ammo && b.firearm && b.firearm.feed === 'internal' && a.ammo.caliber === b.firearm.caliber ) { H?.loadWeapon?.( target, d.stack ); done = true; }
		else if ( a.magazine && b.firearm && ( b.firearm.mags || [] ).includes( a.id ) ) { H?.insertMagazine?.( target, d.stack ); done = true; }
		else if ( a.attachment && b.firearm ) { H?.attach?.( target, d.stack ); done = true; }
		else if ( a.id === b.id && b.stack > 1 && tloc.items ) {
			const n = Math.min( b.stack - target.qty, d.stack.qty );
			if ( n > 0 ) { target.qty += n; d.stack.qty -= n; if ( d.stack.qty <= 0 ) this._removeFrom( d.stack, d.loc ); this.inv.changed(); done = true; }
		}
		if ( done ) { d.itemHandled = true; d.handled = true; this.dirty = true; this.app.audio.ui(); }
	}

	// ---- moving stacks -------------------------------------------------------------------------------

	_removeFrom( stack, loc ) {
		const inv = this.inv;
		if ( loc.type === 'equip' ) { if ( inv.equip[ loc.slot ] === stack ) delete inv.equip[ loc.slot ]; }
		else if ( loc.type === 'weapon' ) { if ( inv.weapons[ loc.slot ] === stack ) delete inv.weapons[ loc.slot ]; }
		else if ( loc.type === 'ground' ) { this.game.items3d?.remove?.( loc.worldItem, { taken: true } ); }
		else if ( loc.items ) { const i = loc.items.indexOf( stack ); if ( i >= 0 ) loc.items.splice( i, 1 ); }
		if ( inv.hands === stack.uid && ! ( loc.type === 'container' || loc.type === 'weapon' ) ) this.game.hands?.holster?.();
		inv.changed();
		if ( loc.type === 'other' ) this._otherChanged();
	}

	_otherChanged() { if ( this.other ) { this.other.dirty = true; this.game.events.emit( 'container:changed', { container: this.other } ); } }

	// returns true when the stack ended up somewhere
	move( stack, from, to ) {
		const g = this.game, inv = this.inv;
		const def = getItem( stack.id );
		if ( ! def ) return false;
		if ( from.type === to.type && from.slot === to.slot && from.items && from.items === to.items ) return false;
		if ( to.type === 'catalog' ) return false;
		if ( from.type === 'catalog' ) {
			const s = makeStack( stack.id, def.stack > 1 ? def.stack : 1, { full: true } );
			return this._place( s, to ) || true;
		}
		// equipment slots only take matching clothing
		if ( to.type === 'equip' ) {
			const slot = def.clothing?.slot || def.backpack?.slot || ( def.cat === 'backpack' ? 'back' : null );
			if ( slot !== to.slot ) { this._deny( `${def.name} doesn't go there` ); return false; }
			// a container can't go inside itself
			const prev = inv.equip[ to.slot ];
			this._removeFrom( stack, from );
			inv.equip[ to.slot ] = stack;
			if ( prev ) {
				// the previous piece goes where this one came from, else anywhere, else the ground
				if ( ! this._place( prev, from, true ) && inv.add( prev, { autoEquip: false } ) > 0 ) g.dropStack( prev );
			}
			inv.changed();
			this.app.audio.play( 'zipper', { bus: 'ui', vol: 0.4 } );
			return true;
		}
		if ( to.type === 'weapon' ) {
			const ok = to.slot === 'melee' ? def.cat === 'melee' : to.slot === 'sidearm' ? def.cat === 'firearm' && def.firearm.slot === 'sidearm' : def.cat === 'firearm';
			if ( ! ok ) { this._deny( `${def.name} doesn't go in that slot` ); return false; }
			const prev = inv.weapons[ to.slot ];
			this._removeFrom( stack, from );
			inv.weapons[ to.slot ] = stack;
			if ( prev ) { if ( ! this._place( prev, from, true ) && inv.add( prev, { autoEquip: false } ) > 0 ) g.dropStack( prev ); }
			inv.changed();
			return true;
		}
		if ( to.type === 'ground' ) {
			this._removeFrom( stack, from );
			g.dropStack( stack );
			g.events.emit( 'item:drop', { stack } );
			this.app.audio.play( 'drop', { vol: 0.4 } );
			this.dirty = true;
			return true;
		}
		// into a container: never into itself
		const items = to.items || to.container?.items;
		if ( ! items ) return false;
		if ( items === from.items ) return false;
		if ( to.container?.owner === stack ) { this._deny( "It can't go inside itself" ); return false; }
		// dry run on copies so nothing moves when it can't fit at all
		const before = stack.qty;
		const probe = JSON.parse( JSON.stringify( stack ) );
		if ( addToItems( items.map( s => ( { ...s, data: s.data } ) ), to.container.capacity, probe ) >= before ) { this._deny( 'Not enough room' ); return false; }
		const wasHeld = inv.hands === stack.uid;
		this._removeFrom( stack, from );
		const left = addToItems( items, to.container.capacity, stack );
		if ( left > 0 ) {
			// the part that didn't fit goes back where it came from
			if ( ! this._place( stack, from, true ) ) g.dropStack( stack );
			this._deny( 'Only part of it fits' );
		}
		if ( wasHeld && inv.findUid( stack.uid ) ) inv.hands = stack.uid;
		if ( from.type === 'ground' ) { g.events.emit( 'item:pick', { stack } ); this.app.audio.play( 'pickup', { vol: 0.4 } ); }
		if ( from.type === 'other' || to.type === 'other' ) this._otherChanged();
		if ( inv.hands === stack.uid && ! inv.findUid( stack.uid ) ) g.hands?.holster?.();
		inv.changed();
		this.dirty = true;
		return true;
	}

	// put a stack into a location (used for swaps); returns true on success
	_place( stack, loc, swap = false ) {
		const inv = this.inv;
		if ( loc.type === 'equip' ) { if ( inv.equip[ loc.slot ] && ! swap ) return false; const d = getItem( stack.id ); if ( ( d.clothing?.slot || d.backpack?.slot ) !== loc.slot ) return false; inv.equip[ loc.slot ] = stack; return true; }
		if ( loc.type === 'weapon' ) { if ( inv.weapons[ loc.slot ] ) return false; inv.weapons[ loc.slot ] = stack; return true; }
		if ( loc.type === 'ground' ) { this.game.dropStack( stack ); return true; }
		const items = loc.items || loc.container?.items;
		const cap = loc.container?.capacity;
		if ( ! items || cap == null ) return false;
		return addToItems( items, cap, stack ) <= 0;
	}

	_quickMove( stack, loc ) {
		const g = this.game, inv = this.inv;
		if ( loc.type === 'catalog' ) { g.give( stack.id, getItem( stack.id ).stack ); this.dirty = true; return; }
		if ( loc.type === 'ground' || loc.type === 'other' ) {
			const left = inv.add( stack, { autoEquip: loc.type === 'ground' } );
			if ( left <= 0 ) {
				if ( loc.type === 'ground' ) { g.items3d?.remove?.( loc.worldItem, { taken: true } ); g.events.emit( 'item:pick', { stack } ); }
				else { const i = loc.items.indexOf( stack ); if ( i >= 0 ) loc.items.splice( i, 1 ); this._otherChanged(); }
				this.app.audio.play( 'pickup', { vol: 0.4 } );
			} else this._deny( 'Not enough room' );
			inv.changed();
			this.dirty = true;
			return;
		}
		// from me: into the open container, else onto the ground
		if ( this.other ) this.move( stack, loc, { type: 'other', container: this.other, items: this.other.items } );
		else this.move( stack, loc, { type: 'ground' } );
	}

	_takeAll( ground ) {
		const g = this.game, inv = this.inv;
		let n = 0;
		if ( this.other ) for ( const s of [ ...this.other.items ] ) { if ( inv.add( s, { autoEquip: false } ) <= 0 ) { this.other.items.splice( this.other.items.indexOf( s ), 1 ); n ++; } }
		for ( const wi of ground ) { if ( inv.add( wi.stack ) <= 0 ) { g.items3d?.remove?.( wi, { taken: true } ); g.events.emit( 'item:pick', { stack: wi.stack } ); n ++; } }
		if ( this.other ) this._otherChanged();
		if ( n ) this.app.audio.play( 'pickup', { vol: 0.5 } );
		else this._deny( 'Not enough room' );
		inv.changed();
		this.dirty = true;
	}

	_deny( text ) { this.game.toast( text, 'warn' ); this.app.audio.ui( 'ui_error', 0.3 ); }

	// ---- actions --------------------------------------------------------------------------------------

	_defaultLabel( stack, loc ) {
		const d = getItem( stack.id );
		if ( ! loc ) return null;
		if ( loc.type === 'catalog' ) return 'Give';
		if ( loc.type === 'ground' || loc.type === 'other' ) return 'Take';
		if ( loc.type === 'equip' ) return 'Take off';
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) return 'Wear';
		if ( d.cat === 'firearm' || d.cat === 'melee' || d.cat === 'throwable' ) return this.inv.hands === stack.uid ? 'Put away' : 'Hold';
		const acts = this.game.itemUse?.actions?.( stack ) || [];
		return acts[ 0 ]?.label || null;
	}

	_default( stack, loc ) {
		const g = this.game, inv = this.inv;
		const d = getItem( stack.id );
		if ( loc.type === 'catalog' ) return; // single clicks already give
		if ( loc.type === 'ground' || loc.type === 'other' ) { this._quickMove( stack, loc ); return; }
		if ( loc.type === 'equip' ) {
			delete inv.equip[ loc.slot ];
			if ( inv.add( stack, { autoEquip: false } ) > 0 ) { g.dropStack( stack ); g.toast( 'No room — dropped it', 'warn' ); }
			inv.changed(); return;
		}
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) {
			const slot = d.clothing?.slot || d.backpack?.slot || 'back';
			this.move( stack, loc, { type: 'equip', slot } );
			return;
		}
		if ( d.cat === 'firearm' || d.cat === 'melee' || d.cat === 'throwable' ) {
			if ( inv.hands === stack.uid ) g.hands?.holster?.(); else g.hands?.select?.( stack );
			inv.changed(); return;
		}
		const acts = g.itemUse?.actions?.( stack ) || [];
		if ( acts[ 0 ] ) { acts[ 0 ].run(); this.ui.closeScreen(); }
	}

	_menu( e, stack, loc ) {
		this._closeCtx();
		const g = this.game, inv = this.inv, d = getItem( stack.id );
		const items = [];
		const add = ( label, fn, hint = '' ) => items.push( { label, fn, hint } );
		const sep = () => items.push( null );
		if ( loc.type === 'catalog' ) {
			add( 'Give 1', () => g.give( stack.id, 1 ) );
			if ( d.stack > 1 ) add( `Give ${d.stack}`, () => g.give( stack.id, d.stack ) );
			add( 'Give 5', () => g.give( stack.id, 5 ) );
		} else if ( loc.type === 'ground' || loc.type === 'other' ) {
			add( 'Take', () => this._quickMove( stack, loc ), 'Shift-click' );
			if ( d.cat === 'clothing' || d.cat === 'backpack' ) add( 'Wear', () => this.move( stack, loc, { type: 'equip', slot: d.clothing?.slot || d.backpack?.slot || 'back' } ) );
			for ( const a of g.itemUse?.actions?.( stack ) || [] ) if ( ! /drop/i.test( a.label ) ) add( a.label, () => { a.run(); this.dirty = true; } );
		} else {
			const def = this._defaultLabel( stack, loc );
			if ( def ) add( def, () => this._default( stack, loc ), 'Double-click' );
			if ( d.firearm ) {
				const H = g.hands;
				if ( stack.data.mag ) add( 'Remove magazine', () => H?.removeMagazine?.( stack ) );
				if ( ammoOf( stack ) > 0 ) add( 'Unload', () => H?.unloadWeapon?.( stack ) );
				for ( const [ slot, a ] of Object.entries( stack.data.att || {} ) ) if ( a ) add( `Detach ${getItem( a.id )?.name || slot}`, () => H?.detach?.( stack, slot ) );
				const mags = inv.findAll( ( s, dd ) => dd?.magazine && ( d.firearm.mags || [] ).includes( s.id ) );
				if ( mags.length ) add( `Insert magazine (${mags.length})`, () => H?.insertMagazine?.( stack, mags.sort( ( a, b ) => ( b.data.rounds || 0 ) - ( a.data.rounds || 0 ) )[ 0 ] ) );
			}
			if ( d.magazine ) {
				const ammo = inv.find( ( s, dd ) => dd?.ammo && dd.ammo.caliber === d.magazine.caliber );
				if ( ammo && ( stack.data.rounds || 0 ) < d.magazine.capacity ) add( 'Load rounds', () => g.hands?.loadMagazine?.( stack, ammo ) );
				if ( stack.data.rounds > 0 ) add( 'Empty magazine', () => g.hands?.unloadMagazine?.( stack ) );
			}
			if ( d.attachment ) {
				const guns = inv.findAll( ( s, dd ) => dd?.firearm );
				for ( const gun of guns.slice( 0, 4 ) ) add( `Attach to ${getItem( gun.id ).name}`, () => g.hands?.attach?.( gun, stack ) );
			}
			for ( const a of g.itemUse?.actions?.( stack ) || [] ) if ( a.label !== def ) add( a.label, () => { a.run(); this.dirty = true; } );
			sep();
			add( 'Hold in hands', () => g.hands?.select?.( stack ) );
			const hb = inv.hotbar.indexOf( stack.uid );
			if ( hb >= 0 ) add( `Remove from hotbar ${hb + 1}`, () => { inv.hotbar[ hb ] = null; inv.changed(); } );
			else add( 'Add to hotbar', () => { const i = inv.hotbar.indexOf( null ); if ( i >= 0 ) { inv.hotbar[ i ] = stack.uid; inv.changed(); } else this._deny( 'Hotbar full' ); }, 'hover + 1–9' );
			if ( stack.qty > 1 && loc.items ) add( 'Split stack', () => this._split( e, stack, loc ) );
			if ( this.other ) add( `Put in ${this.other.label}`, () => this._quickMove( stack, loc ) );
			add( 'Drop', () => this.move( stack, loc, { type: 'ground' } ) );
			if ( g.mode === 'creative' ) add( 'Delete', () => { this._removeFrom( stack, loc ); } );
		}
		const menu = h( 'div.ctx.tw-glass', {}, ...items.map( it => it ? h( 'button', { onclick: () => { this._closeCtx(); this.app.audio.ui(); it.fn(); this.dirty = true; } }, h( 'span', { text: it.label } ), h( 'span.dim', { text: it.hint } ) ) : h( 'hr' ) ) );
		menu.style.left = Math.min( e.clientX, innerWidth - 220 ) + 'px';
		menu.style.top = Math.min( e.clientY, innerHeight - items.length * 32 - 20 ) + 'px';
		this.el.appendChild( menu );
		this.ctx = menu;
		this.tooltip.hidden = true;
	}

	_closeCtx() { this.ctx?.remove(); this.ctx = null; this.splitEl?.remove(); this.splitEl = null; }

	_split( e, stack, loc ) {
		const val = h( 'span.mono', { text: String( Math.floor( stack.qty / 2 ) ) } );
		const inp = h( 'input', { type: 'range', min: 1, max: stack.qty - 1, value: Math.floor( stack.qty / 2 ), oninput: () => { val.textContent = inp.value; } } );
		const el = h( 'div.split.tw-glass', {}, h( 'div', { text: `Split ${displayName( stack )}` } ), h( 'div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, inp, val ),
			h( 'button.btn.small.primary', { text: 'Split', onclick: () => {
				const n = + inp.value;
				const part = JSON.parse( JSON.stringify( stack ) );
				part.uid = stack.uid + 's' + Math.random().toString( 36 ).slice( 2, 5 );
				part.qty = n; stack.qty -= n;
				loc.items.push( part );
				this.inv.changed();
				this._closeCtx();
			} } ) );
		el.style.left = Math.min( e.clientX, innerWidth - 260 ) + 'px'; el.style.top = Math.min( e.clientY, innerHeight - 120 ) + 'px';
		this.el.appendChild( el );
		this.splitEl = el;
	}

	// ---- crafting / catalog ------------------------------------------------------------------------------

	_crafting() {
		const C = this.game.crafting;
		if ( ! C ) return h( 'div.cont-empty', { text: 'Crafting is not available.' } );
		const list = h( 'div.recipes' );
		const recipes = [ ...( C.recipes || [] ) ].sort( ( a, b ) => ( C.canCraft( b ) ? 1 : 0 ) - ( C.canCraft( a ) ? 1 : 0 ) );
		for ( const r of recipes ) {
			const can = C.canCraft( r );
			const img = h( 'img' ); setIcon( img, r.out[ 0 ] );
			const inv = this.inv;
			const need = h( 'div.need', {},
				...r.in.map( ( [ id, q ], i ) => h( 'span.' + ( inv.count( id ) >= q ? 'have' : 'miss' ), { text: `${i ? ', ' : ''}${q}× ${getItem( id )?.name || id}` } ) ),
				...( r.tools || [] ).map( t => h( 'span.' + ( inv.hasTool( t ) ? 'have' : 'miss' ), { text: ` · ${t}` } ) ),
				r.station ? h( 'span.' + ( this.game.nearFire?.( this.game.player.pos ) ? 'have' : 'miss' ), { text: ` · at a ${r.station}` } ) : null );
			list.appendChild( h( 'div.recipe' + ( can ? '.can' : '' ), {}, img, h( 'div', {}, h( 'div', { text: r.name + ( r.out[ 1 ] > 1 ? ` ×${r.out[ 1 ]}` : '' ) } ), need ),
				h( 'button.btn.small' + ( can ? '.primary' : '' ), { text: 'Craft', disabled: ! can, onclick: () => { C.craft( r ); this.ui.closeScreen(); } } ) ) );
		}
		if ( ! recipes.length ) list.appendChild( h( 'div.cont-empty', { text: 'No recipes.' } ) );
		return list;
	}

	_catalog() {
		const wrap = h( 'div' );
		const search = h( 'input.input', { placeholder: 'Search items…', value: this.search, oninput: e => { this.search = e.target.value; draw(); } } );
		const cats = [ 'all', ...new Set( [ ...ITEMS.values() ].map( d => d.cat ) ) ];
		const tabs = h( 'div.cat-tabs', { style: { margin: '6px 0' } } );
		const grid = h( 'div.creative-grid' );
		const draw = () => {
			clear( tabs );
			for ( const c of cats ) tabs.appendChild( h( 'button' + ( this.catFilter === c ? '.on' : '' ), { text: c === 'all' ? 'All' : CATEGORY_LABEL[ c ] || c, onclick: () => { this.catFilter = c; draw(); } } ) );
			clear( grid );
			const q = this.search.toLowerCase();
			const list = [ ...ITEMS.values() ].filter( d => ( this.catFilter === 'all' || d.cat === this.catFilter ) && ( ! q || d.name.toLowerCase().includes( q ) || d.id.includes( q ) ) );
			for ( const d of list.slice( 0, 400 ) ) grid.appendChild( this._item( { uid: 'cat:' + d.id, id: d.id, qty: 1, cond: 1, data: {} }, { type: 'catalog' } ) );
			if ( ! list.length ) grid.appendChild( h( 'div.cont-empty', { text: 'Nothing matches.' } ) );
		};
		draw();
		wrap.append( search, tabs, h( 'div.dim', { style: { fontSize: '11px', marginBottom: '4px' }, text: `${ITEMS.size} items · click to take one, Shift-click for a full stack, or drag` } ), grid );
		setTimeout( () => search.focus(), 30 );
		return wrap;
	}
}

// helpers kept for other UI code
export { itemsOf, capacityOf, containerWeight };
