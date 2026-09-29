// Canvas versions of the icon set (icons.js) for the map: Path2D built once per icon from the same SVG markup,
// so map glyphs match the DOM icons exactly.
import { PATHS } from './icons.js';

const CACHE = new Map();

export function glyph( name ) {
	let gl = CACHE.get( name );
	if ( gl ) return gl;
	gl = { stroke: new Path2D(), fill: new Path2D() };
	const re = /<(path|circle|rect)\s([^>]*?)\/>/g;
	let m;
	while ( ( m = re.exec( PATHS[ name ] || '' ) ) ) {
		const a = {};
		m[ 2 ].replace( /([\w-]+)="([^"]*)"/g, ( _, k, v ) => { a[ k ] = v; } );
		const p = new Path2D();
		if ( m[ 1 ] === 'path' ) p.addPath( new Path2D( a.d ) );
		else if ( m[ 1 ] === 'circle' ) p.arc( + a.cx, + a.cy, + a.r, 0, Math.PI * 2 );
		else p.roundRect( + a.x, + a.y, + a.width, + a.height, + ( a.rx || 0 ) );
		( a.fill === 'currentColor' ? gl.fill : gl.stroke ).addPath( p );
	}
	CACHE.set( name, gl );
	return gl;
}

// Draws an icon centred on x, y at `size` canvas px. lw is the stroke in canvas px; halo draws a dark outline
// that many px wider under it (busy map backgrounds); fill fills the outline shape (the solid marker diamond);
// edge outlines the solid parts (the player arrow) edgeW px wide outside the fill; rot turns it (radians, clockwise).
export function drawGlyph( ctx, name, x, y, size, { color = '#fff', fill = null, lw = 1.5, halo = 0, edge = null, edgeW = 1.5, rot = 0 } = {} ) {
	const gl = glyph( name ), k = size / 24;
	ctx.save();
	ctx.translate( x, y );
	if ( rot ) ctx.rotate( rot );
	ctx.scale( k, k );
	ctx.translate( - 12, - 12 );
	ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	if ( halo ) { ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = ( lw + halo * 2 ) / k; ctx.stroke( gl.stroke ); }
	if ( fill ) { ctx.fillStyle = fill; ctx.fill( gl.stroke ); }
	if ( lw ) { ctx.strokeStyle = color; ctx.lineWidth = lw / k; ctx.stroke( gl.stroke ); }
	if ( edge ) { ctx.strokeStyle = edge; ctx.lineWidth = edgeW * 2 / k; ctx.stroke( gl.fill ); } // the fill covers the inner half
	ctx.fillStyle = color; ctx.fill( gl.fill );
	ctx.restore();
}
