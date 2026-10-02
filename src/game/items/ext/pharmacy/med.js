// The pharmacy's rules around using a medical item (hooks.js addMedHook, run by ItemUse.medicate). Node-safe.
//   check: what each treatment needs: a remedy refuses when there is nothing it treats (`need`), a bandage dresses an
//     open cut that has no clean dressing even when it no longer bleeds, a disinfectant cleans an open cut, antibiotics
//     treat leptospirosis, the AED only shocks someone near death, surgery wants light and something to fix;
//   done: the dressing that came off is a used bandage, nitrile gloves keep a new dressing cleaner, practice for the
//     treatments the base rules don't count, the outcome of surgery, the AED's shock.
import { addMedHook } from '../../hooks.js';
import { ensurePharmSound, PHARM_SOUNDS } from './sounds.js';

export const AED_BELOW = 30; // health under which the AED shocks
// a field operation's chance: half of them go well untrained, practice and the first aid manual help
export function surgeryChance( level, manual ) { return Math.min( 0.95, 0.5 + level * 0.06 + ( manual ? 0.15 : 0 ) ); }

// what a treatment would do now: a refusal reason, true (allow what the base rules refuse), or null (the base rules)
export function medCheck( S, d, use ) {
	const m = d.medical;
	if ( d.id === 'defibrillator' ) return S.health < AED_BELOW ? true : 'No shock advised';
	if ( d.id === 'surgery_kit' ) {
		if ( use?.canSee && ! use.canSee() ) return 'Too dark';
		return S.bleeding > 0 || S.cut > 0 || ( S.fracture && ! S.splint ) || S.wound > 0 ? true : 'Nothing to treat';
	}
	if ( m.need ) return m.need.some( k => S.ailing( k ) > 0.02 ) ? true : ( m.needMsg || 'Nothing to treat' );
	// a dressing over an open cut that has none, or a dirty one (bleeding is the base rules' case)
	if ( m.bleed && S.bleeding <= 0 ) {
		if ( S.ailing( 'wound' ) ) return true;
		if ( S.wound > 0 ) return 'Dressing clean';
		return null;
	}
	// medicine with a lasting effect is taken any time (doxycycline before drinking from a stream)
	if ( m.fx && ! m.bleed ) return true;
	// a disinfectant on an open cut or an infected one; antibiotics on leptospirosis
	if ( m.infection && ! S.infected ) {
		if ( S.ailing( 'dirty' ) || S.cut > 0 || ( m.infection >= 0.3 && S.ailing( 'lepto' ) > 0 ) ) return true;
		if ( S.wound > 0 && ! m.heal && ! m.pain ) return 'Cut is clean';
	}
	return null;
}

// after Survival.medicate: res = { treated, replaced }
export function medDone( S, d, use, res ) {
	const g = use.game, m = d.medical;
	if ( res?.replaced ) { use.give( 'bandage_dirty', 1 ); g.toast( 'Dressing changed', 'info' ); }
	// nitrile gloves on while dressing a cut: less dirt in it
	if ( ( m.bleed || m.dress ) && S.dressing ) {
		const gl = g.player.inventory?.equip?.hands;
		if ( gl?.id === 'latex_gloves' ) { S.dressK = 0.5; gl.cond = Math.max( 0.05, gl.cond - 0.08 ); }
	}
	// practice for what the base rules don't count (a cure, a sling, a cream)
	if ( res?.treated && ! ( m.bleed || m.splint || m.infection || m.heal || m.blood ) ) use.xp( 'first_aid', 2 );
	if ( d.id === 'surgery_kit' ) operate( S, use );
	if ( d.id === 'defibrillator' ) {
		S.panic = 0; S.damageFlash = Math.min( 1, ( S.damageFlash || 0 ) + 0.5 );
		if ( g.player ) g.player.shake = Math.max( g.player.shake || 0, 0.6 );
		g.toast( 'Shock delivered', 'good' );
		use.xp( 'first_aid', 6 );
	}
}

// surgery: a broken leg set, an infected cut cut out, the wound closed clean; or it goes badly
export function operate( S, use, roll = Math.random() ) {
	const g = use.game;
	const ok = roll < surgeryChance( use.skills?.level?.( 'first_aid' ) || 0, !! use.knowledge?.first_aid );
	if ( ok ) {
		if ( S.fracture ) { S.splint = true; S.fractureHeal = Math.max( S.fractureHeal, 600 ); }
		S.cut = 0; S.woundClean = true;
		if ( S.wound > 0 ) { S.dressing = 1; S.dressAge = 0; }
		g.toast( 'Operation done', 'good' );
		use.xp( 'first_aid', 14 );
	} else {
		S.health -= 20; S.bleeding = Math.min( 6, S.bleeding + 1 ); S.pain = 1;
		S.openWound?.();
		g.toast( 'Operation went badly', 'bad' );
		use.xp( 'first_aid', 6 );
	}
	return ok;
}

addMedHook( {
	check( stack, d, use ) {
		const s = d.medical?.sound;
		if ( s && PHARM_SOUNDS.includes( s ) ) ensurePharmSound( use.game.audio, s );
		return use.S?.ailing ? medCheck( use.S, d, use ) : null;
	},
	done( stack, d, use, res ) { if ( use.S?.ailing ) medDone( use.S, d, use, res ); },
} );
