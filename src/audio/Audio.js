// Audio engine: buses (sfx / ambient / music / ui), 3D voices with HRTF panning, recorded CC0 field
// sounds from Tidewater and the procedural bank in Synth.js, plus the island ambience mixer.
import * as THREE from 'three';
import { renderSynth, SYNTH } from './Synth.js';

const FILES = {
	surf_far: 'surf_far', surf_wash: 'surf_wash', surf_crash: 'surf_crash', wind: 'wind', palms: 'palms', birds_dawn: 'birds_dawn',
	bird_forest: 'bird_forest', bird_dove: 'bird_dove', crickets: 'crickets', gull: 'gull', tern: 'tern', step_sand: 'step_sand',
	step_wetsand: 'step_wetsand', step_grass: 'step_grass', step_rock: 'step_rock', step_wood: 'step_wood', step_water: 'step_water',
	splash: 'splash', big_splash: 'big_splash', swim: 'swim', uw_swim: 'uw_swim', under_reef: 'under_reef', submerge: 'submerge',
	emerge: 'emerge', boat_engine: 'boat_engine', boat_rush: 'boat_rush', hull_slap: 'hull_slap', pier_lap: 'pier_lap', coins: 'coins', plop: 'plop',
};

export class Audio {
	constructor( settings ) {
		this.settings = settings;
		this.ctx = null;
		this.buffers = new Map();
		this.loading = new Map();
		this.listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3( 0, 0, - 1 ), up: new THREE.Vector3( 0, 1, 0 ) };
		this.loops = new Map();
		this.voices = 0;
		this.muted = false;
	}

	// the context can only start after a user gesture
	init() {
		if ( this.ctx ) { if ( this.ctx.state === 'suspended' ) this.ctx.resume(); return; }
		const AC = window.AudioContext || window.webkitAudioContext;
		if ( ! AC ) return;
		this.ctx = new AC();
		const c = this.ctx;
		this.master = c.createGain();
		this.comp = c.createDynamicsCompressor();
		this.comp.threshold.value = - 10; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
		this.master.connect( this.comp ).connect( c.destination );
		this.bus = {};
		for ( const b of [ 'sfx', 'ambient', 'music', 'ui' ] ) { this.bus[ b ] = c.createGain(); this.bus[ b ].connect( this.master ); }
		this.applyVolumes();
		this.settings.on( '*', ( k ) => { if ( k.endsWith( 'Volume' ) ) this.applyVolumes(); } );
		for ( const k in FILES ) this._load( k );
		// render the procedural bank in idle slices
		const names = Object.keys( SYNTH );
		const step = () => {
			const t0 = performance.now();
			while ( names.length && performance.now() - t0 < 12 ) { const n = names.shift(); if ( ! this.buffers.has( n ) ) this.buffers.set( n, renderSynth( c, n ) ); }
			if ( names.length ) setTimeout( step, 16 );
		};
		setTimeout( step, 50 );
	}

	applyVolumes() {
		if ( ! this.ctx ) return;
		const s = this.settings;
		this.master.gain.value = this.muted ? 0 : s.get( 'masterVolume' );
		this.bus.sfx.gain.value = s.get( 'sfxVolume' );
		this.bus.ambient.gain.value = s.get( 'ambientVolume' );
		this.bus.music.gain.value = s.get( 'musicVolume' );
		this.bus.ui.gain.value = s.get( 'uiVolume' );
	}

	_load( name ) {
		if ( this.loading.has( name ) ) return this.loading.get( name );
		const p = fetch( `audio/${FILES[ name ]}.ogg` ).then( r => r.arrayBuffer() ).then( b => this.ctx.decodeAudioData( b ) ).then( buf => { this.buffers.set( name, buf ); return buf; } ).catch( () => null );
		this.loading.set( name, p );
		return p;
	}

	buffer( name ) {
		if ( ! this.ctx ) return null;
		let b = this.buffers.get( name );
		if ( b ) return b;
		if ( SYNTH[ name ] ) { b = renderSynth( this.ctx, name ); this.buffers.set( name, b ); return b; }
		if ( FILES[ name ] ) this._load( name );
		return null;
	}

	setListener( camera ) {
		if ( ! this.ctx ) return;
		const L = this.ctx.listener;
		const p = camera.position;
		const f = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( camera.quaternion );
		const u = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( camera.quaternion );
		this.listener.pos.copy( p ); this.listener.fwd.copy( f );
		const t = this.ctx.currentTime;
		if ( L.positionX ) {
			L.positionX.setTargetAtTime( p.x, t, 0.02 ); L.positionY.setTargetAtTime( p.y, t, 0.02 ); L.positionZ.setTargetAtTime( p.z, t, 0.02 );
			L.forwardX.setTargetAtTime( f.x, t, 0.02 ); L.forwardY.setTargetAtTime( f.y, t, 0.02 ); L.forwardZ.setTargetAtTime( f.z, t, 0.02 );
			L.upX.setTargetAtTime( u.x, t, 0.02 ); L.upY.setTargetAtTime( u.y, t, 0.02 ); L.upZ.setTargetAtTime( u.z, t, 0.02 );
		} else {
			L.setPosition( p.x, p.y, p.z ); L.setOrientation( f.x, f.y, f.z, u.x, u.y, u.z );
		}
	}

	// play a one-shot. opts: { pos (Vector3, 3D), vol, rate, bus, ref (m at full volume), max (m), detune (random ±), lowpass }
	play( name, opts = {} ) {
		const buf = this.buffer( name );
		if ( ! buf || this.voices > 48 ) return null;
		const c = this.ctx;
		const src = c.createBufferSource();
		src.buffer = buf;
		const rate = ( opts.rate || 1 ) * ( 1 + ( Math.random() - 0.5 ) * ( opts.detune ?? 0.08 ) );
		src.playbackRate.value = rate;
		const g = c.createGain();
		g.gain.value = opts.vol ?? 1;
		let node = src;
		if ( opts.lowpass ) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass; node.connect( f ); node = f; }
		if ( opts.pos ) {
			const d = this.listener.pos.distanceTo( opts.pos );
			const max = opts.max || 120;
			if ( d > max ) return null;
			// distant sounds lose their highs (air absorption)
			if ( d > 60 && ! opts.lowpass ) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max( 700, 16000 * Math.exp( - d / 260 ) ); node.connect( f ); node = f; }
			const pan = c.createPanner();
			pan.panningModel = d < 40 ? 'HRTF' : 'equalpower';
			pan.distanceModel = 'inverse';
			pan.refDistance = opts.ref || 2;
			pan.rolloffFactor = opts.rolloff ?? 1;
			pan.maxDistance = max;
			pan.positionX.value = opts.pos.x; pan.positionY.value = opts.pos.y; pan.positionZ.value = opts.pos.z;
			node.connect( pan ); node = pan;
			// speed of sound: far gunshots arrive late
			if ( d > 40 && opts.delay !== false ) { src.start( c.currentTime + d / 343 ); node.connect( g ).connect( this.bus[ opts.bus || 'sfx' ] ); this._track( src ); return src; }
		}
		node.connect( g ).connect( this.bus[ opts.bus || 'sfx' ] );
		src.start( c.currentTime + ( opts.at || 0 ) );
		this._track( src );
		return src;
	}

	_track( src ) {
		this.voices ++;
		src.onended = () => { this.voices --; };
	}

	ui( name = 'ui_click', vol = 0.6 ) { this.play( name, { bus: 'ui', vol, detune: 0.02 } ); }

	footstep( surface, vol = 0.5 ) {
		const map = { sand: 'step_sand', wetsand: 'step_wetsand', grass: 'step_grass', rock: 'step_rock', wood: 'step_wood', water: 'step_water', concrete: 'step_concrete', metal: 'step_metal' };
		this.play( map[ surface ] || 'step_grass', { vol: vol * ( surface === 'concrete' ? 0.35 : 0.8 ), detune: 0.15 } );
	}

	// looping sound with a live gain / rate / position: returns a handle { set( vol, rate, pos ), stop() }
	loop( name, opts = {} ) {
		const buf = this.buffer( name );
		if ( ! buf ) return null;
		const c = this.ctx;
		const src = c.createBufferSource();
		src.buffer = buf; src.loop = true;
		src.playbackRate.value = opts.rate || 1;
		const g = c.createGain(); g.gain.value = 0;
		let node = src, pan = null;
		if ( opts.lowpass ) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass; node.connect( f ); node = f; }
		if ( opts.pos ) {
			pan = c.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = opts.ref || 4; pan.maxDistance = 400;
			node.connect( pan ); node = pan;
		}
		node.connect( g ).connect( this.bus[ opts.bus || 'ambient' ] );
		src.start( c.currentTime, Math.random() * buf.duration );
		const h = {
			src, g, pan,
			set( vol, rate, pos ) {
				const t = c.currentTime;
				g.gain.setTargetAtTime( vol, t, 0.25 );
				if ( rate ) src.playbackRate.setTargetAtTime( rate, t, 0.1 );
				if ( pos && pan ) { pan.positionX.setTargetAtTime( pos.x, t, 0.05 ); pan.positionY.setTargetAtTime( pos.y, t, 0.05 ); pan.positionZ.setTargetAtTime( pos.z, t, 0.05 ); }
			},
			stop() { g.gain.setTargetAtTime( 0, c.currentTime, 0.2 ); setTimeout( () => { try { src.stop(); } catch ( e ) { /* stopped */ } }, 1500 ); },
		};
		h.set( opts.vol ?? 1, null, opts.pos );
		return h;
	}

	// ambience: surf, wind, birds, insects, rain, underwater
	updateAmbience( dt, game ) {
		if ( ! this.ctx || this.ctx.state !== 'running' ) return;
		const want = [ 'surf_far', 'surf_wash', 'wind', 'palms', 'birds_dawn', 'bird_forest', 'crickets', 'rain', 'under_reef', 'wind_loop' ];
		for ( const n of want ) if ( ! this.loops.has( n ) ) { const h = this.loop( n, { vol: 0 } ); if ( h ) this.loops.set( n, h ); }
		const p = game.camera.position;
		const hf = game.hf;
		// distance to the sea from a ring of samples
		let shore = 999;
		for ( let r of [ 15, 40, 90, 180 ] ) {
			for ( let k = 0; k < 8; k ++ ) { const a = k / 8 * Math.PI * 2; if ( hf.baseHeight( p.x + Math.cos( a ) * r, p.z + Math.sin( a ) * r ) < 0 ) { shore = Math.min( shore, r ); } }
			if ( shore < 999 ) break;
		}
		const under = game.player?.underwater;
		const sky = game.world.sky;
		const day = THREE.MathUtils.smoothstep( sky.sunDir.y, - 0.1, 0.15 );
		const dawn = Math.exp( - Math.pow( ( sky.hour - 6.5 ) / 1.2, 2 ) ) + Math.exp( - Math.pow( ( sky.hour - 18 ) / 1.2, 2 ) ) * 0.6;
		const indoor = game.world.isIndoors?.( game.player?.pos || p ) ? 0.35 : 1;
		const alt = Math.max( 0, p.y );
		const s = hf.surfaceAt( p.x, p.z );
		const rain = game.weather?.rain || 0, wind = game.weather?.wind || 0.3;
		const set = ( n, v, r ) => this.loops.get( n )?.set( v, r );
		const u = under ? 0.15 : 1;
		set( 'surf_far', ( shore < 999 ? 0.9 * Math.exp( - shore / 120 ) : 0.05 ) * u * indoor );
		set( 'surf_wash', ( shore < 999 ? 0.8 * Math.exp( - shore / 30 ) : 0 ) * u * indoor );
		set( 'wind', ( 0.12 + Math.min( 0.7, alt / 500 ) + wind * 0.3 ) * u * indoor );
		set( 'wind_loop', ( alt > 300 ? 0.3 : 0 ) * u * indoor );
		set( 'palms', ( shore < 200 ? 0.35 : 0.1 ) * ( 0.5 + wind ) * u * indoor * ( 1 - rain * 0.5 ) );
		set( 'birds_dawn', dawn * 0.6 * u * indoor * ( 1 - rain ) );
		set( 'bird_forest', day * s[ 0 ] * 0.7 * u * indoor * ( 1 - rain ) * ( alt < 400 ? 1 : 0.2 ) );
		set( 'crickets', ( 1 - day ) * 0.5 * u * indoor * ( 1 - rain ) );
		set( 'rain', rain * ( indoor < 1 ? 0.5 : 0.9 ) * u );
		set( 'under_reef', under ? 0.8 : 0 );
	}
}
