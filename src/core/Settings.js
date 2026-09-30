// Player options, persisted in localStorage. `get` / `set` with change listeners.
const KEY = 'deadtide.settings.v1';

export const DEFAULT_BINDINGS = {
	forward: [ 'KeyW' ], back: [ 'KeyS' ], left: [ 'KeyA' ], right: [ 'KeyD' ],
	sprint: [ 'ShiftLeft' ], crouch: [ 'KeyC' ], prone: [ 'KeyZ' ], jump: [ 'Space' ], walk: [ 'AltLeft' ],
	interact: [ 'KeyF' ], reload: [ 'KeyR' ], inventory: [ 'Tab', 'KeyI' ], map: [ 'KeyM' ],
	fire: [ 'Mouse0' ], aim: [ 'Mouse2' ], melee: [ 'KeyV' ], fireMode: [ 'KeyB' ], holster: [ 'KeyX' ],
	leanLeft: [ 'KeyQ' ], leanRight: [ 'KeyE' ], flashlight: [ 'KeyL' ], throw: [ 'KeyG' ],
	chat: [ 'KeyT' ], command: [ 'Slash' ], pause: [ 'Escape' ], hideHud: [ 'F1' ], screenshot: [ 'F2' ],
	debug: [ 'F3' ], camera: [ 'F5' ], freelook: [ 'KeyH' ], autorun: [ 'Equal' ], zoom: [ 'KeyN' ],
	slot1: [ 'Digit1' ], slot2: [ 'Digit2' ], slot3: [ 'Digit3' ], slot4: [ 'Digit4' ], slot5: [ 'Digit5' ],
	slot6: [ 'Digit6' ], slot7: [ 'Digit7' ], slot8: [ 'Digit8' ], slot9: [ 'Digit9' ], quickHeal: [ 'KeyK' ],
	horn: [ 'KeyH' ], headlights: [ 'KeyL' ], handbrake: [ 'Space' ], vehicleUp: [ 'Space' ], vehicleDown: [ 'ControlLeft' ],
	gestures: [ 'KeyJ' ], craft: [ 'KeyO' ], log: [ 'KeyP' ],
};

export const BINDING_LABELS = {
	forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint', crouch: 'Crouch',
	prone: 'Prone', jump: 'Jump / vault', walk: 'Walk (hold)', interact: 'Interact / pick up', reload: 'Reload', inventory: 'Inventory',
	map: 'Map', fire: 'Fire / attack', aim: 'Aim down sights', melee: 'Quick melee / shove', fireMode: 'Fire mode', holster: 'Holster',
	leanLeft: 'Lean left', leanRight: 'Lean right', flashlight: 'Flashlight', throw: 'Throw', chat: 'Chat', command: 'Command',
	pause: 'Pause', hideHud: 'Hide HUD', screenshot: 'Screenshot', debug: 'Debug overlay', camera: 'Vehicle camera', freelook: 'Free look (hold)',
	autorun: 'Auto-run', zoom: 'Hold breath / zoom', slot1: 'Hotbar 1', slot2: 'Hotbar 2', slot3: 'Hotbar 3', slot4: 'Hotbar 4',
	slot5: 'Hotbar 5', slot6: 'Hotbar 6', slot7: 'Hotbar 7', slot8: 'Hotbar 8', slot9: 'Hotbar 9', quickHeal: 'Quick bandage',
	horn: 'Horn', headlights: 'Headlights', handbrake: 'Handbrake', vehicleUp: 'Climb (air / boat)', vehicleDown: 'Descend (air)',
	gestures: 'Gestures', craft: 'Crafting', log: 'Survival journal',
};

export const DEFAULTS = {
	// display
	// (vertical degrees; Tidewater's 62: less wide-angle distortion than the old 80)
	fov: 62, guiScale: 1, renderDistance: 1400, renderScale: 1, showFps: true, crosshair: 'dot', headBob: 1,
	// graphics. exposure: EV bias on the auto exposure (-2..2); ao: ambient occlusion (GTAO); shafts: sun
	// shafts and god rays; antialias: off / fxaa / msaa / taa (temporal, also resolves shadow and AO noise)
	quality: 'high', shadows: 'high', terrainDetail: 'high', vegetation: 'high', clouds: 'high', antialias: 'taa',
	bloom: true, water: 'high', grass: true, nightBrightness: 1, exposure: 0, ao: true, shafts: true, lensFlare: true,
	motionBlur: false,
	// audio
	masterVolume: 0.8, sfxVolume: 1, ambientVolume: 0.8, musicVolume: 0.5, uiVolume: 0.7,
	// controls
	sensitivity: 1, invertY: false, toggleCrouch: true, toggleAim: false, toggleSprint: false, bindings: DEFAULT_BINDINGS,
	// gameplay
	subtitles: true, autoPickupAmmo: true, realisticMap: false, damageIndicators: true, hitMarkers: true,
	showInteractHints: true, compass: true, minimap: true, units: 'metric', tutorial: true,
};

// low: integrated GPUs; medium: integrated / entry-level; high: mid-range at 1080p; ultra: high-end.
// Most of a frame is per-pixel work, so low and medium render at a lower scale and the TAA resolve upsamples
// it to the display (render/Renderer.js): far better looking than a stretched canvas at the same cost. Low
// keeps one near shadow cascade (PCF) instead of none, drops the heavy passes (GTAO, the shaft march, the
// clouds); medium keeps the half-resolution AO and two cascades (PCF).
export const QUALITY_PRESETS = {
	low: { shadows: 'low', terrainDetail: 'low', vegetation: 'low', clouds: 'off', antialias: 'taa', bloom: false, water: 'low', grass: false, renderScale: 0.67, renderDistance: 800, ao: false, shafts: false, lensFlare: false },
	medium: { shadows: 'medium', terrainDetail: 'medium', vegetation: 'medium', clouds: 'low', antialias: 'taa', bloom: true, water: 'medium', grass: true, renderScale: 0.75, renderDistance: 1100, ao: true, shafts: false, lensFlare: true },
	high: { shadows: 'high', terrainDetail: 'high', vegetation: 'high', clouds: 'high', antialias: 'taa', bloom: true, water: 'high', grass: true, renderScale: 1, renderDistance: 1400, ao: true, shafts: true, lensFlare: true },
	ultra: { shadows: 'ultra', terrainDetail: 'ultra', vegetation: 'ultra', clouds: 'high', antialias: 'taa', bloom: true, water: 'high', grass: true, renderScale: 1, renderDistance: 2200, ao: true, shafts: true, lensFlare: true },
};
// the v2 presets: v3 moves keys a player never changed from them to the new values
const PRESETS_V2 = {
	low: { shadows: 'off', antialias: 'fxaa', renderScale: 0.75 },
	medium: { antialias: 'fxaa', renderScale: 1 },
};

// settings saved before the rendering port: the old default FOV (80) becomes 62, the high / ultra presets'
// MSAA becomes TAA, and keys new to a saved preset take that preset's value (so it isn't shown as custom).
// v3: the retuned low / medium presets (TAA upsampling, a near shadow cascade on low) replace the v2 values
// the player kept
const VERSION = 3;
function migrate( s ) {
	const v = s.version ?? 1;
	if ( v >= VERSION ) return;
	if ( v < 2 && s.fov === 80 ) s.fov = 62;
	const p = QUALITY_PRESETS[ s.quality ];
	if ( p ) {
		if ( v < 2 && p.antialias === 'taa' && s.antialias === 'msaa' ) s.antialias = 'taa';
		const old = PRESETS_V2[ s.quality ];
		if ( old ) for ( const k in old ) if ( s[ k ] === old[ k ] ) s[ k ] = p[ k ];
		for ( const k in p ) if ( ! ( k in s ) ) s[ k ] = p[ k ];
	}
	s.version = VERSION;
}

export class Settings {
	constructor() {
		this.values = structuredClone( DEFAULTS );
		this.values.version = VERSION;
		this.listeners = new Map();
		try {
			const s = JSON.parse( localStorage.getItem( KEY ) || 'null' );
			if ( s ) {
				migrate( s );
				Object.assign( this.values, s );
				this.values.bindings = { ...structuredClone( DEFAULT_BINDINGS ), ...( s.bindings || {} ) };
			}
		} catch ( e ) { /* private mode */ }
	}
	get( k ) { return this.values[ k ]; }
	set( k, v, save = true ) {
		if ( this.values[ k ] === v ) return;
		this.values[ k ] = v;
		for ( const fn of this.listeners.get( k ) || [] ) fn( v );
		for ( const fn of this.listeners.get( '*' ) || [] ) fn( k, v );
		if ( save ) this.save();
	}
	applyPreset( name ) {
		const p = QUALITY_PRESETS[ name ];
		if ( ! p ) return;
		this.set( 'quality', name, false );
		for ( const k in p ) this.set( k, p[ k ], false );
		this.save();
	}
	on( k, fn ) {
		if ( ! this.listeners.has( k ) ) this.listeners.set( k, [] );
		this.listeners.get( k ).push( fn );
		return () => { const a = this.listeners.get( k ); a.splice( a.indexOf( fn ), 1 ); };
	}
	resetBindings() { this.set( 'bindings', structuredClone( DEFAULT_BINDINGS ) ); }
	resetAll() {
		const b = this.values.bindings;
		this.values = structuredClone( DEFAULTS );
		this.values.version = VERSION;
		this.values.bindings = b;
		for ( const k in this.values ) for ( const fn of this.listeners.get( k ) || [] ) fn( this.values[ k ] );
		this.save();
	}
	save() { try { localStorage.setItem( KEY, JSON.stringify( this.values ) ); } catch ( e ) { /* ignore */ } }
}
