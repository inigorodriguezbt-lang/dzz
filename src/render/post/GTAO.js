// Ported from Tidewater src/post/GTAO.js and the AO part of src/post/PostFX.js (the half resolution depth
// copy, the depth-aware blur and postColorAO) (MIT, see LICENSE-Tidewater.txt); Tidewater's GTAO is itself a
// port of three's GTAONode (the same algorithm as three/examples/jsm/shaders/GTAOShader.js).
// Ground Truth Ambient Occlusion at half resolution on the opaque depth (normals from depth, 3 slices x 4
// steps, 5x5 magic-square rotation noise), a separable 5 + 5 depth-aware blur, then the beauty pass:
// scene colour x multi-bounce AO, upsampled depth-aware, strongest where the pixel is lit by the sky alone.
// WebGL conventions: uv.y up, reversed-Z depth (1 near, 0 at infinity).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// from the Activision GTAO paper
const TEMPORAL_ROTATIONS = [ 60, 300, 180, 240, 120, 0 ];
const SPATIAL_OFFSETS = [ 0, 0.5, 0.25, 0.75 ];
const SAMPLES = 12;
const DIRECTIONS = SAMPLES < 30 ? 3 : 5;
const STEPS = Math.ceil( SAMPLES / DIRECTIONS );

const VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// half resolution depth: one texel per AO pixel (the top-left of its 2x2)
const DEPTH_FRAG = /* glsl */`
	uniform sampler2D tDepth;
	void main() {
		ivec2 s = textureSize( tDepth, 0 );
		ivec2 p = min( ivec2( gl_FragCoord.xy ) * 2, s - 1 );
		gl_FragColor = vec4( texelFetch( tDepth, p, 0 ).r, 0.0, 0.0, 1.0 );
	}`;

const GTAO_FRAG = /* glsl */`
	uniform sampler2D tDepth; uniform sampler2D tNoise;
	uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uResolution;
	uniform float uRadius; uniform float uThickness; uniform float uScale;
	uniform float uTemporalDirection; uniform float uTemporalOffset;
	varying vec2 vUv;
	const float PI = 3.141592653589793;
	float gtaoLoad( ivec2 p ) { return texelFetch( tDepth, clamp( p, ivec2( 0 ), textureSize( tDepth, 0 ) - 1 ), 0 ).r; }
	float gtaoSampleDepth( vec2 uv ) { vec2 s = vec2( textureSize( tDepth, 0 ) ); return gtaoLoad( ivec2( floor( uv * s ) ) ); }
	vec3 gtaoViewPosition( vec2 uv, float depth ) {
		vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, depth, 1.0 );
		return v.xyz / v.w;
	}
	vec2 gtaoScreenFromClip( vec4 c ) { return c.xy / c.w * 0.5 + 0.5; }
	// three's getNormalFromDepth
	vec3 gtaoNormalFromDepth( vec2 uv ) {
		vec2 size = vec2( textureSize( tDepth, 0 ) );
		ivec2 p = ivec2( uv * size );
		float c0 = gtaoLoad( p );
		float l2 = gtaoLoad( p - ivec2( 2, 0 ) ); float l1 = gtaoLoad( p - ivec2( 1, 0 ) );
		float r1 = gtaoLoad( p + ivec2( 1, 0 ) ); float r2 = gtaoLoad( p + ivec2( 2, 0 ) );
		float b2 = gtaoLoad( p - ivec2( 0, 2 ) ); float b1 = gtaoLoad( p - ivec2( 0, 1 ) );
		float t1 = gtaoLoad( p + ivec2( 0, 1 ) ); float t2 = gtaoLoad( p + ivec2( 0, 2 ) );
		float dl = abs( ( 2.0 * l1 - l2 ) - c0 );
		float dr = abs( ( 2.0 * r1 - r2 ) - c0 );
		float db = abs( ( 2.0 * b1 - b2 ) - c0 );
		float dt = abs( ( 2.0 * t1 - t2 ) - c0 );
		vec3 ce = gtaoViewPosition( uv, c0 );
		vec3 dpdx = dl < dr ? ce - gtaoViewPosition( uv - vec2( 1.0 / size.x, 0.0 ), l1 ) : - ce + gtaoViewPosition( uv + vec2( 1.0 / size.x, 0.0 ), r1 );
		vec3 dpdy = db < dt ? ce - gtaoViewPosition( uv - vec2( 0.0, 1.0 / size.y ), b1 ) : - ce + gtaoViewPosition( uv + vec2( 0.0, 1.0 / size.y ), t1 );
		return normalize( cross( dpdx, dpdy ) );
	}
	float gtaoRand( vec2 uv ) {
		float dt = dot( uv, vec2( 12.9898, 78.233 ) );
		float sn = dt - PI * floor( dt / PI );
		return fract( sin( sn ) * 43758.5453 );
	}
	float ign( vec2 px ) { return fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	void main() {
		vec2 uvNode = vUv;
		// the four depth texels under this AO pixel: the farthest (sidesteps the nearest rounding)
		vec2 s = vec2( textureSize( tDepth, 0 ) );
		ivec2 g0 = ivec2( floor( uvNode * s - 0.5 ) );
		float depth = min( min( gtaoLoad( g0 ), gtaoLoad( g0 + ivec2( 1, 0 ) ) ), min( gtaoLoad( g0 + ivec2( 0, 1 ) ), gtaoLoad( g0 + ivec2( 1, 1 ) ) ) );
		// nothing there (sky: reversed-Z depth 0 at infinity): unoccluded
		if ( depth <= 0.0 ) { gl_FragColor = vec4( 1.0 ); return; }
		vec3 viewPosition = gtaoViewPosition( uvNode, depth );
		vec3 viewNormal = gtaoNormalFromDepth( uvNode );
		float radius = uRadius;
		float invRadius = 1.0 / radius;
		vec3 viewDir = normalize( - viewPosition );
		vec4 clipPosition = uProj * vec4( viewPosition, 1.0 );
		// 5x5 magic square rotation noise
		ivec2 nt = ivec2( gl_FragCoord.xy ) % 5;
		vec3 randomVec = texelFetch( tNoise, nt, 0 ).xyz * 2.0 - 1.0;
		vec3 tangent = normalize( vec3( randomVec.xy, 0.0 ) );
		vec3 bitangent = vec3( - tangent.y, tangent.x, 0.0 );
		mat3 kernelMatrix = mat3( tangent, bitangent, vec3( 0.0, 0.0, 1.0 ) );
		float invSteps = 1.0 / float( ${STEPS} );
		float ao = 0.0;
		float noiseJitterIdx = uTemporalDirection * 0.02;
		float stepJitter = ign( gl_FragCoord.xy + uTemporalOffset ) + gtaoRand( ( uvNode + noiseJitterIdx ) * 2.0 - 1.0 );
		for ( int i = 0; i < ${DIRECTIONS}; i ++ ) {
			float angle = float( i ) / float( ${DIRECTIONS} ) * PI + uTemporalDirection;
			vec3 sampleDir = kernelMatrix * vec3( cos( angle ), sin( angle ), 0.0 );
			vec4 clipDirRadius = uProj * vec4( sampleDir, 0.0 ) * radius;
			vec3 sliceBitangent = normalize( cross( sampleDir, viewDir ) );
			vec3 sliceTangent = cross( sliceBitangent, viewDir );
			vec3 projNRaw = viewNormal - sliceBitangent * dot( viewNormal, sliceBitangent );
			float projNLen = length( projNRaw );
			vec3 projN = projNRaw / max( projNLen, 0.0001 );
			float nSin = dot( projN, sliceTangent );
			float nCos = clamp( dot( projN, viewDir ), 0.0, 1.0 );
			float signNSin = nSin >= 0.0 ? 1.0 : -1.0;
			float angleN = signNSin * acos( nCos );
			vec3 tangentToNormalInSlice = cross( projN, sliceBitangent );
			float cosHorizon = dot( viewDir, tangentToNormalInSlice );
			vec2 cosHorizons = vec2( cosHorizon, - cosHorizon );
			for ( int j = 0; j < ${STEPS}; j ++ ) {
				// quadratic step distribution (Eevee)
				float t = ( float( j ) + 1.0 + stepJitter ) * invSteps;
				float sampleDist = t * t;
				vec4 clipOffset = clipDirRadius * sampleDist;
				vec2 spX = gtaoScreenFromClip( clipPosition + clipOffset );
				vec3 viewDeltaX = gtaoViewPosition( spX, gtaoSampleDepth( spX ) ) - viewPosition;
				float lenX = length( viewDeltaX );
				float sHX = dot( viewDir, viewDeltaX ) / max( lenX, 0.0001 );
				float distFacX = min( lenX * invRadius, 1.0 );
				if ( abs( viewDeltaX.z ) < uThickness ) cosHorizons.x = mix( max( cosHorizons.x, sHX ), cosHorizons.x, distFacX * distFacX );
				vec2 spY = gtaoScreenFromClip( clipPosition - clipOffset );
				vec3 viewDeltaY = gtaoViewPosition( spY, gtaoSampleDepth( spY ) ) - viewPosition;
				float lenY = length( viewDeltaY );
				float sHY = dot( viewDir, viewDeltaY ) / max( lenY, 0.0001 );
				float distFacY = min( lenY * invRadius, 1.0 );
				if ( abs( viewDeltaY.z ) < uThickness ) cosHorizons.y = mix( max( cosHorizons.y, sHY ), cosHorizons.y, distFacY * distFacY );
			}
			// cosine-weighted inner integral, closed form (Activision GTAO paper, Eq. 7)
			float hPos = acos( clamp( cosHorizons.y, -1.0, 1.0 ) );
			float hNeg = - acos( clamp( cosHorizons.x, -1.0, 1.0 ) );
			float termPos = - cos( hPos * 2.0 - angleN ) + nCos + hPos * 2.0 * nSin;
			float termNeg = - cos( hNeg * 2.0 - angleN ) + nCos + hNeg * 2.0 * nSin;
			ao += projNLen * ( termPos + termNeg ) * 0.25;
		}
		ao = clamp( ao / float( ${DIRECTIONS} ), 0.0, 1.0 );
		ao = pow( ao, uScale );
		gl_FragColor = vec4( ao, 0.0, 0.0, 1.0 );
	}`;

// separable 5-tap depth-aware blur at the AO resolution
const blurFrag = ( dx, dy ) => /* glsl */`
	uniform sampler2D tSrc; uniform sampler2D tDepth;
	varying vec2 vUv;
	float depthAt( vec2 uv ) { ivec2 s = textureSize( tDepth, 0 ); return texelFetch( tDepth, clamp( ivec2( floor( uv * vec2( s ) ) ), ivec2( 0 ), s - 1 ), 0 ).r; }
	void main() {
		vec2 size = vec2( textureSize( tSrc, 0 ) );
		float dC = depthAt( vUv );
		float sum = 0.0, wSum = 0.0;
		for ( int k = -2; k <= 2; k ++ ) {
			vec2 uvK = vUv + vec2( ${dx}.0, ${dy}.0 ) * float( k ) / size;
			float rel = abs( depthAt( uvK ) - dC ) / max( dC, 1e-7 );
			float w = 1.0 / ( ( rel * 40.0 + 1.0 ) * ( rel * 40.0 + 1.0 ) );
			sum += texture2D( tSrc, uvK ).r * w;
			wSum += w;
		}
		gl_FragColor = vec4( sum / wSum, 0.0, 0.0, 1.0 );
	}`;

// scene colour x AO on opaque pixels (Tidewater PostFX.js postColorAO); sky and water-covered pixels untouched
const BEAUTY_FRAG = /* glsl */`
	uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO; uniform sampler2D tAODepth;
	uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform float uWaterLevel; uniform float uStrength;
	varying vec2 vUv;
	void main() {
		vec3 c = texture2D( tColor, vUv ).rgb;
		ivec2 ds = textureSize( tDepth, 0 );
		float dO = texelFetch( tDepth, clamp( ivec2( vUv * vec2( ds ) ), ivec2( 0 ), ds - 1 ), 0 ).r;
		bool isSky = dO < 1e-7;
		bool covered = false;
		if ( ! isSky ) {
			vec4 v = uInvProj * vec4( vUv * 2.0 - 1.0, dO, 1.0 );
			covered = ( uCamWorld * vec4( v.xyz / v.w, 1.0 ) ).y < uWaterLevel;
		}
		if ( isSky || covered ) { gl_FragColor = vec4( c, 1.0 ); return; }
		// depth-aware upsample of the half-res AO: the 4 nearest AO texels, weighted by how close their depth
		// is to this pixel's (no dark halos bleeding across depth edges)
		ivec2 aoSizeI = textureSize( tAO, 0 );
		vec2 pa = vUv * vec2( aoSizeI ) - 0.5;
		vec2 i0 = floor( pa );
		vec2 fr = pa - i0;
		float aSum = 0.0, wSum = 1e-4;
		for ( int k = 0; k < 4; k ++ ) {
			ivec2 o = ivec2( k & 1, k >> 1 );
			ivec2 pT = clamp( ivec2( i0 ) + o, ivec2( 0 ), aoSizeI - 1 );
			float dT = texelFetch( tAODepth, pT, 0 ).r;
			float wBil = ( o.x == 1 ? fr.x : 1.0 - fr.x ) * ( o.y == 1 ? fr.y : 1.0 - fr.y );
			// reversed-Z depth ~ near / z: the relative depth difference ~ |dT - dO| / dO
			float rel = abs( dT - dO ) / max( dO, 1e-7 );
			float wt = wBil / ( ( rel * 40.0 + 1.0 ) * ( rel * 40.0 + 1.0 ) ) + 1e-5;
			aSum += texelFetch( tAO, pT, 0 ).r * wt;
			wSum += wt;
		}
		float a = aSum / wSum;
		// multi-bounce approximation (Jimenez 2016) for a typical outdoor albedo of ~0.35
		float aMB = max( a, ( ( a * 0.382 - 1.036 ) * a + 1.654 ) * a );
		// AO only removes ambient light: full effect where the pixel is lit by the sky alone, a third of it on
		// sunlit surfaces (still grounds objects without dirty halos)
		float ambientOnly = 1.0 - smoothstep( 0.12, 0.9, dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) );
		float k = uStrength * mix( 0.35, 1.0, ambientOnly );
		gl_FragColor = vec4( c * mix( 1.0, aMB, k ), 1.0 );
	}`;

function target( type = THREE.HalfFloatType, format = THREE.RedFormat ) {
	const t = new THREE.WebGLRenderTarget( 1, 1, { type, format, depthBuffer: false } );
	t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
	t.texture.generateMipmaps = false;
	return t;
}

function magicSquareNoise( size = 5 ) {
	const n = size % 2 === 0 ? size + 1 : size;
	const sq = new Array( n * n ).fill( 0 );
	let i = Math.floor( n / 2 ), j = n - 1;
	for ( let num = 1; num <= n * n; ) {
		if ( i === - 1 && j === n ) { j = n - 2; i = 0; } else { if ( j === n ) j = 0; if ( i < 0 ) i = n - 1; }
		if ( sq[ i * n + j ] !== 0 ) { j -= 2; i ++; continue; } else sq[ i * n + j ] = num ++;
		j ++; i --;
	}
	const data = new Uint8Array( n * n * 4 );
	for ( let k = 0; k < n * n; k ++ ) {
		const a = 2 * Math.PI * sq[ k ] / ( n * n );
		data[ k * 4 ] = ( Math.cos( a ) * 0.5 + 0.5 ) * 255;
		data[ k * 4 + 1 ] = ( Math.sin( a ) * 0.5 + 0.5 ) * 255;
		data[ k * 4 + 2 ] = 127;
		data[ k * 4 + 3 ] = 255;
	}
	const t = new THREE.DataTexture( data, n, n, THREE.RGBAFormat );
	t.minFilter = t.magFilter = THREE.NearestFilter;
	t.needsUpdate = true;
	return t;
}

export class GTAO {
	constructor() {
		const m = ( frag, uniforms ) => new THREE.ShaderMaterial( { vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false } );
		this.depthRT = target();
		this.aoRT = target( THREE.UnsignedByteType );
		this.blurX = target();
		this.blurY = target();
		this.depthMat = m( DEPTH_FRAG, { tDepth: { value: null } } );
		this.gtaoMat = m( GTAO_FRAG, {
			tDepth: { value: this.depthRT.texture }, tNoise: { value: magicSquareNoise() },
			uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uResolution: { value: new THREE.Vector2() },
			uRadius: { value: 2.2 }, uThickness: { value: 2.0 }, uScale: { value: 1.6 },
			uTemporalDirection: { value: 0 }, uTemporalOffset: { value: 1 },
		} );
		this.blurXMat = m( blurFrag( 1, 0 ), { tSrc: { value: this.aoRT.texture }, tDepth: { value: this.depthRT.texture } } );
		this.blurYMat = m( blurFrag( 0, 1 ), { tSrc: { value: this.blurX.texture }, tDepth: { value: this.depthRT.texture } } );
		this.beautyMat = m( BEAUTY_FRAG, {
			tColor: { value: null }, tDepth: { value: null }, tAO: { value: this.blurY.texture }, tAODepth: { value: this.depthRT.texture },
			uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uWaterLevel: { value: 0 }, uStrength: { value: 1 },
		} );
		this.quad = new FullScreenQuad();
		this.frameId = 0;
		this.temporal = false;
	}

	setSize( w, h ) {
		const aw = Math.max( 1, Math.round( w * 0.5 ) ), ah = Math.max( 1, Math.round( h * 0.5 ) );
		for ( const t of [ this.depthRT, this.aoRT, this.blurX, this.blurY ] ) t.setSize( aw, ah );
		this.gtaoMat.uniforms.uResolution.value.set( aw, ah );
	}

	_draw( m, t ) {
		this.quad.material = m;
		this.gl.setRenderTarget( t );
		this.quad.render( this.gl );
	}

	// color / depth: the opaque scene; out: the beauty target. proj: the (unjittered) projection of the frame
	render( gl, color, depth, camera, out, proj = camera.projectionMatrix, projInv = camera.projectionMatrixInverse ) {
		this.gl = gl;
		const u = this.gtaoMat.uniforms;
		if ( this.temporal ) {
			const id = this.frameId ++;
			u.uTemporalDirection.value = TEMPORAL_ROTATIONS[ id % 6 ] / 360;
			u.uTemporalOffset.value = SPATIAL_OFFSETS[ id % 4 ];
		} else {
			u.uTemporalDirection.value = 0;
			u.uTemporalOffset.value = 1;
		}
		u.uProj.value.copy( proj );
		u.uInvProj.value.copy( projInv );
		this.depthMat.uniforms.tDepth.value = depth;
		this._draw( this.depthMat, this.depthRT );
		this._draw( this.gtaoMat, this.aoRT );
		this._draw( this.blurXMat, this.blurX );
		this._draw( this.blurYMat, this.blurY );
		const b = this.beautyMat.uniforms;
		b.tColor.value = color;
		b.tDepth.value = depth;
		b.uInvProj.value.copy( projInv );
		b.uCamWorld.value.copy( camera.matrixWorld );
		this._draw( this.beautyMat, out );
	}

	dispose() {
		for ( const t of [ this.depthRT, this.aoRT, this.blurX, this.blurY ] ) t.dispose();
	}
}
