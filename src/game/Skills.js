// The character's skills (game.skills): experience per skill, levels 0..10, and the one-off "knowledge" flags
// the old guides teach. Skills belong to the character: saved with the survival state, forgotten on death
// (and Survival.reset, for a new character, calls reset() too).
//   xp( skill, n )       adds experience; returns the level. A level-up toasts 'Fishing 3'
//   level( skill )       0..10;  progress( skill ) 0..1 towards the next level;  total( skill ) xp so far
//   knows( key ) / learn( key )   the guides' flags (fishing, foraging, survival, first_aid, …)
//   readProgress( id ) / setRead( id, f )   how much of a book this character has read (0..1)
//   craftXp( recipe )     xp for a finished recipe, by what it is (cooking at a fire, first aid, tailoring…)
//   mul( skill, perLevel )  1 + level * perLevel: the small bonuses other systems read
//   list()               [ { id, name, level, xp, progress } ] for UIs
// Node-safe (no DOM, no three).

export const SKILLS = [ 'fishing', 'survival', 'foraging', 'first_aid', 'cooking', 'mechanics', 'carpentry', 'tailoring',
	'electrical', 'aiming', 'reloading', 'maintenance', 'stealth' ];
export const SKILL_NAMES = {
	fishing: 'Fishing', survival: 'Survival', foraging: 'Foraging', first_aid: 'First aid', cooking: 'Cooking', mechanics: 'Mechanics',
	carpentry: 'Carpentry', tailoring: 'Tailoring', electrical: 'Electrical', aiming: 'Aiming', reloading: 'Reloading',
	maintenance: 'Maintenance', stealth: 'Stealth',
};
export const MAX_LEVEL = 10;

// cumulative xp to reach a level: 75 · n^1.6 (75, 227, 435, 696, 1003 … 2986). An hour of steady fishing or
// cooking is roughly level 2; a few hours of mixed play gets the skills you use to 2-3.
const XP = [];
for ( let n = 0; n <= MAX_LEVEL; n ++ ) XP.push( n <= 0 ? 0 : Math.round( 75 * Math.pow( n, 1.6 ) ) );
export const xpFor = ( n ) => XP[ Math.max( 0, Math.min( MAX_LEVEL, Math.floor( n ) ) ) ];
export function levelFor( xp ) {
	let l = 0;
	while ( l < MAX_LEVEL && xp >= XP[ l + 1 ] ) l ++;
	return l;
}

const SKILL_SET = new Set( SKILLS );
const LIVING = new Set( [ 'zombie', 'animal', 'npc' ] );
// recipe inputs that say what kind of work a recipe is, matched as whole words of an id (so 'sheet_metal' isn't
// cloth and 'storage_box' isn't a rag)
const word = ( list ) => new RegExp( `(^|_|\\s)(${list})(?=_|\\s|$)` );
const TAILOR = word( 'rags?|fabric|cloth|leather|thread|denim|bedsheet|tarp|t?shirt|pants|jeans|canvas|kapa' );
const WOOD = word( 'planks?|nails?|wood|logs?|boards?|lumber' );
// (rags on a stick are a torch or tinder, not sewing)
const ROUGH = word( 'sticks?|long_stick|planks?|nails?|wood|logs?|boards?|lumber|empty_bottle' );
const ELEC = word( 'electronics?|circuit|circuit_board|battery|batteries|bulb|radio|copper|solder|speaker|motor|transistor|led' );

export class Skills {
	constructor( game ) {
		this.game = game;
		this.reset();
		this._warned = new Set();
		// aiming: hits and kills with a firearm
		const ev = game?.events;
		if ( ev?.on ) {
			// (a shotgun's pellets are one hit)
			ev.on( 'damage', ( e ) => {
				if ( ! this._mine( e ) || ( e.kind !== 'bullet' && e.kind !== 'arrow' ) || ! LIVING.has( e.target?.type ) ) return;
				const now = Date.now();
				if ( now - ( this._hitT || 0 ) > 120 ) { this._hitT = now; this.xp( 'aiming', 1 ); }
			} );
			ev.on( 'kill', ( e ) => { if ( this._mine( e ) && e.weapon?.cat === 'firearm' && LIVING.has( e.target?.type ) ) this.xp( 'aiming', 4 ); } );
			// what you learned dies with you
			ev.on( 'playerDeath', () => this.reset() );
			ev.on( 'start', () => addCommands( game ) );
		}
	}

	_mine( e ) { return e && ( e.source === this.game.player || e.source === 'player' ); }

	reset() {
		this.xps = {};     // skill -> xp
		this.lv = {};      // skill -> level (cached: aim sway and footsteps read it every frame)
		this.known = {};   // knowledge flags from guides
		this.pages = {};   // book id -> fraction read
	}

	_ok( skill ) {
		if ( SKILL_SET.has( skill ) ) return true;
		if ( ! this._warned.has( skill ) ) { this._warned.add( skill ); console.warn( 'unknown skill', skill ); }
		return false;
	}

	total( skill ) { return this.xps[ skill ] || 0; }
	level( skill ) { return this.lv[ skill ] || 0; }
	progress( skill ) {
		const l = this.level( skill );
		if ( l >= MAX_LEVEL ) return 1;
		const a = xpFor( l ), b = xpFor( l + 1 );
		return ( this.total( skill ) - a ) / ( b - a );
	}
	mul( skill, perLevel ) { return 1 + this.level( skill ) * perLevel; }

	_set( skill, xp ) {
		this.xps[ skill ] = xp;
		this.lv[ skill ] = levelFor( xp );
	}

	xp( skill, n ) {
		if ( ! this._ok( skill ) || ! ( n > 0 ) ) return this.level( skill );
		const before = this.level( skill );
		this._set( skill, Math.min( xpFor( MAX_LEVEL ), this.total( skill ) + n ) );
		const after = this.level( skill );
		if ( after > before ) this._levelUp( skill, after );
		return after;
	}

	// debug and commands: jump straight to a level
	setLevel( skill, l ) {
		if ( ! this._ok( skill ) ) return;
		this._set( skill, xpFor( Math.max( 0, Math.min( MAX_LEVEL, Math.round( l ) || 0 ) ) ) );
	}

	_levelUp( skill, l ) {
		const g = this.game;
		g?.toast?.( `${SKILL_NAMES[ skill ]} ${l}`, 'good' );
		g?.audio?.play?.( 'ui_open', { bus: 'ui', vol: 0.3 } );
		g?.events?.emit?.( 'skill', { skill, level: l } );
	}

	knows( key ) { return !! this.known[ key ]; }
	learn( key ) { this.known[ key ] = true; }

	readProgress( id ) { return this.pages[ id ] || 0; }
	setRead( id, f ) { if ( f > 0 ) this.pages[ id ] = Math.min( 1, f ); else delete this.pages[ id ]; }

	// which skill a recipe trains: an explicit `skill`, a `cat` named after a skill, or what it is made of.
	// ('survival' is recipes.js R()'s default cat, so it doesn't count as a choice: those are inferred too)
	craftSkill( r ) {
		if ( r.skill && SKILL_SET.has( r.skill ) ) return r.skill;
		if ( r.cat !== 'survival' && SKILL_SET.has( r.cat ) ) return r.cat;
		const ids = ( r.in || [] ).map( i => i[ 0 ] ).join( ' ' ), tools = r.tools || [];
		const out = Array.isArray( r.out ) ? r.out[ 0 ] : r.out;
		// tearing cloth into rags is tailoring, whatever list it sits in
		if ( out === 'rags' ) return 'tailoring';
		if ( r.cat === 'food' || ( r.station === 'fire' && r.cat !== 'medical' ) ) return 'cooking';
		if ( r.cat === 'medical' ) return 'first_aid';
		if ( tools.includes( 'sewing' ) || r.cat === 'clothing' || ( TAILOR.test( ids ) && ! ROUGH.test( ids ) && r.cat !== 'weapons' ) ) return 'tailoring';
		if ( ELEC.test( ids ) || tools.includes( 'solder' ) ) return 'electrical';
		if ( tools.includes( 'toolbox' ) || tools.includes( 'wrench' ) || r.cat === 'vehicle' ) return 'mechanics';
		if ( tools.includes( 'hammer' ) || WOOD.test( ids ) ) return 'carpentry';
		return 'survival';
	}

	// a finished recipe: its own `xp`, else longer work teaches more
	craftXp( r ) {
		if ( ! r || r.special ) return 0;
		const n = r.xp > 0 ? r.xp : Math.max( 3, Math.min( 15, ( r.time || 6 ) / 2 ) );
		this.xp( this.craftSkill( r ), n );
		return n;
	}

	list() {
		return SKILLS.map( id => ( { id, name: SKILL_NAMES[ id ], level: this.level( id ), xp: Math.floor( this.total( id ) ), progress: this.progress( id ) } ) );
	}

	update( dt ) {
		// stealth: moving quietly (crouched, prone or walking) near the infected that haven't noticed you
		const g = this.game, p = g.player;
		this._stT = ( this._stT || 0 ) + dt;
		if ( this._stT < 1 ) return;
		const k = this._stT; this._stT = 0;
		if ( ! p || ! p.moving || p.sprinting || p.vehicle || g.mode === 'creative' ) return;
		if ( p.stance === 'stand' && ! p.walking ) return;
		const near = g.entities?.near?.( p.pos, 18, 'zombie', this._near || ( this._near = [] ) ) || [];
		let unaware = 0;
		for ( const z of near ) if ( z.alive && z.target !== p ) unaware ++;
		// (about level 3 after twenty minutes spent creeping past them)
		if ( unaware ) this.xp( 'stealth', k * Math.min( 3, unaware ) * 0.12 );
	}

	serialize() {
		const xps = {};
		for ( const k in this.xps ) xps[ k ] = Math.round( this.xps[ k ] * 100 ) / 100;
		return { xp: xps, known: { ...this.known }, pages: { ...this.pages } };
	}

	load( o ) {
		this.reset();
		if ( ! o ) return;
		for ( const [ k, v ] of Object.entries( o.xp || {} ) ) if ( SKILL_SET.has( k ) && v > 0 ) this._set( k, Math.min( xpFor( MAX_LEVEL ), + v ) );
		Object.assign( this.known, o.known || {} );
		Object.assign( this.pages, o.pages || {} );
	}
}

// chat commands, added to Commands' table once the game starts: /skill to read or set levels, /mood to read or
// set the moods (cheats outside creative, refused in hardcore, like /give)
function addCommands( g ) {
	const C = g.commands;
	if ( ! C?.cmds || C.cmds.skill ) return;
	const say = ( t, kind = 'ok' ) => g.events.emit( 'chat', { text: t, kind } );
	const cheat = () => {
		if ( g.save?.hardcore ) { say( 'No cheats in hardcore', 'err' ); return false; }
		if ( g.mode !== 'creative' && g.stats ) g.stats.cheated = true;
		return true;
	};
	C.cmds.skill = {
		usage: '/skill [skill] [level]', desc: 'Skill levels', args: [ () => SKILLS, () => [ '0', '1', '3', '5', '10' ] ],
		run: ( a ) => {
			const S = g.skills;
			if ( ! a[ 0 ] ) return say( S.list().map( s => `${s.name} ${s.level}` ).join( ', ' ), 'sys' );
			const id = a[ 0 ].toLowerCase();
			if ( ! SKILL_SET.has( id ) ) return say( `Unknown skill: ${a[ 0 ]}`, 'err' );
			if ( a[ 1 ] == null ) return say( `${SKILL_NAMES[ id ]} ${S.level( id )} (${Math.floor( S.total( id ) )} xp)`, 'sys' );
			if ( ! cheat() ) return;
			S.setLevel( id, parseInt( a[ 1 ], 10 ) || 0 );
			say( `${SKILL_NAMES[ id ]} ${S.level( id )}` );
		},
	};
	const MOODS = [ 'boredom', 'stress', 'unhappy', 'panic' ];
	C.cmds.mood = {
		usage: '/mood [boredom|stress|unhappy|panic] [0-100]', desc: 'Moods', args: [ () => MOODS, () => [ '0', '30', '60', '90' ] ],
		run: ( a ) => {
			const S = g.survival;
			if ( ! a[ 0 ] ) return say( MOODS.map( k => `${k} ${Math.round( S[ k ] )}` ).join( ', ' ), 'sys' );
			const k = a[ 0 ].toLowerCase();
			if ( ! MOODS.includes( k ) ) return say( C.cmds.mood.usage, 'err' );
			if ( ! cheat() ) return;
			S[ k ] = Math.max( 0, Math.min( 100, parseFloat( a[ 1 ] ) || 0 ) );
			say( `${k} ${Math.round( S[ k ] )}` );
		},
	};
}
