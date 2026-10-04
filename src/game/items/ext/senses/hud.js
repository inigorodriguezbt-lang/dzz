// The senses equipment's readouts in the DayZ HUD's bottom-right column (browser only, loaded by runtime.js), drawn
// with the HUD's own classes so they read like the vehicle panel and the weapon readout:
//   dive     a dive computer under water (depth, dive time and deepest, air from the regulator's gauge, the no-stop
//            time or a SLOW / DECO / TOO DEEP warning), or just the gauge's air without the computer
//   lines    one short line each: a gas detector's reading, what the parabolic microphone hears, the spotting scope's
//            range to the centre, the laser's range and how many follow it
import { h } from '../../../../ui/dom.js';
import { icon, PATHS } from '../../../../ui/icons.js';
import { getItem } from '../../ItemDB.js';
import * as L from './logic.js';

// glyphs for the panel (24-grid outline icons, as the set's)
PATHS.clock ??= '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
PATHS.depth ??= '<path d="M3 6.5c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0M12 10v10M8.5 16.5 12 20l3.5-3.5"/>';
PATHS.ndl ??= '<path d="M12 4.5v15M7 9.5l5-5 5 5"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3"/>';

const fmtM = ( m ) => m < 10 ? m.toFixed( 1 ) : String( Math.round( m ) );

export class SensesHUD {
	constructor( sys ) {
		this.sys = sys;
		this.game = sys.game;
		const hud = this.game.app.ui.hud;
		this.hudRef = hud;
		this.t = 0;
		this.dive = h( 'div.veh.senses-dive', { hidden: true },
			h( 'div.vn', {}, this.dName = h( 'span', { text: 'Dive' } ), this.dWarn = h( 'span.gear', { hidden: true } ) ),
			h( 'div.vs', {}, this.dDepth = h( 'span.n', { text: '0.0' } ), h( 'span.u', { text: 'm' } ) ),
			this.dTimeRow = h( 'div.vg', {}, icon( 'clock' ), this.dTime = h( 'span.pc' ) ),
			this.dAirRow = h( 'div.vg', {}, icon( 'breath' ), h( 'div.bar', {}, this.dAir = h( 'i' ) ), this.dAirPc = h( 'span.pc' ) ),
			this.dNdlRow = h( 'div.vg', {}, icon( 'ndl' ), this.dNdl = h( 'span.pc' ) ) );
		this.lines = h( 'div.wpn.senses-read', { hidden: true } );
		this.lineEls = [];
		const br = hud.br;
		if ( br ) { br.insertBefore( this.lines, hud.weapon || br.firstChild ); br.insertBefore( this.dive, this.lines ); }
	}

	update( dt ) {
		this.t += dt;
		if ( this.t < 0.1 ) return;
		this.t = 0;
		const g = this.game, sys = this.sys, inv = g.player.inventory, D = sys.dive;
		// ---- the dive panel ----
		const comp = sys.diveComputer(), eq = inv.equip;
		const gauge = eq.back?.id === 'scuba_set' ? eq.back : eq.vest?.id === 'rebreather' ? eq.vest : null;
		const show = ( comp || gauge ) && ( D.under || D.since < 8 ) && ! g.dead;
		this.dive.hidden = ! show;
		if ( show ) {
			this.dName.textContent = comp ? 'Dive computer' : gauge.id === 'rebreather' ? 'Rebreather' : 'Air gauge';
			this.dDepth.parentElement.hidden = ! comp;
			this.dTimeRow.hidden = ! comp;
			this.dNdlRow.hidden = ! comp;
			if ( comp ) {
				this.dDepth.textContent = fmtM( D.depth );
				this.dTime.textContent = `${L.mmss( D.t )} · max ${fmtM( D.max )} m`;
				const reb = gauge?.id === 'rebreather' && D.depth > L.REBREATHER.maxDepth;
				const n = L.ndl( D.n, D.depth );
				let warn = null;
				if ( reb ) warn = 'Too deep';
				else if ( D.fast ) warn = 'Slow';
				else if ( n === 0 ) warn = 'Deco';
				this.dWarn.hidden = ! warn;
				if ( warn ) this.dWarn.textContent = warn;
				this.dNdl.textContent = D.under ? ( n >= 99 ? 'No stop' : `No stop ${n} min` ) : D.n > 0.3 ? 'Off-gassing' : 'Surface';
				this.dNdlRow.className = 'vg' + ( warn ? ' crit' : n < 5 && D.depth > L.BENDS.from ? ' warn' : '' );
			} else this.dWarn.hidden = true;
			this.dAirRow.hidden = ! gauge;
			if ( gauge ) {
				let k, label;
				if ( gauge.id === 'rebreather' ) { k = Math.min( gauge.data.o2 / L.REBREATHER.o2, gauge.data.scrub / L.REBREATHER.scrub ); label = L.pct( k ); }
				else { k = ( gauge.data.air || 0 ) / L.DIVE.bar; label = `${Math.round( gauge.data.air || 0 )} bar`; }
				this.dAir.style.transform = `scaleX(${L.clamp( k, 0, 1 ).toFixed( 3 )})`;
				this.dAirPc.textContent = label;
				this.dAirRow.className = 'vg' + ( gauge.id === 'scuba_set' ? ( gauge.data.air < L.DIVE.low ? ' crit' : gauge.data.air < L.DIVE.reserve ? ' warn' : '' ) : k < 0.1 ? ' crit' : k < 0.25 ? ' warn' : '' );
			}
		}
		// ---- the one-line readouts ----
		const out = [];
		if ( sys.detector && sys.ppm >= 0.05 ) out.push( [ 'Gas detector', `SO₂ ${sys.ppm < 10 ? sys.ppm.toFixed( 1 ) : Math.round( sys.ppm )} ppm`, sys.ppm >= L.DETECTOR.high ? 'alarm' : sys.ppm >= 1 ? 'warn' : '' ] );
		if ( sys.mic.on ) {
			const m = sys.mic, P = g.player.pos;
			out.push( [ 'Listening', m.count ? `${m.count} infected · ${L.fmtDist( m.near.d )} ${L.cardinal( m.near.x - P.x, m.near.z - P.z )}` : 'Nothing', m.count ? 'warn' : '' ] );
		}
		if ( sys.scope ) {
			const cam = g.camera, dir = cam.getWorldDirection( this._d || ( this._d = cam.position.clone() ) );
			const hit = g.physics?.raycast?.( cam.position, dir, 2500 );
			out.push( [ `Spotting scope ${L.SCOPE.zoom}×`, hit ? L.fmtDist( hit.t ) : '—', '' ] );
		}
		if ( sys.laser.on ) out.push( [ 'Laser', sys.laser.hit ? `${L.fmtDist( g.camera.position.distanceTo( sys.laser.hit ) )}${sys.laser.lured ? ` · ${sys.laser.lured} following` : ''}` : 'No dot', sys.laser.lured ? 'warn' : '' ] );
		const v = sys.view;
		if ( v.mode && v.src ) {
			const d = getItem( v.src.id ), k = L.fracOf( v.src, d );
			if ( k < 0.15 ) out.push( [ d.name, `Battery ${L.pct( k )}`, 'warn' ] );
		}
		this.lines.hidden = ! out.length || g.dead;
		while ( this.lineEls.length < out.length ) {
			const row = h( 'div.wa' ), name = h( 'div.wn' ), val = h( 'span.m' );
			row.append( val );
			this.lines.append( name, row );
			this.lineEls.push( { name, row, val } );
		}
		this.lineEls.forEach( ( e, i ) => {
			const o = out[ i ];
			e.name.hidden = e.row.hidden = ! o;
			if ( ! o ) return;
			e.name.textContent = o[ 0 ];
			e.val.textContent = o[ 1 ];
			e.row.className = 'wa' + ( o[ 2 ] ? ' ' + o[ 2 ] : '' );
			e.val.style.color = o[ 2 ] === 'alarm' ? 'var(--alarm)' : o[ 2 ] === 'warn' ? 'var(--warn)' : '';
		} );
	}

	dispose() {
		this.dive.remove();
		this.lines.remove();
	}
}
