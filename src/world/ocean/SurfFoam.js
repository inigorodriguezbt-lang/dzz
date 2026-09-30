// Ported from Tidewater src/ocean/SurfFoam.js (MIT, see LICENSE-Tidewater.txt)
// Surf-zone foam: the lace texture shared by the shore simulation, and the foam look used by the water
// shader (hooks called from waterSurfaceFragment and the water shading).
// Whitewater is a volume of bubbles: a dense mat that is bright from every side, with a lumpy, bubbly
// surface (darker in its own dips), tearing into patches and then into lace (thin bubble strands around
// clear holes) as it decays. Thin foam is translucent over the water colour.
// GLSL (SURF_FOAM_GLSL; needs shoreSimInside / shoreSimUvOf (ShoreSim), shoreDirAt (ShoreWaves), the
// pattern array uPatterns (layer 1: the lace), uOceanTime, uSunDir, uSkyIrr):
//   SurfFoamInfo surfFoamShading( SurfFoamArgs a ), vec3 surfFoamLight( info, N, L, V, sun, P ),
//   vec4 surfFoamFlowLace( q, flow, salt )
// laceData() is plain JS (generated once in the water's worker).

export const LACE_TILE = 3.5; // metres per tile of the lace texture
const BUMP = 0.7; // relief of the whitewater and of thick foam (normal perturbation strength)
const PERIOD = 1.2; // s, flow map cycle
const MAX_FLOW = 2.5; // m/s, the pattern lags behind faster flow (bounds the distortion per cycle)

// Tileable lace texture (RGBA8, size^2):
//   R: distance to the nearest bubble strand (warped cell edges + noise contours), 0 on a strand, 1 in the
//      middle of a hole: thresholding it by the foam amount gives a dense mat, foam with holes, lace and thin
//      strands as the foam decays
//   G: small bubbles clustered along the strands
//   B: soft mottling (foam density variation)
//   A: per-cell random value (staggers when stranded foam pops)
export function laceData( size ) {
	const data = new Uint8Array( size * size * 4 );
	const hash = ( x, y, s ) => {
		let h = ( x * 374761393 + y * 668265263 + s * 2246822519 ) | 0;
		h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
		h ^= h >>> 16;
		return ( h >>> 0 ) / 4294967296;
	};
	const vnoise = ( x, y, n, s ) => {
		const i = Math.floor( x ), j = Math.floor( y );
		const fx = x - i, fy = y - j;
		const ux = fx * fx * ( 3 - 2 * fx ), uy = fy * fy * ( 3 - 2 * fy );
		const w = ( a ) => ( ( a % n ) + n ) % n;
		const a = hash( w( i ), w( j ), s ), b = hash( w( i + 1 ), w( j ), s );
		const c = hash( w( i ), w( j + 1 ), s ), d = hash( w( i + 1 ), w( j + 1 ), s );
		return ( a * ( 1 - ux ) + b * ux ) * ( 1 - uy ) + ( c * ( 1 - ux ) + d * ux ) * uy;
	};
	const fbm = ( x, y, n, s, oct = 3 ) => {
		let v = 0, a = 0.5, t = 0;
		for ( let o = 0; o < oct; o ++ ) {
			v += vnoise( x * ( 1 << o ), y * ( 1 << o ), n * ( 1 << o ), s + o * 17 ) * a;
			t += a;
			a *= 0.5;
		}
		return v / t;
	};
	// Voronoi F1, F2 and nearest cell id on an n x n periodic jittered grid (coordinates in cells)
	const voronoi = ( x, y, n, s ) => {
		const i = Math.floor( x ), j = Math.floor( y );
		let f1 = 9, f2 = 9, id = 0;
		for ( let dj = - 1; dj <= 1; dj ++ ) for ( let di = - 1; di <= 1; di ++ ) {
			const ci = i + di, cj = j + dj;
			const wi = ( ( ci % n ) + n ) % n, wj = ( ( cj % n ) + n ) % n;
			const px = ci + 0.15 + 0.7 * hash( wi, wj, s ), py = cj + 0.15 + 0.7 * hash( wi, wj, s + 1 );
			const d = Math.hypot( px - x, py - y );
			if ( d < f1 ) {
				f2 = f1; f1 = d; id = hash( wi, wj, s + 2 );
			} else if ( d < f2 ) f2 = d;
		}
		return [ f1, f2, id ];
	};
	const sstep = ( a, b, x ) => {
		const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
		return t * t * ( 3 - 2 * t );
	};
	// pass 1: warped coordinates and the contour noise at every texel
	const N = size * size;
	const UU = new Float32Array( N ), VV = new Float32Array( N ), NC = new Float32Array( N );
	for ( let py = 0; py < size; py ++ ) for ( let px = 0; px < size; px ++ ) {
		const u = ( px + 0.5 ) / size, v = ( py + 0.5 ) / size;
		// two-level domain warp: organic, curvy strands
		const w1x = ( fbm( u * 3, v * 3, 3, 3 ) - 0.5 ) * 0.16, w1y = ( fbm( u * 3 + 5.2, v * 3 + 1.3, 3, 7 ) - 0.5 ) * 0.16;
		const w2x = ( fbm( ( u + w1x ) * 9, ( v + w1y ) * 9, 9, 13 ) - 0.5 ) * 0.07, w2y = ( fbm( ( u + w1x ) * 9 + 2.7, ( v + w1y ) * 9, 9, 17 ) - 0.5 ) * 0.07;
		const k = py * size + px;
		UU[ k ] = u + w1x + w2x;
		VV[ k ] = v + w1y + w2y;
		NC[ k ] = fbm( UU[ k ] * 6, VV[ k ] * 6, 6, 91, 3 );
	}
	// pass 2: distance to the nearest strand
	const N1 = 16, half = 0.5 / N1;
	const D = new Float32Array( N );
	for ( let py = 0; py < size; py ++ ) for ( let px = 0; px < size; px ++ ) {
		const u = ( px + 0.5 ) / size, v = ( py + 0.5 ) / size;
		const k = py * size + px;
		const uu = UU[ k ], vv = VV[ k ];
		// strands 1: edges of a warped cell network (distance to the edge ~ (F2 - F1) / 2, in cells)
		const [ a1, b1, id1 ] = voronoi( uu * N1, vv * N1, N1, 11 );
		const dCells = ( b1 - a1 ) * 0.5 / N1;
		// strands 2: contour loops of the warped noise; distance ~ |n - c| / |grad n| (texture units)
		const n1 = NC[ k ];
		const xl = ( px + size - 1 ) % size, xr = ( px + 1 ) % size, yd = ( py + size - 1 ) % size, yu = ( py + 1 ) % size;
		const gx = ( NC[ py * size + xr ] - NC[ py * size + xl ] ) * size * 0.5;
		const gy = ( NC[ yu * size + px ] - NC[ yd * size + px ] ) * size * 0.5;
		const g = Math.max( Math.hypot( gx, gy ), 0.5 );
		const dLoops = Math.min( Math.abs( n1 - 0.5 ), Math.abs( n1 - 0.36 ), Math.abs( n1 - 0.64 ) ) / g;
		// normalised by half a cell: 0 on a strand, ~1 in the middle of a hole. Irregular hole edges
		// (fine noise) and places where the strands break up (gaps).
		const hi = fbm( u * 24, v * 24, 24, 5, 2 );
		const gap = sstep( 0.52, 0.36, fbm( u * 10 + 3.1, v * 10, 10, 31 ) );
		const d = Math.min( dCells * 1.35 + 0.004, dLoops ) / half * ( 0.75 + 0.5 * hi ) + gap * 0.22;
		const mott = fbm( u * 3, v * 3, 3, 71, 4 );
		// bubbles: small dots, clustered near the strands
		const N3 = 120;
		const [ a3, , id3 ] = voronoi( u * N3, v * N3, N3, 61 );
		const rad = 0.1 + 0.22 * id3;
		const dot = sstep( rad, rad * 0.35, a3 ) * ( id3 > 0.45 ? 1 : 0 );
		const bub = dot * ( 0.25 + 0.75 * sstep( 0.5, 0.1, d ) );
		D[ k ] = Math.min( 1, d );
		data[ k * 4 + 1 ] = Math.round( Math.min( 1, bub ) * 255 );
		data[ k * 4 + 2 ] = Math.round( mott * 255 );
		data[ k * 4 + 3 ] = Math.round( id1 * 255 );
	}
	// pass 3: rounded holes: blurred distance inside the holes, the exact one near the strands
	const D0 = new Float32Array( D );
	const T = new Float32Array( N );
	for ( let it = 0; it < 2; it ++ ) {
		for ( let py = 0; py < size; py ++ ) for ( let px = 0; px < size; px ++ ) {
			let s = 0;
			for ( let o = - 2; o <= 2; o ++ ) s += D[ py * size + ( ( px + o + size ) % size ) ];
			T[ py * size + px ] = s / 5;
		}
		for ( let py = 0; py < size; py ++ ) for ( let px = 0; px < size; px ++ ) {
			let s = 0;
			for ( let o = - 2; o <= 2; o ++ ) s += T[ ( ( py + o + size ) % size ) * size + px ];
			D[ py * size + px ] = s / 5;
		}
	}
	for ( let k = 0; k < N; k ++ ) data[ k * 4 ] = Math.round( ( D0[ k ] + ( D[ k ] - D0[ k ] ) * sstep( 0.12, 0.45, D0[ k ] ) ) * 255 );
	return data;
}

const f = ( x ) => { const s = String( x ); return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0'; };

export const SURF_FOAM_GLSL = /* glsl */`
	struct SurfFoamArgs { float coverage; float foam; float footprint; float depth; float bubbles; vec2 lagXZ; vec3 normal;
		vec3 baseNormal; float fresh; float sim; vec4 simState; float roller; vec3 P; };
	// (height / relief = pattern x weight; the *Pat / *K split is what the lighting differentiates: the
	// weights come from values interpolated across the water mesh, so differentiating the product drew every
	// mesh triangle as a flat facet into the foam. Only the patterns are differentiated.)
	struct SurfFoamInfo { float foam; float density; float height; float surf; float ww; float relief; float selfShadow; float cavity;
		float reliefPat; float reliefK; float thinPat; float thinK; float bubPat; float bubK; };
	// Henyey-Greenstein phase (1/sr)
	float surfFoamPhaseHG( float cosT, float g ) {
		float g2 = g * g;
		return ( ( 1.0 - g2 ) / ( 4.0 * 3.141592653589793 ) ) / pow( max( 1.0 + g2 - cosT * 2.0 * g, 1e-4 ), 1.5 );
	}
	float surfFoamHash11( float x ) { return fract( sin( x * 91.7 + 17.3 ) * 43758.5453 ); }
	// Lace distance (0 on a bubble strand .. 1 in a hole) at pattern coordinates q (m), carried by flow (m/s
	// in the same coordinates) with a dual-phase flow map. salt decorrelates layers.
	vec4 surfFoamFlowLace( vec2 q, vec2 flow, float salt ) {
		float t = uOceanTime / ${ f( PERIOD ) };
		vec2 v = clamp( flow, vec2( - ${ f( MAX_FLOW ) } ), vec2( ${ f( MAX_FLOW ) } ) ) * ${ f( PERIOD ) };
		vec4 o = vec4( 0.0 );
		for ( int k = 0; k < 2; k ++ ) {
			float tk = t + ( float( k ) * 0.5 + salt * 0.37 );
			float ph = fract( tk );
			float cycle = floor( tk ) + ( float( k ) * 13.1 + salt * 5.7 );
			vec2 jitter = vec2( surfFoamHash11( cycle ), surfFoamHash11( cycle + 0.5 ) ) * 7.0;
			vec2 p = ( q - v * ( ph - 0.5 ) ) / ${ f( LACE_TILE ) } + jitter;
			float w = 1.0 - abs( ph * 2.0 - 1.0 );
			o += texture( uPatterns, vec3( p, 1.0 ) ) * w;
		}
		return o; // the two weights always add up to 1
	}
	float surfFoamBigAt( vec2 qq, vec2 pflow ) { return sqrt( surfFoamFlowLace( qq / 6.0, pflow / 6.0, 2.0 ).x ); }
	// coverage: total foam amount (0..1, all sources); foam: the default (offshore whitecap) foam; footprint:
	// pixel size on the surface (m); depth: sea depth; bubbles: fine bubble detail; normal: surface normal;
	// fresh: whitewater made by the breaking wave right here (roller, plunge point, swash front); sim: foam
	// carried by the water (ShoreSim, already kept off the clear face of plunging waves); simState:
	// shoreSimSample() at this pixel; roller: relief of the whitewater roller (m)
	SurfFoamInfo surfFoamShading( SurfFoamArgs a ) {
		// world position of the fragment (the pattern is in world space)
		vec3 P = all( equal( a.P, vec3( 0.0 ) ) ) ? vec3( a.lagXZ.x, uWaterLevel, a.lagXZ.y ) : a.P;
		vec2 xz = P.xz;
		float coverage = a.coverage;
		float opacity = a.foam;
		float density = clamp( coverage, 0.0, 1.0 );
		float height = 0.0;
		float wwOut = 0.0; // how much of it is whitewater (deeper crevices)
		float wwRelief = 0.0; // relief of the whitewater (m)
		float wwShadow = 1.0; // sun visibility inside the churn
		float wwCav = 1.0; // sky visibility in its crevices
		float reliefPat = 0.0; float reliefK = 0.0;
		float thinPat = 0.0; float thinK = 0.0;
		float bubPat = 0.0; float bubK = 0.0;
		// surf look near the beach, the default whitecap look offshore
		float surf = smoothstep( 7.0, 3.0, a.depth ) * shoreSimInside( shoreSimUvOf( xz ) );
		if ( surf > 0.0 && coverage > 0.04 ) {
			// flow of the water here, from the shore simulation (along the local wave direction)
			vec2 dir = shoreDirAt( xz ).xy;
			float speed = a.simState.w;
			vec2 flow = dir * speed;
			// --- pattern: world-space lace carried by the flow; on steep faces a vertical projection (along
			// the crest x height) rolling down the face with the roller (from the normal of the wave itself)
			float steep = smoothstep( 0.82, 0.5, a.baseNormal.y );
			float ww = clamp( a.fresh * 1.4, 0.0, 1.0 );
			// far pixels (a lace cell under a few pixels) only use the pattern's average: skip the lookups
			bool farOnly = a.footprint >= 0.12;
			vec4 flat_ = vec4( 0.5 );
			if ( ! farOnly ) flat_ = surfFoamFlowLace( xz, flow, 0.0 );
			vec4 lace = flat_;
			// lumps of tumbling whitewater (~0.6 m), only where there is whitewater
			float lumps = 0.5;
			vec2 tangent = vec2( - dir.y, dir.x );
			// (compressed vertically; the along-crest coordinate warped by low-frequency noise: the 3.5 m lace
			// tile must not repeat as a row of identical lumps and spikes along the break)
			float al = dot( xz, tangent );
			vec2 qv = vec2( al + sin( al * 0.19 + 0.8 ) * 2.1 + sin( al * 0.47 + 2.9 ) * 0.6 + sin( P.y * 1.7 + al * 0.11 ) * 0.5, P.y * 1.1 );
			if ( steep > 0.01 && ! farOnly ) {
				vec4 vert = surfFoamFlowLace( qv, vec2( 0.0, -0.9 ), 1.0 );
				lace = mix( flat_, vert, steep );
			}
			// Churning whitewater is a pile of foam lumps at several scales: a relief (m) for the normals,
			// sunlit caps and self-shadowed crevices (a short march toward the sun through the lump field)
			if ( ww > 0.02 && ! farOnly ) {
				vec3 L = uSunDir;
				vec2 pq = mix( xz, qv, steep );
				vec2 pflow = mix( flow, vec2( 0.0, -0.9 ), steep );
				float big = surfFoamBigAt( pq, pflow );
				float mid = sqrt( surfFoamFlowLace( pq / 2.2, pflow / 2.2, 3.0 ).x );
				lumps = big * 0.6 + mid * 0.4;
				float A = 0.22; // relief of the lumps (m)
				reliefPat = big * A + mid * ( A * 0.45 ) + ( 1.0 - lace.x ) * ( A * 0.12 );
				wwRelief = reliefPat * ww;
				// the sun direction in the pattern's coordinates, and its elevation above the local surface
				vec2 Lp = mix( L.xz, vec2( dot( L.xz, tangent ), L.y * 1.1 ), steep );
				vec2 Ld = Lp / max( length( Lp ), 1e-3 );
				float NdL = dot( a.normal, L );
				float tanE = NdL / max( length( L - a.normal * NdL ), 0.05 );
				float occ = 0.0;
				float steps[ 3 ] = float[ 3 ]( 0.14, 0.34, 0.7 );
				for ( int i = 0; i < 3; i ++ ) {
					float d = steps[ i ];
					float hk = surfFoamBigAt( pq + Ld * d, pflow );
					occ = max( occ, smoothstep( 0.0, 0.05, ( hk - big ) * A - tanE * d ) );
				}
				wwShadow = 1.0 - occ * mix( 0.85, 0.7, steep );
				// crevices between the lumps: occluded from the sky too
				wwCav = mix( 0.5, 1.0, smoothstep( 0.05, 0.75, lumps ) );
			}
			// --- whitewater: the aerated mass of a roller / plunge / swash front. Dense and opaque, its surface
			// boiling; it only tears (and shows water through) at its edges.
			float boil = lace.x * 0.7 + lace.z * 0.3;
			// (the edge of the churn is torn by its lumps: ragged fingers, not a clean boundary)
			float wwEdge = smoothstep( 0.25, 0.75, ww * 1.35 - boil * 0.3 - ( 1.0 - lumps ) * 0.5 );
			float whitewater = ( ww * 0.25 + wwEdge * 0.75 ) * ( ( 1.0 - boil ) * 0.12 + 0.88 );
			// --- foam carried by the water: a lacy web of bubble strands and clusters around holes. With more
			// foam the strands widen into a mat; as it spreads and thins it tears into filaments.
			// (w: strand half-width; the pattern covers 6% of the area at w = 0.1, 34% at 0.3, 82% at 0.6)
			float c = clamp( ( a.sim + max( coverage - a.sim - a.fresh, 0.0 ) * 0.5 - 0.05 ) / 0.95, 0.0, 1.0 );
			// hole edges are ragged (bubble clusters), hole sizes vary between patches
			float w = max( pow( c, 1.4 ) * 0.9 * ( lace.z * 0.5 + 0.75 ) + ( lace.y - 0.5 ) * 0.06, 0.0 );
			float soft = 0.05 + a.footprint * 4.5;
			float mat = ( 1.0 - smoothstep( w - soft, w + soft, lace.x ) ) * smoothstep( 0.0, 0.05, c );
			// scattered bubbles in the holes next to the strands
			float bub = lace.y * smoothstep( w + 0.25, w, lace.x ) * smoothstep( 0.02, 0.2, c ) * 0.5;
			// thin foam is translucent and uneven, thick foam is opaque
			float inner = clamp( ( w - lace.x ) / 0.25, 0.0, 1.0 );
			float laceFoam = max( mat * clamp( inner * 0.35 + 0.45 + lace.z * 0.3, 0.0, 1.0 ), bub );
			// once a lace cell (~0.2 m) covers a few pixels, use the average of the pattern
			float far = smoothstep( 0.03, 0.12, a.footprint );
			float average = max( clamp( pow( w, 1.45 ) * 1.9, 0.0, 1.0 ) * 0.8, ww * 0.95 );
			float near = max( laceFoam, whitewater );
			opacity = mix( a.foam, mix( near, average, far ), surf );
			// optical thickness (thin foam is translucent, thick foam scatters like snow) and a relief height for
			// the lighting: lumpy boiling whitewater, thick foam higher than its thin edges
			density = max( clamp( c * 1.3, 0.0, 1.0 ) * ( inner * 0.5 + 0.5 ), ww );
			float reliefThin = inner * clamp( c * 1.5, 0.0, 1.0 );
			float relief = reliefThin * ( 1.0 - ww );
			wwOut = ww * ( 1.0 - far * 0.6 );
			// far away the lumps average out: a mean shadowing of the churn instead
			wwShadow = mix( wwShadow, 0.82, far );
			wwCav = mix( wwCav, 0.8, far );
			wwRelief *= 1.0 - far;
			height = ( relief + a.bubbles * 0.15 ) * surf * ( 1.0 - far );
			reliefK = ww * ( 1.0 - far );
			thinPat = reliefThin;
			thinK = ( 1.0 - ww ) * surf * ( 1.0 - far );
			bubPat = a.bubbles * 0.15;
			bubK = surf * ( 1.0 - far );
		}
		SurfFoamInfo o;
		o.foam = opacity; o.density = density; o.height = height; o.surf = surf; o.ww = wwOut; o.relief = wwRelief;
		o.selfShadow = wwShadow; o.cavity = wwCav; o.reliefPat = reliefPat; o.reliefK = reliefK; o.thinPat = thinPat; o.thinK = thinK;
		o.bubPat = bubPat; o.bubK = bubK;
		return o;
	}
	// Foam radiance: a dense scatterer, wrapped diffuse sun (light diffuses through the bubbles), sky ambient,
	// darker in the dips of the bubbly relief, glowing at thin edges when backlit
	vec3 surfFoamLight( SurfFoamInfo info, vec3 N, vec3 L, vec3 V, vec3 sun, vec3 P ) {
		float ww = info.ww;
		float cavity = info.cavity;
		// relief normal from the screen-space gradient of the height (Mikkelsen surface gradient): the thin-foam
		// relief (in units of ~3 cm) plus the whitewater lumps (m); gradients of the world-space patterns only,
		// scaled by their weights
		float kb = ${ f( BUMP * 0.04 ) };
		vec3 dpx = dFdx( P );
		vec3 dpy = dFdy( P );
		float dhdx = dFdx( info.reliefPat ) * info.reliefK + ( dFdx( info.thinPat ) * info.thinK + dFdx( info.bubPat ) * info.bubK ) * kb;
		float dhdy = dFdy( info.reliefPat ) * info.reliefK + ( dFdy( info.thinPat ) * info.thinK + dFdy( info.bubPat ) * info.bubK ) * kb;
		vec3 r1 = cross( dpy, N );
		vec3 r2 = cross( N, dpx );
		float det = dot( dpx, r1 );
		vec3 grad = ( r1 * dhdx + r2 * dhdy ) * sign( det );
		vec3 Nf = normalize( N * abs( det ) - grad + N * 1e-6 );
		float NdL = dot( Nf, L );
		// foam lets light diffuse into it (wrapped lighting); churning whitewater much less so: its sides facing
		// away from the sun are shaded grey-blue by the sky, its caps sunlit, its crevices in the shadow of the
		// lumps around them
		float wrap = mix( 0.45, 0.12, ww );
		float diff = clamp( NdL * ( 1.0 - wrap ) + wrap, 0.0, 1.0 ) * mix( 1.0, info.selfShadow, ww );
		// dips between the lumps are shaded by the lumps around them (sky occlusion)
		float ao = mix( mix( 1.0, info.height * 0.3 + 0.76, info.surf ), cavity, ww );
		// light through thin aerated water (torn edges, thin foam, spray-soaked lips): green-white, strongly
		// forward scattered
		float thin = ( 1.0 - info.density ) * 0.8 + ww * ( 1.0 - cavity ) * 0.3;
		float trans = surfFoamPhaseHG( dot( - V, L ), 0.55 ) * thin * 1.3;
		vec3 transCol = mix( vec3( 1.0 ), vec3( 0.6, 0.92, 0.82 ), ww * 0.7 + 0.3 );
		// light bounced around inside the churn (from its sunlit lumps) keeps the shaded foam from going as dark
		// and as blue as the open sky alone would make it
		vec3 sky = uSkyIrr;
		vec3 skyGrey = vec3( dot( sky, vec3( 0.2126, 0.7152, 0.0722 ) ) );
		vec3 amb = mix( sky, skyGrey, ww * 0.35 ) * ao + sun * ( ww * 0.05 ) * ao;
		return ( sun * ( diff * mix( 1.0, sqrt( cavity ), ww ) / 3.141592653589793 + transCol * trans ) + amb ) * 0.86;
	}
`;
