// Ported from Tidewater src/ocean/Caustics.js (MIT, see LICENSE-Tidewater.txt)
// Caustics by rasterized photon splatting (as in Evan Wallace's "WebGL Water"). A fine grid covering one FFT
// tile is drawn into an offscreen target. Each vertex is a point on the real wave surface; the sun ray is
// refracted through the surface normal there and followed down to a plane D metres below, and the vertex is
// placed at that landing point. The fragment writes (area on the surface / area on the floor) with additive
// blending, which is exactly the light concentration, so focusing folds form the bright caustic networks
// physically. The grid covers the tile plus a margin on every side (the FFT tiles, so the margin is the
// neighbouring tiles' surface): light refracted in from across the tile edge lands inside it.
// Two focal planes per layer (shallow, deep) are blended by the real depth at lookup; the broad layer from
// the next cascade adds broad focusing so the result never repeats. (Ours: both layers share one mipmapped
// RGBA16F 512^2 texture, fine in RG, broad in BA: one sampler.)
// GLSL (CAUSTICS_GLSL; needs uCaustics, uCausticsStrength, uSunDir and seaDetailSample):
//   vec3 causticsSample( P, depth, slope, foam, gdx, gdy )  caustic light factor (mean ~1); gdx / gdy = the
//        change of P.xz across one pixel (dFdx / dFdy)
//   vec3 causticsSampleLevel( P, depth, level )  flat surface, fixed blur level
import * as THREE from 'three';
import { releaseArraysOnUpload } from '../../render/Materials.js';

const RES = 512;
const LAYERS = [
	// fine networks (finest cascade, ripples < ~11 cm filtered out: they defocus immediately)
	{ cascade: 3, grid: 256, depths: [ 1.2, 4.0 ], slopeLevel: 1, margin: 0.35, ch: 0 },
	// broad focusing from the next cascade; different tile size -> no visible repetition
	{ cascade: 2, grid: 128, depths: [ 3.0, 9.0 ], slopeLevel: 0.5, margin: 0.35, ch: 2 },
];
const f = ( x ) => { const s = String( x ); return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0'; };

export class Caustics {
	constructor( renderer, sizes ) {
		this.renderer = renderer;
		this.sizes = sizes;
		this.strength = 0.75;
		this.rt = new THREE.WebGLRenderTarget( RES, RES, {
			type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
			wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
			minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
		} );
		this.rt.texture.anisotropy = 4;
		this.scene = new THREE.Scene();
		// (a real camera: the reversed-depth renderer updates the projection of whatever camera it renders with;
		// the vertex shader ignores it)
		this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
		this.uniforms = { uOceanDeriv: { value: null }, uCauSun: { value: new THREE.Vector3( 0, 1, 0 ) } };
		this.meshes = [];
		for ( const Ly of LAYERS ) for ( let k = 0; k < 2; k ++ ) {
			const mesh = new THREE.Mesh( this._grid( Ly ), this._material( Ly, k ) );
			mesh.frustumCulled = false;
			this.scene.add( mesh );
			this.meshes.push( mesh );
		}
		this.fineTile = sizes[ LAYERS[ 0 ].cascade ];
		this.broadTile = sizes[ LAYERS[ 1 ].cascade ];
	}

	// indexed grid over [-margin, 1 + margin]^2 at the tile's vertex density (each surface vertex is shaded once)
	_grid( Ly ) {
		const g = Math.ceil( Ly.grid * ( 1 + 2 * Ly.margin ) ), row = g + 1;
		const pos = new Float32Array( row * row * 3 );
		for ( let y = 0, i = 0; y <= g; y ++ ) for ( let x = 0; x <= g; x ++ ) { pos[ i ++ ] = x / g * ( 1 + 2 * Ly.margin ) - Ly.margin; pos[ i ++ ] = y / g * ( 1 + 2 * Ly.margin ) - Ly.margin; pos[ i ++ ] = 0; }
		const idx = new Uint32Array( g * g * 6 );
		for ( let y = 0, i = 0; y < g; y ++ ) for ( let x = 0; x < g; x ++ ) {
			const a = y * row + x;
			idx[ i ++ ] = a; idx[ i ++ ] = a + 1; idx[ i ++ ] = a + row;
			idx[ i ++ ] = a + row; idx[ i ++ ] = a + 1; idx[ i ++ ] = a + row + 1;
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		geo.setIndex( new THREE.BufferAttribute( idx, 1 ) );
		// (static: the CPU copies, 16 MB over the four grids, go once uploaded)
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3( 0.5, 0.5, 0 ), 2 );
		return releaseArraysOnUpload( geo );
	}

	_material( Ly, k ) {
		const L = this.sizes[ Ly.cascade ], D = Ly.depths[ k ];
		const out = [ '0.0', '0.0', '0.0', '0.0' ];
		out[ Ly.ch + k ] = 'I';
		return new THREE.RawShaderMaterial( {
			glslVersion: THREE.GLSL3,
			uniforms: this.uniforms,
			vertexShader: /* glsl */`
				precision highp float; precision highp sampler2DArray;
				in vec3 position;
				uniform sampler2DArray uOceanDeriv; uniform vec3 uCauSun;
				out vec2 vOld; out vec2 vNew;
				void main() {
					vec2 uv = position.xy;
					vec4 d = textureLod( uOceanDeriv, vec3( uv, ${ f( Ly.cascade ) } ), ${ Ly.slopeLevel.toFixed( 3 ) } );
					vec2 s = vec2( d.x / max( d.z + 1.0, 0.3 ), d.y / max( d.w + 1.0, 0.3 ) );
					vec3 n = normalize( vec3( - s.x, 1.0, - s.y ) );
					vec3 T = refract( - uCauSun, n, 1.0 / 1.333 );
					float tDown = max( - T.y, 0.15 );
					// the flat-surface refraction offset is removed so the pattern stays registered with the entry
					// point (the lookup re-applies it with the real depth)
					vec3 T0 = refract( - uCauSun, vec3( 0.0, 1.0, 0.0 ), 1.0 / 1.333 );
					vec2 off = ( T.xz / tDown - T0.xz / max( - T0.y, 0.15 ) ) * ${ D.toFixed( 3 ) };
					vec2 p = uv * ${ f( L ) };
					vec2 qq = p + off;
					vOld = p;
					vNew = qq;
					vec2 ndc = qq / ${ f( L ) } * 2.0 - 1.0;
					gl_Position = vec4( ndc, 0.0, 1.0 );
				}`,
			fragmentShader: /* glsl */`
				precision highp float;
				in vec2 vOld; in vec2 vNew;
				out vec4 o;
				void main() {
					// area ratio between the surface patch and its image on the floor
					float ao = abs( dFdx( vOld ).x * dFdy( vOld ).y - dFdx( vOld ).y * dFdy( vOld ).x );
					float an = abs( dFdx( vNew ).x * dFdy( vNew ).y - dFdx( vNew ).y * dFdy( vNew ).x );
					// soft limit: a single nearly-folded cell must not become a flat white hot spot (the finite sun
					// disk spreads real caustic peaks to a few times the mean anyway)
					float I = ao / max( an + ao * ( 1.0 / 8.0 ), 1e-9 );
					o = vec4( ${ out.join( ', ' ) } );
				}`,
			depthTest: false, depthWrite: false, side: THREE.DoubleSide,
			blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
			blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
		} );
	}

	get texture() { return this.rt.texture; }

	// every 2nd frame (perf: the splatting is ~1M tiny triangles; the light on the seabed drifts slowly, 30 Hz
	// is plenty); on a machine running below ~22 fps every 4th, and not for the near-zero steps of a load (the
	// pattern would not change)
	update( deriv, sunDir, dt = 1 / 60 ) {
		this._n = ( this._n || 0 ) + 1;
		if ( this._done && ( dt < 0.004 || this._n % ( dt > 0.045 ? 4 : 2 ) !== 0 ) ) return;
		this._done = true;
		const gl = this.renderer;
		this.uniforms.uOceanDeriv.value = deriv;
		this.uniforms.uCauSun.value.copy( sunDir );
		const prev = gl.getRenderTarget();
		const cc = gl.getClearColor( new THREE.Color() ), ca = gl.getClearAlpha();
		gl.setRenderTarget( this.rt );
		gl.setClearColor( 0x000000, 0 );
		gl.clear( true, false, false );
		this.rt.texture.generateMipmaps = true;
		gl.render( this.scene, this.camera );
		this.rt.texture.generateMipmaps = false;
		gl.setClearColor( cc, ca );
		gl.setRenderTarget( prev );
	}

	uniformsForMaterial() { return { uCaustics: { value: this.texture }, uCausticsStrength: { value: this.strength } }; }

	glsl() {
		const Ft = this.fineTile, Bt = this.broadTile;
		return /* glsl */`
	uniform sampler2D uCaustics; uniform float uCausticsStrength;
	// the blur level is the least filtering; with a footprint, each gradient is stretched to at least that
	// level's texel size
	vec2 _causticsStretch( vec2 g, float minLen ) { return g * max( minLen / max( length( g ), 1e-9 ), 1.0 ); }
	vec4 _causticsFetch( vec2 uv, float lvl, vec2 gdx, vec2 gdy, bool useGrad, float tile ) {
		if ( ! useGrad ) return textureLod( uCaustics, uv, lvl );
		float minLen = exp2( lvl ) / ${ f( RES ) };
		return textureGrad( uCaustics, uv, _causticsStretch( gdx / tile, minLen ), _causticsStretch( gdy / tile, minLen ) );
	}
	// gust / slick factor of the caustics at xz
	float causticsDetailK( vec2 xz ) {
		SeaDetailSample det = seaDetailSample( xz );
		return mix( 0.55, 1.25, det.gust ) * ( 1.0 - det.slick * 0.6 );
	}
	vec3 _causticsSample( vec3 P, float depth, float level, vec2 slope, float foam, bool hasFoam, vec2 gdx, vec2 gdy, bool useGrad, bool mono ) {
		// the light reaching this point entered the water up-sun along the refracted sun ray
		vec3 n = normalize( vec3( - slope.x, 1.0, - slope.y ) );
		vec3 Ls = refract( - uSunDir, n, 1.0 / 1.333 );
		float tDown = max( - Ls.y, 0.15 );
		vec2 entry = P.xz - Ls.xz * ( depth / tDown );
		// deeper -> softer (finite sun disk + forward scattering)
		float blur = level >= 0.0 ? level : clamp( depth * 0.4 - 0.2, 0.0, 3.0 );
		float wD = clamp( ( depth - 1.2 ) / 2.8, 0.0, 1.0 ); // blend between the two focal planes
		vec2 uvF = entry / ${ f( Ft ) };
		vec4 tg = _causticsFetch( uvF, blur, gdx, gdy, useGrad, ${ f( Ft ) } );
		float g = mix( tg.x, tg.y, wD );
		float r = g;
		float b = g;
		if ( ! mono ) {
			// slight chromatic dispersion: each colour lands a little apart along the sun direction
			vec2 disp = normalize( Ls.xz + vec2( 1e-4, 0.0 ) ) * ( depth * 0.0035 );
			vec4 tr = _causticsFetch( uvF + disp / ${ f( Ft ) }, blur, gdx, gdy, useGrad, ${ f( Ft ) } );
			vec4 tb = _causticsFetch( uvF - disp / ${ f( Ft ) }, blur, gdx, gdy, useGrad, ${ f( Ft ) } );
			r = mix( tr.x, tr.y, wD );
			b = mix( tb.x, tb.y, wD );
		}
		vec4 broad = _causticsFetch( entry / ${ f( Bt ) }, 1.5, gdx, gdy, useGrad, ${ f( Bt ) } );
		float br = mix( broad.z, broad.w, clamp( depth / 9.0, 0.0, 1.0 ) );
		vec3 c = vec3( r, g, b ) * mix( 1.0, br, 0.6 );
		// no caustics right at the surface, strongest in the first metres, fading with depth
		float k = smoothstep( 0.03, 0.5, depth ) * exp( depth * -0.06 ) * uCausticsStrength;
		k *= causticsDetailK( entry );
		if ( hasFoam ) k *= 1.0 - clamp( foam, 0.0, 1.0 );
		vec3 result = mix( vec3( 1.0 ), c, k );
		// foam and bubble clouds scatter the light back up: the floor under them is shaded
		return hasFoam ? result * ( 1.0 - clamp( foam, 0.0, 1.0 ) * 0.6 ) : result;
	}
	vec3 causticsSample( vec3 P, float depth, vec2 slope, float foam, vec2 gdx, vec2 gdy ) {
		return _causticsSample( P, depth, -1.0, slope, foam, true, gdx, gdy, true, false );
	}
	vec3 causticsSampleMono( vec3 P, float depth, vec2 slope, float foam, vec2 gdx, vec2 gdy ) {
		return _causticsSample( P, depth, -1.0, slope, foam, true, gdx, gdy, true, true );
	}
	vec3 causticsSampleLevel( vec3 P, float depth, float level ) {
		return _causticsSample( P, depth, level, vec2( 0.0 ), 0.0, false, vec2( 0.0 ), vec2( 0.0 ), false, false );
	}
`;
	}

	dispose() {
		this.rt.dispose();
		for ( const m of this.meshes ) { m.geometry.dispose(); m.material.dispose(); }
	}
}
