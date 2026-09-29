// Builds (once per type) and caches the vehicle geometries:
//   near     body + interior (one draw call), glass (layer 1), wheel, steering wheel, moving parts
//   far      body + dark glass + light wheels merged (one draw call for distant vehicles)
import { CARS } from './cars.js';
import { CRAFT } from './craft.js';

const cache = new Map();

export function modelNames() { return [ ...Object.keys( CARS ), ...Object.keys( CRAFT ) ]; }

export function getModel( name ) {
	let m = cache.get( name );
	if ( m ) return m;
	const def = CARS[ name ] ? CARS[ name ]() : CRAFT[ name ] ? CRAFT[ name ]() : null;
	if ( ! def ) throw new Error( 'unknown vehicle model ' + name );
	m = def.build( def );
	m.name = name;
	cache.set( name, m );
	return m;
}
