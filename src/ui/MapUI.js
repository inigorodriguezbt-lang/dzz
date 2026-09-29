// Full-screen map: pan with drag, zoom with the wheel (towards the cursor), double-click to place a
// marker, right-click a marker to remove it, C to centre on yourself, creative players can
// Shift+click to teleport.
import { h, fmtDist } from './dom.js';

export class MapUI {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.view = null;
	}

	open() {
		const g = this.ui.game;
		const p = g.player.pos;
		if ( ! this.view ) this.view = { cx: p.x, cz: p.z, ppm: 0.06 };
		else { this.view.cx = p.x; this.view.cz = p.z; }
		const canvas = h( 'canvas' );
		const coords = h( 'div.map-coords.tw-glass' );
		const title = h( 'div.map-title.tw-glass', {}, h( 'h2', { text: this.ui.locationName( p, true ) } ), h( 'div.sub', { text: 'Drag to pan · wheel to zoom · double-click to mark · C to centre' + ( g.mode === 'creative' ? ' · Shift-click to teleport' : '' ) } ) );
		const legend = h( 'div.map-legend.tw-glass', { html: `
			<div><span class="sw" style="background:#ffc861"></span>Freeway</div><div><span class="sw" style="background:#fbf6e8"></span>Highway / street</div>
			<div><span class="sw" style="background:#96704a"></span>Dirt road</div><div><span class="sw" style="background:#5c544e"></span>Building</div>
			<div><span class="sw" style="background:#5fe3d4"></span>Marker</div><div><span class="sw" style="background:#ff7a85"></span>Your body</div>` } );
		const zoomBtns = h( 'div', { style: { display: 'flex', gap: '6px' } },
			h( 'button.btn.small', { text: '+', onclick: () => this._zoom( 1.5 ) } ), h( 'button.btn.small', { text: '−', onclick: () => this._zoom( 1 / 1.5 ) } ),
			h( 'button.btn.small', { text: 'Me', onclick: () => { this.view.cx = g.player.pos.x; this.view.cz = g.player.pos.z; } } ),
			h( 'button.btn.small', { text: 'Islands', onclick: () => { this.view.cx = 0; this.view.cz = 0; this.view.ppm = Math.min( innerWidth / ( this.app.world.meta.halfX * 2.1 ), innerHeight / ( this.app.world.meta.halfZ * 2.1 ) ); } } ),
			h( 'button.btn.small', { text: 'Close', onclick: () => this.ui.closeScreen() } ) );
		const ui = h( 'div.map-ui', {}, title, zoomBtns );
		const el = h( 'div.map-screen', {}, canvas, ui, legend, coords );
		this.canvas = canvas; this.coords = coords; this.el = el;
		let drag = null;
		el.addEventListener( 'pointerdown', e => {
			if ( e.target !== canvas ) return;
			if ( e.button === 0 && e.shiftKey && g.mode === 'creative' ) {
				const [ x, z ] = this._toWorld( e.offsetX, e.offsetY );
				g.commands?.teleport( x, null, z );
				g.toast( 'Teleported', 'good' );
				this.ui.closeScreen();
				return;
			}
			if ( e.button === 2 ) {
				const m = this._markerAt( e.offsetX, e.offsetY );
				if ( m ) g.markers.remove( m.id );
				return;
			}
			drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz };
			el.classList.add( 'drag' );
			canvas.setPointerCapture( e.pointerId );
		} );
		el.addEventListener( 'pointermove', e => {
			if ( drag ) {
				this.view.cx = drag.cx - ( e.clientX - drag.x ) / this.view.ppm;
				this.view.cz = drag.cz - ( e.clientY - drag.y ) / this.view.ppm;
			}
			const [ x, z ] = this._toWorld( e.offsetX, e.offsetY );
			const d = Math.hypot( x - g.player.pos.x, z - g.player.pos.z );
			const hgt = g.hf.baseHeight( x, z );
			coords.textContent = `${Math.round( x )}, ${Math.round( z )}  ·  ${hgt >= 0 ? 'elev ' + Math.round( hgt * 6 ) + ' m (real)' : 'depth ' + Math.round( - hgt * 6 ) + ' m'}  ·  ${fmtDist( d )} away`;
		} );
		el.addEventListener( 'pointerup', () => { drag = null; el.classList.remove( 'drag' ); } );
		el.addEventListener( 'dblclick', e => {
			const [ x, z ] = this._toWorld( e.offsetX, e.offsetY );
			g.markers.add( { x, z, label: 'Marker ' + ( g.markers.list().filter( m => m.kind === 'user' ).length + 1 ), kind: 'user' } );
			this.app.audio.ui();
		} );
		el.addEventListener( 'wheel', e => {
			e.preventDefault();
			const [ wx, wz ] = this._toWorld( e.offsetX, e.offsetY );
			const f = Math.pow( 1.0015, - e.deltaY );
			this.view.ppm = Math.max( 0.012, Math.min( 6, this.view.ppm * f ) );
			// keep the point under the cursor fixed
			const [ nx, nz ] = this._toWorld( e.offsetX, e.offsetY );
			this.view.cx += wx - nx; this.view.cz += wz - nz;
		}, { passive: false } );
		el.addEventListener( 'contextmenu', e => e.preventDefault() );
		this.keyHandler = e => { if ( e.code === 'KeyC' ) { this.view.cx = g.player.pos.x; this.view.cz = g.player.pos.z; } };
		window.addEventListener( 'keydown', this.keyHandler );
		this.ui.show( el, { map: true, onClose: () => window.removeEventListener( 'keydown', this.keyHandler ) } );
		this._resize();
	}

	_resize() {
		const dpr = Math.min( 2, devicePixelRatio || 1 );
		this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
		this.dpr = dpr;
	}

	_zoom( f ) { this.view.ppm = Math.max( 0.012, Math.min( 6, this.view.ppm * f ) ); }

	_toWorld( sx, sy ) { return [ this.view.cx + ( sx - innerWidth / 2 ) / this.view.ppm, this.view.cz + ( sy - innerHeight / 2 ) / this.view.ppm ]; }

	_markerAt( sx, sy ) {
		const g = this.ui.game;
		for ( const m of g.markers.list() ) {
			const x = innerWidth / 2 + ( m.x - this.view.cx ) * this.view.ppm, y = innerHeight / 2 + ( m.z - this.view.cz ) * this.view.ppm;
			if ( Math.hypot( x - sx, y - sy ) < 12 ) return m;
		}
		return null;
	}

	update() {
		if ( ! this.canvas || ! this.el.isConnected ) return;
		const g = this.ui.game, dpr = this.dpr;
		if ( this.canvas.width !== Math.round( innerWidth * dpr ) ) this._resize();
		const ctx = this.canvas.getContext( '2d' );
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		const W = innerWidth, H = innerHeight;
		const { toScreen } = this.ui.mapView.draw( ctx, { cx: this.view.cx, cz: this.view.cz, ppm: this.view.ppm, rot: 0, w: W, h: H } );
		// grid (1 km) when zoomed in
		if ( this.view.ppm > 0.08 ) {
			ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
			const step = this.view.ppm > 0.6 ? 250 : 1000;
			const x0 = Math.floor( ( this.view.cx - W / 2 / this.view.ppm ) / step ) * step, z0 = Math.floor( ( this.view.cz - H / 2 / this.view.ppm ) / step ) * step;
			ctx.beginPath();
			for ( let x = x0; x < this.view.cx + W / 2 / this.view.ppm; x += step ) { const [ sx ] = toScreen( x, 0 ); ctx.moveTo( sx, 0 ); ctx.lineTo( sx, H ); }
			for ( let z = z0; z < this.view.cz + H / 2 / this.view.ppm; z += step ) { const [ , sy ] = toScreen( 0, z ); ctx.moveTo( 0, sy ); ctx.lineTo( W, sy ); }
			ctx.stroke();
		}
		// markers
		ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
		for ( const m of g.markers.list() ) {
			const [ sx, sy ] = toScreen( m.x, m.z );
			ctx.fillStyle = m.kind === 'death' ? '#ff7a85' : m.kind === 'locate' ? '#ffb86b' : '#5fe3d4';
			ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo( sx, sy - 12 ); ctx.lineTo( sx + 7, sy - 4 ); ctx.lineTo( sx, sy + 4 ); ctx.lineTo( sx - 7, sy - 4 ); ctx.closePath(); ctx.stroke(); ctx.fill();
			ctx.lineWidth = 3; ctx.strokeText( m.label, sx + 10, sy - 4 ); ctx.fillStyle = '#fff'; ctx.fillText( m.label, sx + 10, sy - 4 );
		}
		// vehicles the player has used
		for ( const v of g.vehicles?.known?.() || [] ) {
			const [ sx, sy ] = toScreen( v.pos.x, v.pos.z );
			ctx.fillStyle = '#b7a5ff'; ctx.beginPath(); ctx.arc( sx, sy, 4, 0, Math.PI * 2 ); ctx.fill();
		}
		// the player
		const p = g.player.vehicle && g.vehicles?.driving ? g.vehicles.driving.pos : g.player.pos;
		const [ px, py ] = toScreen( p.x, p.z );
		ctx.save(); ctx.translate( px, py ); ctx.rotate( - g.player.yaw );
		ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( 0, - 11 ); ctx.lineTo( 8, 9 ); ctx.lineTo( 0, 4 ); ctx.lineTo( - 8, 9 ); ctx.closePath(); ctx.stroke(); ctx.fill();
		ctx.restore();
		// scale bar
		const target = 120 / this.view.ppm;
		const nice = [ 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000 ].find( v => v >= target ) || 20000;
		const len = nice * this.view.ppm;
		ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect( W - len - 30, H - 70, len + 14, 26 );
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( W - len - 23, H - 52 ); ctx.lineTo( W - 23, H - 52 ); ctx.stroke();
		ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText( fmtDist( nice ) + ' (game)', W - len / 2 - 23, H - 62 );
	}
}
