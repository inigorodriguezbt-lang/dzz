// Ported from Tidewater src/ocean/Breakers.js (MIT, see LICENSE-Tidewater.txt): the thrown lip of the
// plunging breakers (the spray system is not ported).
// Stations lie every 0.6 m along the shoreline near the camera (breakerStations.js, per tile, in the water's
// worker). Each frame a pass marches every station's transect through the surf zone and finds the crests of
// the breaking waves as crossings of the wave phase s = ( t - T ) / period + wobble with integers (the same
// analytic field that drives the water surface, so the crest found here is exactly the crest of the rendered
// surface). For every crest it stores the lip root, the breaking progress and the wave height (a fragment
// pass with three float attachments instead of the compute kernel; one row per wave parity slot).
// The thrown lip is a separate ribbon mesh extruded along the crest (Thuerey et al. 2007): a ballistic curtain
// leaving the crest horizontally and falling in front of the concave face, shaded like the water (Fresnel sky
// reflection, light through the thin sheet, aerated streaks that grow toward the tip) and blended over the
// water with premultiplied alpha. Its root lies on the crest of the water surface and fades in there.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, COMMON_GLSL } from '../../render/Materials.js';
import { LACE_TILE } from './SurfFoam.js';

export const MAX_STATIONS = 4096;
const NV = 20; // profile vertices across the lip (2 on the back of the crest + 18 along the curtain)
const STEP = 2.0, K = 64; // transects: 128 m seaward from the shoreline
const f = ( x ) => { const s = String( x ); return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0'; };

// exact unpolarized dielectric Fresnel (the same as the water's fresnelDielectric), cosI > 0, eta = n2 / n1
const FRESNEL = /* glsl */`
	float breakersFresnel( float cosI, float eta ) {
		float c = clamp( cosI, 0.0, 1.0 );
		float g2 = eta * eta - 1.0 + c * c;
		float g = sqrt( max( g2, 0.0 ) );
		float a = ( g - c ) / ( g + c );
		float b = ( c * ( g + c ) - 1.0 ) / ( c * ( g - c ) + 1.0 );
		return g2 < 0.0 ? 1.0 : 0.5 * a * a * ( b * b + 1.0 );
	}
`;

export class Breakers {
	// shoreGLSL: ground + perlin + shore modules (with uniform declarations); U: their uniforms (shared)
	constructor( renderer, shoreGLSL, U, sizes ) {
		this.renderer = renderer;
		this.U = U;
		this.sizes = sizes;
		this.NS = 0;
		this.spacing = 0.6;
		this.stationTex = new THREE.DataTexture( new Float32Array( MAX_STATIONS * 4 ), MAX_STATIONS, 1, THREE.RGBAFormat, THREE.FloatType );
		this.stationTex.minFilter = this.stationTex.magFilter = THREE.NearestFilter;
		this.stationTex.needsUpdate = true;
		// per station and slot (wave parity): ( root.xyz, b ) ( back.xyz, H ) ( dir.xz, trough y, wave id 1..1024 or 0 = none )
		this.crest = new THREE.WebGLRenderTarget( MAX_STATIONS, 2, { count: 3, type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false } );
		this.quad = new FullScreenQuad( null );
		this.enabled = true;
		this._buildKernel( shoreGLSL );
		this._buildMesh();
	}

	setStations( S ) {
		if ( ! S || S.count < 2 ) { this.NS = 0; this.mesh.visible = false; return; }
		this.NS = S.count;
		this.spacing = S.spacing;
		this.stationTex.image.data.fill( 0 );
		this.stationTex.image.data.set( S.data );
		this.stationTex.needsUpdate = true;
		this.kernel.uniforms.uNS.value = this.NS;
		this.mesh.geometry.setDrawRange( 0, ( this.NS - 1 ) * 2 * ( NV - 1 ) * 6 );
		this.mesh.visible = true;
	}

	_buildKernel( shoreGLSL ) {
		// FFT displacement at a Lagrangian point (the short cascades that survive in the surf zone), with the
		// cascade attenuation inlined (the long cascades vanish in shallow water)
		let fftCode = '';
		for ( let c = 1; c < this.sizes.length; c ++ ) {
			const L = this.sizes[ c ];
			const texel = L / 256;
			const level = Math.max( Math.log2( 0.35 / texel ) + 0.7, 0 );
			const d0 = Math.min( 40, L * 0.08 );
			const floorAmt = [ 0.0, 0.05, 0.25, 0.5 ][ c ] ?? 0.5;
			fftCode += `\t\td += textureLod( uOceanDisp, vec3( p / ${ f( L ) }, ${ f( c ) } ), ${ f( level ) } ).xyz * mix( ${ f( floorAmt ) } * smoothstep( 0.0, 0.6, depth ), 1.0, smoothstep( 0.0, ${ f( d0 ) }, depth ) );\n`;
		}
		this.kernel = new THREE.ShaderMaterial( {
			glslVersion: THREE.GLSL3,
			uniforms: Object.assign( { uStations: { value: this.stationTex }, uNS: { value: 0 }, uOceanDisp: { value: null } }, this.U ),
			vertexShader: /* glsl */`void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
			fragmentShader: /* glsl */`
				uniform sampler2D uStations; uniform float uNS; uniform highp sampler2DArray uOceanDisp;
				layout( location = 0 ) out vec4 o0;
				layout( location = 1 ) out vec4 o1;
				layout( location = 2 ) out vec4 o2;
				${ shoreGLSL }
				vec3 breakersFftDisp( vec2 p, float depth ) {
					vec3 d = vec3( 0.0 );
${ fftCode }					return d;
				}
				// one crest of wave m at Lagrangian point pc: the lip frame (false when it is not breaking)
				bool breakersCrest( vec2 pc, float m ) {
					ShorePhase ph = shorePhaseAt( pc );
					vec2 dir = ph.dir;
					float along = ph.along;
					float ground = waterGroundAt( pc );
					float depth = uWaterLevel - ground;
					float A = shoreWaveAmp( m, along );
					vec4 cr = shoreCrest( A, depth ); // ( b, H, trough, lipThrow )
					float b = cr.x;
					float env = smoothstep( 26.0, 13.0, depth ) * sSat( ph.exposure * 1.4 ) * uShoreEnabled;
					// followed from before it breaks until the bore reaches the shore (the lip sheet only uses b < 1.25)
					if ( b > -0.6 && env > 0.3 && depth > 0.12 ) {
						float c = sqrt( clamp( depth, 0.3, 25.0 ) * SHORE_GRAVITY );
						float lam = c * uShorePeriod;
						vec4 s0 = shoreShape( 0.0, A, depth, lam );
						float ub = 0.4 / lam;
						vec4 s1 = shoreShape( ub, A, depth, lam );
						vec3 fd = breakersFftDisp( pc, depth );
						vec3 d3 = vec3( dir.x, 0.0, dir.y );
						vec3 root = vec3( pc.x, uWaterLevel, pc.y ) + d3 * ( s0.x * env ) + vec3( 0.0, s0.y * env, 0.0 ) + fd;
						vec3 back = vec3( pc.x, uWaterLevel, pc.y ) + d3 * ( s1.x * env - 0.4 ) + vec3( 0.0, s1.y * env, 0.0 ) + fd;
						float H = cr.y * env;
						float trough = uWaterLevel + cr.z * env + fd.y;
						// id = wave index mod 1024, + 1 (0 = none)
						float id = m - floor( m / 1024.0 ) * 1024.0 + 1.0;
						o0 = vec4( root, b );
						o1 = vec4( back, H );
						o2 = vec4( dir, trough, id );
						return true;
					}
					return false;
				}
				void main() {
					int i = int( gl_FragCoord.x );
					float slot = floor( gl_FragCoord.y );
					o0 = vec4( 0.0 ); o1 = vec4( 0.0 ); o2 = vec4( 0.0 );
					if ( float( i ) >= uNS || uShoreEnabled <= 0.0 ) return;
					vec4 st = texelFetch( uStations, ivec2( i, 0 ), 0 );
					vec2 o = st.xy;
					vec2 n = st.zw; // toward the sea
					float sPrev = 0.0;
					for ( int k = 0; k < ${ K }; k ++ ) {
						float dist = float( k ) * ${ f( STEP ) };
						float s = shorePhaseAt( o + n * dist ).s;
						// s grows seaward: a crest (integer phase) lies between this sample and the previous one
						if ( k > 0 && floor( s ) > floor( sPrev ) ) {
							float m = floor( s );
							// this slot keeps the waves of its parity (the most seaward breaking one of them)
							if ( m - floor( m * 0.5 ) * 2.0 == slot ) {
								// secant refinement on the exact phase
								float lo = dist - ${ f( STEP ) };
								float hi = dist;
								float sLo = sPrev;
								float sHi = s;
								float x = lo + ( m - sLo ) / max( sHi - sLo, 1e-5 ) * ${ f( STEP ) };
								for ( int it = 0; it < 2; it ++ ) {
									float sx = shorePhaseAt( o + n * x ).s;
									if ( sx < m ) { lo = x; sLo = sx; } else { hi = x; sHi = sx; }
									x = lo + ( m - sLo ) / max( sHi - sLo, 1e-5 ) * ( hi - lo );
								}
								breakersCrest( o + n * x, m );
							}
						}
						sPrev = s;
					}
				}`,
			depthTest: false, depthWrite: false,
		} );
	}

	_buildMesh() {
		const nSeg = MAX_STATIONS - 1;
		const vertsPerStrip = NV * 2;
		const nStrips = nSeg * 2;
		const ids = new Float32Array( nStrips * vertsPerStrip * 4 );
		const pos = new Float32Array( nStrips * vertsPerStrip * 3 );
		const index = new Uint32Array( nStrips * ( NV - 1 ) * 6 );
		let p = 0, q = 0;
		for ( let seg = 0; seg < nSeg; seg ++ ) for ( let slot = 0; slot < 2; slot ++ ) {
			const v0 = ( seg * 2 + slot ) * vertsPerStrip;
			for ( let side = 0; side < 2; side ++ ) for ( let k = 0; k < NV; k ++ ) { ids[ p ++ ] = seg; ids[ p ++ ] = slot; ids[ p ++ ] = side; ids[ p ++ ] = k; }
			for ( let k = 0; k < NV - 1; k ++ ) {
				const a = v0 + k, b = v0 + k + 1, c = v0 + NV + k, d = v0 + NV + k + 1;
				index[ q ++ ] = a; index[ q ++ ] = c; index[ q ++ ] = b;
				index[ q ++ ] = b; index[ q ++ ] = c; index[ q ++ ] = d;
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'sheetId', new THREE.BufferAttribute( ids, 4 ) );
		geo.setIndex( new THREE.BufferAttribute( index, 1 ) );
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		geo.setDrawRange( 0, 0 );
		const mat = new THREE.ShaderMaterial( {
			name: 'BreakerLip',
			uniforms: Object.assign( {
				uCrest0: { value: this.crest.textures[ 0 ] }, uCrest1: { value: this.crest.textures[ 1 ] }, uCrest2: { value: this.crest.textures[ 2 ] },
				uSpacing: { value: 0.6 }, uSheet: { value: 1 },
			}, this.U, G ),
			vertexShader: /* glsl */`
				uniform highp sampler2D uCrest0; uniform highp sampler2D uCrest1; uniform highp sampler2D uCrest2; uniform float uSpacing;
				attribute vec4 sheetId;
				varying vec3 vLipN; varying vec4 vLip; varying float vLipFade; varying vec3 vPos;
				const float BRK_NV = ${ f( NV ) };
				void main() {
					vec4 id = sheetId;
					int seg = int( id.x ); int slot = int( id.y ); int side = int( id.z );
					float k = id.w;
					int st = seg + side;
					int ot = seg + ( 1 - side );
					vec4 c0 = texelFetch( uCrest0, ivec2( st, slot ), 0 );
					vec4 c1 = texelFetch( uCrest1, ivec2( st, slot ), 0 );
					vec4 c2 = texelFetch( uCrest2, ivec2( st, slot ), 0 );
					vec4 o0 = texelFetch( uCrest0, ivec2( ot, slot ), 0 );
					float mOther = texelFetch( uCrest2, ivec2( ot, slot ), 0 ).w;
					float bOther = o0.w;
					// (the crests are followed until the bore reaches the shore; the sheet is gone after the plunge; both
					// ends of a segment must pass the b test, else a vertex pair collapses to one side only. Ours: the
					// two stations must lie on one shoreline, their crests close together)
					bool valid = c2.w > 0.5 && abs( mOther - c2.w ) < 0.5 && c0.w < 1.25 && bOther < 1.25 && distance( c0.xz, o0.xz ) < 3.0;
					vec3 root = c0.xyz;
					float b = c0.w;
					vec3 back = c1.xyz;
					float H = c1.w;
					vec3 d3 = vec3( c2.x, 0.0, c2.y );
					float trough = c2.z;
					float q = clamp( b / 0.9, 0.0, 1.35 );
					float Xi = max( H * 0.8, 0.05 );
					float Yi = max( root.y - trough, 0.05 );
					// profile parameter: k = 0, 1 on the back of the crest (-1, -0.45), then 0..1 along the curtain
					float pv = k < 0.5 ? -1.0 : ( k < 1.5 ? -0.45 : ( k - 2.0 ) / ( BRK_NV - 3.0 ) );
					float xl = Xi * q * max( pv, 0.0 );
					float fl = xl / Xi;
					float yl = - Yi * ( fl * fl ); // ballistic: the jet leaves the crest horizontally
					vec3 onLip = root + d3 * xl + vec3( 0.0, yl, 0.0 );
					vec3 onCap = mix( root, back, max( - pv, 0.0 ) ) + vec3( 0.0, 0.012, 0.0 );
					vec3 P = pv < 0.0 ? onCap : onLip;
					// outward normal of the curtain (upper surface of the lip)
					float slope = Yi * 2.0 * xl / ( Xi * Xi );
					vLipN = normalize( vec3( 0.0, 1.0, 0.0 ) + d3 * slope );
					vLip = vec4( pv, b, float( st ) * uSpacing, Xi * q + Yi * q * q ); // w: curtain length (m)
					// the cap fades in over the crest; the whole lip fades out once it has become whitewater
					float capA = smoothstep( -1.0, -0.1, pv );
					// once the jet has re-entered the water the curtain is gone (the splash and the roller take over)
					vLipFade = capA * smoothstep( 0.02, 0.12, q ) * ( 1.0 - smoothstep( 1.0, 1.2, b ) );
					vec3 wp = valid ? P : vec3( 0.0, -1e5, 0.0 );
					vPos = wp;
					gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
				}`,
			fragmentShader: /* glsl */`
				uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
				uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
				uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
				uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
				uniform highp sampler2DArray uPatterns; uniform float uOceanTime; uniform float uSheet;
				varying vec3 vLipN; varying vec4 vLip; varying float vLipFade; varying vec3 vPos;
				${ COMMON_GLSL }
				${ FRESNEL }
				const float BRK_LACE_TILE = ${ f( LACE_TILE ) };
				vec4 brkLace( vec2 uv ) { return texture( uPatterns, vec3( uv, 1.0 ) ); }
				void main() {
					float v = vLip.x;
					float b = vLip.y;
					float a = vLip.z;
					float len = vLip.w;
					vec3 pos = vPos;
					vec3 V = normalize( cameraPosition - pos );
					vec3 Nw = normalize( vLipN );
					vec3 N0 = gl_FrontFacing ? Nw : - Nw;
					float t = uOceanTime;
					// The water of the jet is stretched along the flow: streaks and ripples running down the curtain (the
					// lace pattern stretched ~8x along the jet and moving with it) in its surface (normal, from the
					// screen-space gradient of a small relief) and in its thickness
					float flowS = v * len - t * 1.1;
					// along-crest coordinate warped by low-frequency noise (slope below 1 so it never folds): the streak
					// spacing drifts along the crest, and the tiles of every pattern below never line up into a comb
					float aw = a + sin( a * 0.23 + 1.7 ) * 1.6 + sin( a * 0.61 + 4.2 ) * 0.4 + sin( a * 1.37 + 0.4 ) * 0.12;
					vec4 sv = brkLace( vec2( aw / 0.83, flowS / 3.0 ) );
					// and broad bands (sections of the lip thicker or thinner than others), visible from afar
					vec4 sbv = brkLace( vec2( aw / 2.9, flowS / 9.0 ) + vec2( 0.37, 0.61 ) );
					float sb = sbv.z;
					float hS = sv.x * 0.02 + sv.z * 0.012;
					vec3 dpx = dFdx( pos );
					vec3 dpy = dFdy( pos );
					vec3 r1 = cross( dpy, N0 );
					vec3 r2 = cross( N0, dpx );
					float det = dot( dpx, r1 );
					vec3 grad = ( r1 * dFdx( hS ) + r2 * dFdy( hS ) ) * sign( det );
					vec3 N = normalize( N0 * abs( det ) - grad + N0 * 1e-9 );
					float NdV = max( dot( N, V ), 1e-3 );
					float F = breakersFresnel( NdV, 1.333 );
					vec3 L = uSunDir;
					vec3 sun = uSunColor * cloudShadowAt( pos );
					// reflection: sky + sun glint
					vec3 Rr = reflect( - V, N );
					vec3 R = normalize( vec3( Rr.x, max( Rr.y, 0.004 ), Rr.z ) );
					vec3 refl = skyReflectionRadiance( R );
					vec3 Hh = normalize( L + V );
					vec3 spec = sun * ( pow( max( dot( N, Hh ), 0.0 ), 180.0 ) * 12.0 ) * F;
					// light through the thin sheet: turquoise when backlit
					vec3 tint = vec3( 0.16, 0.62, 0.56 );
					float back = pow( clamp( dot( - V, L ) * 0.5 + 0.5, 0.0, 1.0 ), 4.0 );
					// thick and deep green at the root, thin, bright and clear toward the tip, uneven along the streaks
					float thin = mix( 1.5, 0.7, v ) * ( sv.z * 0.3 + 0.8 ) * ( sb * 0.8 + 0.6 );
					vec3 glow = ( sun * tint * ( back * 0.9 + 0.08 ) + uSkyIrr * tint * 1.4 ) * thin;
					float aW = F + min( ( 1.0 - F ) * mix( 0.42, 0.16, v ) * ( sv.x * 0.5 + 0.75 ) * ( sb * 0.7 + 0.65 ), 0.85 );
					vec3 cW = refl * F + spec + glow * ( 1.0 - F ) * 0.42;
					// The jet stays clear, glassy water while it is in the air: only its leading edge tears into
					// aerated fingers (filaments of the lace stretched along the flow, merging into a ragged white rim)
					float flowM = v * len - t * 1.1; // metres down the curtain, moving with the jet
					vec2 fuv = vec2( aw / 1.9 + 0.53, flowM / 1.8 );
					vec4 fl = brkLace( fuv );
					float sect = fl.z; // slowly varying along the crest
					float vary = sect - 0.5 + sin( aw * 0.29 + b * 2.1 ) * 0.15;
					// slightly irregular leading edge (sections of the lip reach a little further than others)
					float tipN = sin( aw * 1.3 + t * 0.3 ) * 0.6 + sin( aw * 4.7 + 1.3 ) * 0.4;
					float edge = v + tipN * 0.03 + vary * 0.04;
					float thrown = smoothstep( 0.35, 0.8, b );
					// a thin, translucent aerated rim along the leading edge
					float rim = smoothstep( 0.9, 0.96, edge ) * ( fl.z * 0.2 + 0.2 ) * thrown;
					// once the lip has landed the curtain is a falling mass of whitewater that dissolves (blotchy) into
					// the splash-up and the roller within a fraction of a second (in streaks: white fingers run down the
					// curtain ahead of the rest, so along a peeling crest the broken section feathers into the clear one)
					float fing = ( sv.w * 0.55 + sv.z * 0.2 ) * ( smoothstep( 0.25, 0.75, sbv.w * 0.6 + sb * 0.4 ) * 0.8 + 0.2 ) * 0.34;
					float wh = smoothstep( ( 1.0 - v ) * 0.18 + 0.9 - fing, ( 1.0 - v ) * 0.18 + 1.0 - fing, b ); // from the tip up
					vec4 lc = brkLace( vec2( aw * 0.83 + 1.9, v * len - t * 1.3 ) / ( BRK_LACE_TILE * 0.8 ) );
					float blot = lc.z * 0.7 + lc.y * 0.3;
					float gone = smoothstep( 1.0, 1.25, b );
					float clumpW = smoothstep( gone - 0.12, gone + 0.12, blot );
					float clumps = clamp( ( blot - gone ) * 2.5, 0.0, 1.0 ); // thicker inside the blotches
					// thin aerated filaments stretched down the curtain (foam of the previous wave drawn up the face and
					// thrown out with the lip), more of them toward the tip
					float fil = ( 1.0 - smoothstep( 0.02, 0.12, sv.x ) ) * smoothstep( 0.15, 0.8, v ) * ( sv.w * 0.5 + 0.25 ) * ( sb * 0.9 + 0.3 ) * thrown;
					float aer = mix( max( rim, fil ), 0.95, wh );
					// aerated water is a dense scatterer: bright from every side, glowing when backlit
					vec3 foamLit = ( sun * ( max( dot( N, L ), 0.0 ) * 0.5 + 0.5 + back * 1.2 ) / 3.141592653589793 + uSkyIrr ) * 0.9;
					float tip = 1.0 - smoothstep( 0.93, 1.0, edge );
					float alpha = vLipFade * tip * uSheet * mix( 1.0, clumpW, wh );
					float aF = aer * 0.92;
					vec3 col = foamLit * mix( 1.0, clumps * 0.4 + 0.75, wh ) * aF + cW * ( 1.0 - aF );
					float aOut = ( aF + aW * ( 1.0 - aF ) ) * alpha;
					// (ours) the haze of the per-material fog, on the colour before it is premultiplied
					col = atmosphereFog( col, pos );
					gl_FragColor = vec4( col * alpha, aOut );
				}`,
			transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
			blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		} );
		this.material = mat;
		const mesh = this.mesh = new THREE.Mesh( geo, mat );
		mesh.name = 'BreakerLips';
		mesh.frustumCulled = false;
		mesh.visible = false;
		mesh.renderOrder = 11;
	}

	// the crests this frame (after the FFT and the shore uniforms)
	update( disp ) {
		if ( ! this.NS || ! this.enabled ) return;
		this.kernel.uniforms.uOceanDisp.value = disp;
		this.material.uniforms.uSpacing.value = this.spacing;
		const gl = this.renderer, prev = gl.getRenderTarget();
		this.quad.material = this.kernel;
		gl.setRenderTarget( this.crest );
		this.quad.render( gl );
		gl.setRenderTarget( prev );
	}

	dispose() {
		this.crest.dispose();
		this.stationTex.dispose();
		this.kernel.dispose();
		this.material.dispose();
		this.mesh.geometry.dispose();
		this.quad.dispose();
	}
}
