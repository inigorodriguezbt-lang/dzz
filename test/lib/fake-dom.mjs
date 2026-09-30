// Just enough DOM for modules that paint canvases or start image loads, so their logic can run in Node:
// every 2D-context call is a no-op, pixel reads return zeros, images never load.
function ctx2d( canvas ) {
	const state = {};
	const px = ( w, h ) => ( { width: w, height: h, data: new Uint8ClampedArray( Math.max( 1, w * h * 4 ) ) } );
	const special = {
		canvas,
		measureText: ( t ) => ( { width: String( t ).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 } ),
		getImageData: ( x, y, w, h ) => px( w, h ),
		createImageData: ( w, h ) => px( typeof w === 'object' ? w.width : w, typeof w === 'object' ? w.height : h ),
		createLinearGradient: () => ( { addColorStop() {} } ),
		createRadialGradient: () => ( { addColorStop() {} } ),
		createPattern: () => ( {} ),
		getTransform: () => ( { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } ),
	};
	return new Proxy( state, {
		get( t, k ) { if ( k in special ) return special[ k ]; if ( k in t ) return t[ k ]; return () => {}; },
		set( t, k, v ) { t[ k ] = v; return true; },
	} );
}

function element( tag ) {
	const el = {
		tagName: String( tag ).toUpperCase(), style: {}, width: 300, height: 150, children: [],
		addEventListener() {}, removeEventListener() {}, setAttribute() {}, appendChild( c ) { this.children.push( c ); return c; },
		getContext( kind ) { return kind === '2d' ? ( this._ctx ||= ctx2d( this ) ) : null; },
		toDataURL: () => 'data:,',
	};
	return el;
}

export function installFakeDom() {
	if ( globalThis.document ) return;
	globalThis.document = {
		createElement: element,
		createElementNS: ( ns, tag ) => element( tag ),
		body: element( 'body' ),
		addEventListener() {}, removeEventListener() {},
	};
	globalThis.window ||= globalThis;
	globalThis.self ||= globalThis;
	globalThis.Image ||= function () { return element( 'img' ); };
}
