// HUD and status icons for the pharmacy's conditions (Survival.conditions() ids), added to the UI icon set: the HUD
// draws icon( id ) for each condition. Same grid and stroke as ui/icons.js (24 units, outline). Node-safe.
import { PATHS } from '../../../../ui/icons.js';

Object.assign( PATHS, {
	// a jellyfish: the bell and trailing tentacles
	sting: '<path d="M5 11.5a7 7 0 0 1 14 0ZM8 11.5c0 3-1.5 4.5-.8 8M12 11.5c0 3.5 1 5.5 0 9M16 11.5c0 3 1.5 4.5.8 8"/>',
	// a centipede: a curved body with legs
	centipede: '<path d="M5 19.5c2.5-6.5 6.5-11.5 14-14.5"/><path d="M6.6 15.6 3.8 14.8M8.3 12.8 5.8 11.2M10.4 10.3 8.6 8.1M12.9 8.2 11.6 5.6M15.6 6.6 15 3.8M8.6 16.8l1.3 2.6M10.6 14.2l2.3 1.6M13 11.9l2.5 1.2M15.7 10l2.6.8"/>',
	// the sun and a blister
	sunburn: '<circle cx="9" cy="9" r="3.25"/><path d="M9 2.5V4M9 14v1.5M2.5 9H4M14 9h1.5M4.4 4.4l1 1M12.6 12.6l1 1M4.4 13.6l1-1M12.6 5.4l1-1"/><path d="M17 12.5c1.6 1.9 3 3.6 3 5a3 3 0 0 1-6 0c0-1.4 1.4-3.1 3-5Z"/>',
	burn: PATHS.flame,
	// a thermometer with heat lines (a fever)
	lepto: '<path d="M11 14.3V5a2 2 0 0 0-4 0v9.3a4 4 0 1 0 4 0ZM9 17V9.5"/><path d="M15 6.5c1 1 1 2 0 3s-1 2 0 3M18.5 6.5c1 1 1 2 0 3s-1 2 0 3"/>',
	// a cut with dots of infection
	cut: '<path d="M5 19 19 5"/><circle cx="8.5" cy="10" r="1.4"/><circle cx="14" cy="15.5" r="1.4"/><circle cx="16.5" cy="9.5" r="1"/><circle cx="7.5" cy="15" r="1"/>',
	// an open cut
	wound: '<path d="M4.5 16.5c3-1 5-3 7.5-6s4.5-4 7.5-5"/><path d="M8 17.5v2M12 14.5V17M16 10.5v2"/>',
	// a strip of bandage across
	dressing: '<path d="M3.6 14.8 14.8 3.6a3 3 0 0 1 4.2 0l1.4 1.4a3 3 0 0 1 0 4.2L9.2 20.4a3 3 0 0 1-4.2 0L3.6 19a3 3 0 0 1 0-4.2Z"/><path d="M9 9l6 6M11 11h.01M13 13h.01M11 13h.01M13 11h.01"/>',
	// a head in profile with puffs of breath
	cough: '<path d="M9 4a6 6 0 0 0-3 11.2V20h6v-2.5h2.5V14l1.5-.8-1.8-3A6 6 0 0 0 9 4Z"/><path d="M18 11.5h3M18.5 8l2.2-1.2M18.5 15l2.2 1.2"/>',
	sprain: PATHS.hands,
	// an eye with a tear
	eye: '<path d="M2.5 11S6 5.5 12 5.5 21.5 11 21.5 11 18 16.5 12 16.5 2.5 11 2.5 11Z"/><circle cx="12" cy="11" r="2.5"/><path d="M16 18c.8 1 1.2 1.7 1.2 2.3a1.2 1.2 0 0 1-2.4 0c0-.6.4-1.3 1.2-2.3Z"/>',
	// a shield with a sun
	sunscreen: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z"/><circle cx="12" cy="11.5" r="2.5"/>',
	// a steady crosshair
	steady: '<circle cx="12" cy="12" r="6.5"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
	// a moon with a z
	drowsy: '<path d="M18.5 15.5A7.5 7.5 0 0 1 9 5.5a7.5 7.5 0 1 0 9.5 10Z"/><path d="M15 3.5h3.5l-3.5 4h3.5"/>',
} );
