// Camera-following ground flora: tall meadow grass (knee to waist high), dune grass, sea oats and beach
// creeper (pōhuehue). Ported from Tidewater src/world/vegetation/GrassField.js (MIT, see
// LICENSE-Tidewater.txt): the same cells, clumps, blades, tiers, radii, fades, colours and wind, with the
// WGSL translated to GLSL on MeshStandardMaterial (patchMaterial).
//
// The world is divided into CELL x CELL metre cells. Every visible cell near the camera draws one
// instance of a "patch": a fixed blue-noise set of clump slots. In the vertex shader each slot is placed
// at cellOrigin + slot offset, its height and vertex data come from the ground data (GroundData.js: the
// terrain mesh's own triangles) and its presence / size from the RGBA density mask (R dune grass, G meadow
// grass, B sea oats, A creeper, scatter.js groundData). Empty cells are skipped on the CPU and cells are
// frustum culled.
//
// Three levels share the same clumps and blades (identical parameters), so switching a cell between them
// never moves a blade:
//   near (< R_NEAR): every blade, 3 segments        mid (< R_MID): tiers 0-1, 2 segments
//   far (< R_FAR): tier 0, one triangle per blade
// Every blade has a tier; tier 2 blades fade out (narrow to nothing) before R_NEAR, tier 1 before R_MID,
// and tier 0 thins out (random per-blade cut-off) towards R_FAR where the terrain's meadow shading takes
// over. The remaining blades widen as the others fade, so the grass covers the ground equally at every
// distance (constant blade density x width).
//
// Quality (ours): the radii and fades scale per level (setQuality), and lower qualities draw a prefix of
// the clumps (any prefix of the blue noise is well distributed) with wider blades.
import * as THREE from 'three';
import { G, patchMaterial } from '../../render/Materials.js';
import { TERRAIN_MEADOW_GLSL } from '../terrain/TerrainShading.js';
import { mulberry32 } from './GeoBuilder.js';
import { VG, HEX } from './VegMaterial.js';
import { GROUND_GLSL } from './GroundData.js';

export const CELL = 8;
export const R_NEAR = 18;
export const R_MID = 46;
export const R_FAR = 88;
export const FADE_T2 = [ 11, 17 ];
export const FADE_T1 = [ 36, 45 ];
export const FADE_T0 = [ 62, 87 ]; // tier 0 blades drop out at random distances in this range
const MAX_NEAR = 96;
const MAX_MID = 260;
const MAX_FAR = 640;
const CLUMPS = 384; // meadow / dune clump slots per cell (6 per m^2)
const BLADES = 7; // per clump
const BLADE_TIER = [ 0, 0, 1, 1, 2, 2, 2 ];
// blades per clump in each tier (coverage compensation)
const TIER_N = [ 2, 2, 3 ];
const OATS = 12; // sea oat slots per cell
const VINES = 28; // creeper slots per cell

const KIND = { GRASS: 0, OAT_STALK: 1, OAT_HEAD: 2, CREEPER: 3, FLOWER: 4 };

// Mitchell's best-candidate blue noise on a torus; any prefix is also well distributed.
function blueNoise( rand, n, size, k = 10 ) {
	const pts = [];
	for ( let i = 0; i < n; i ++ ) {
		let best = null, bestD = - 1;
		for ( let c = 0; c < ( i === 0 ? 1 : k ); c ++ ) {
			const x = rand() * size, z = rand() * size;
			let dmin = Infinity;
			for ( const p of pts ) {
				let dx = Math.abs( p[ 0 ] - x ), dz = Math.abs( p[ 1 ] - z );
				dx = Math.min( dx, size - dx );
				dz = Math.min( dz, size - dz );
				dmin = Math.min( dmin, dx * dx + dz * dz );
			}
			if ( dmin > bestD ) { bestD = dmin; best = [ x, z ]; }
		}
		pts.push( best );
	}
	return pts;
}

class PatchBuilder {
	constructor() {
		this.pos = []; this.nor = []; this.side = []; this.slot = []; this.bladeData = []; this.idx = [];
	}

	get count() { return this.pos.length / 3; }

	// side: xyz offset direction * half width, w: across coordinate (-1 left edge, 1 right, 0 tip)
	v( p, n, side, slot, blade ) {
		this.pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		this.nor.push( n[ 0 ], n[ 1 ], n[ 2 ] );
		this.side.push( side[ 0 ], side[ 1 ], side[ 2 ], side[ 3 ] ?? 0 );
		this.slot.push( slot[ 0 ], slot[ 1 ], slot[ 2 ], slot[ 3 ] );
		this.bladeData.push( blade[ 0 ], blade[ 1 ], blade[ 2 ], blade[ 3 ] );
		return this.count - 1;
	}

	// blade: centre-line points with half widths; tip row has zero width (single vertex).
	// w4: aBlade.w (grass: tier)
	blade( slot, kind, rows, width, dirX, dirZ, lean, height, curve, rnd, base = [ 0, 0 ], w4 = 0 ) {
		const sx = - dirZ, sz = dirX; // horizontal side direction
		const ids = [];
		for ( let r = 0; r < rows.length; r ++ ) {
			const h = rows[ r ];
			const out = ( Math.sin( lean ) * h + curve * h * h ) * height;
			const up = ( Math.cos( lean ) * h - curve * 0.35 * h * h ) * height;
			const p = [ base[ 0 ] + dirX * out, up, base[ 1 ] + dirZ * out ];
			// tangent for the normal
			const dOut = Math.sin( lean ) + 2 * curve * h, dUp = Math.cos( lean ) - 0.7 * curve * h;
			const tl = Math.hypot( dOut, dUp );
			const tx = dirX * dOut / tl, ty = dUp / tl, tz = dirZ * dOut / tl;
			// normal = side x tangent
			const nx = - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty;
			const nl = Math.hypot( nx, ny, nz ) || 1;
			const n = [ nx / nl, ny / nl, nz / nl ];
			const hw = width * ( 1 - Math.pow( h, 1.6 ) ) * ( 0.75 + 0.25 * ( 1 - h ) );
			const blade = [ h, kind, rnd, w4 ];
			if ( r === rows.length - 1 ) ids.push( [ this.v( p, n, [ 0, 0, 0, 0 ], slot, blade ) ] );
			else ids.push( [ this.v( p, n, [ - sx * hw, 0, - sz * hw, - 1 ], slot, blade ), this.v( p, n, [ sx * hw, 0, sz * hw, 1 ], slot, blade ) ] );
		}
		for ( let r = 0; r < ids.length - 1; r ++ ) {
			const a = ids[ r ], b = ids[ r + 1 ];
			if ( b.length === 1 ) this.idx.push( a[ 0 ], a[ 1 ], b[ 0 ] );
			else this.idx.push( a[ 0 ], a[ 1 ], b[ 1 ], a[ 0 ], b[ 1 ], b[ 0 ] );
		}
	}

	// small leaf / flower lying on the ground: triangle fan around a centre point.
	// outline(a) gives the radius factor for angle a (0 = pointing along dir).
	fan( slot, kind, center, radius, dirX, dirZ, tilt, sides, outline, rnd, lift, hf = 0.1 ) {
		const c = this.v( [ center[ 0 ], lift, center[ 1 ] ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf, kind, rnd, 1 ] );
		const ring = [];
		for ( let i = 0; i < sides; i ++ ) {
			const a = ( i / sides ) * Math.PI * 2;
			const r = radius * outline( a );
			const lx = Math.cos( a ) * r, lz = Math.sin( a ) * r * 0.85;
			const x = center[ 0 ] + lx * dirX - lz * dirZ;
			const z = center[ 1 ] + lx * dirZ + lz * dirX;
			const along = lx / radius;
			const y = lift + ( along + 0.6 ) * radius * tilt;
			ring.push( this.v( [ x, y, z ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf + 0.05 * Math.max( 0, along ), kind, rnd, 0 ] ) );
		}
		for ( let i = 0; i < sides; i ++ ) this.idx.push( c, ring[ ( i + 1 ) % sides ], ring[ i ] );
	}

	// thin ribbon lying on the ground (creeper runner)
	ribbon( slot, kind, pts, width, rnd ) {
		const ids = [];
		for ( let i = 0; i < pts.length; i ++ ) {
			const p = pts[ i ], q = pts[ Math.min( pts.length - 1, i + 1 ) ], o = pts[ Math.max( 0, i - 1 ) ];
			let dx = q[ 0 ] - o[ 0 ], dz = q[ 2 ] - o[ 2 ];
			const l = Math.hypot( dx, dz ) || 1;
			dx /= l; dz /= l;
			const sx = - dz * width, sz = dx * width;
			ids.push( [
				this.v( [ p[ 0 ] - sx, p[ 1 ], p[ 2 ] - sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
				this.v( [ p[ 0 ] + sx, p[ 1 ], p[ 2 ] + sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
			] );
		}
		for ( let i = 0; i < ids.length - 1; i ++ ) {
			const a = ids[ i ], b = ids[ i + 1 ];
			this.idx.push( a[ 0 ], b[ 1 ], a[ 1 ], a[ 0 ], b[ 0 ], b[ 1 ] );
		}
	}

	build() {
		const g = new THREE.InstancedBufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'aSide', new THREE.Float32BufferAttribute( this.side, 4 ) );
		g.setAttribute( 'aSlot', new THREE.Float32BufferAttribute( this.slot, 4 ) );
		g.setAttribute( 'aBlade', new THREE.Float32BufferAttribute( this.bladeData, 4 ) );
		g.setIndex( this.count > 65535 ? new THREE.Uint32BufferAttribute( this.idx, 1 ) : new THREE.Uint16BufferAttribute( this.idx, 1 ) );
		g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		g.boundingBox = new THREE.Box3( new THREE.Vector3( - 1e7, - 1e7, - 1e7 ), new THREE.Vector3( 1e7, 1e7, 1e7 ) );
		return g;
	}

	get triangles() { return this.idx.length / 3; }
}

// Clump / blade parameters shared by all levels (same seeds -> identical blades).
function clumpParams( seed ) {
	const rand = mulberry32( seed );
	const slots = blueNoise( mulberry32( seed + 1 ), CLUMPS, CELL );
	return slots.map( ( [ x, z ] ) => {
		const slotRand = rand();
		const az0 = rand() * Math.PI * 2;
		const blades = [];
		for ( let k = 0; k < BLADES; k ++ ) {
			// golden-angle azimuths: any prefix of the blades spreads around the clump; the first
			// two (kept at every distance) lean away from each other
			const az = az0 + k * 2.39996 + ( rand() - 0.5 ) * 0.5;
			const outer = k === 0 ? 0.1 + 0.3 * rand() : k === 1 ? 0.35 + 0.4 * rand() : rand();
			blades.push( {
				dx: Math.cos( az ), dz: Math.sin( az ),
				lean: 0.06 + 0.55 * outer * ( 0.6 + 0.8 * rand() ),
				h: ( 0.7 + 0.5 * rand() ) * ( 1.06 - 0.22 * outer ),
				curve: 0.12 + 0.5 * outer * ( 0.5 + rand() ),
				rnd: rand(),
				base: [ Math.cos( az ) * 0.09 * rand(), Math.sin( az ) * 0.09 * rand() ],
				tier: BLADE_TIER[ k ],
			} );
		}
		return { x, z, slotRand, blades };
	} );
}

// level: 0 near, 1 mid, 2 far. (Ours: the sea oats and creeper come first and the clumps last, so a
// prefix of the index buffer (quality) keeps them all and a well spread share of the clumps.)
// Returns the builder and the index count after each clump.
function buildPatch( level, clumps, seed = 7 ) {
	const b = new PatchBuilder();
	const rows = [ [ 0, 0.3, 0.62, 1 ], [ 0, 0.55, 1 ], [ 0, 1 ] ][ level ];
	const maxTier = 2 - level;
	const near = level === 0;

	if ( level < 2 ) {
		// sea oats (tier 1: fade out before the far level) and, near only, beach creeper. Every slot
		// has its own random stream, so the near and mid versions of a plant are identical.
		const oatSlots = blueNoise( mulberry32( seed + 2 ), OATS, CELL );
		oatSlots.forEach( ( [ x, z ], si ) => {
			const rand = mulberry32( seed * 7919 + si * 131 + 17 );
			const slot = [ x, z, rand(), 1 ];
			const stalks = near ? 3 : 1;
			for ( let q = 0; q < 3; q ++ ) {
				const az = rand() * Math.PI * 2;
				const dx = Math.cos( az ), dz = Math.sin( az );
				const lean = 0.06 + 0.14 * rand();
				const hq = 0.8 + 0.3 * rand();
				const rnd = rand();
				const bx = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22, bz = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22;
				const hs = [ rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand() ];
				if ( q >= stalks ) continue;
				const qTier = q === 0 ? 0 : 2;
				// stalk (unit height, scaled in the shader)
				b.blade( slot, KIND.OAT_STALK, near ? [ 0, 0.3, 0.6, 0.85, 1 ] : [ 0, 0.6, 1 ], near ? 0.0075 : 0.014, dx, dz, lean, hq, 0.2, rnd, [ bx, bz ], qTier );
				// drooping panicle: flat spikelets hanging off the upper stalk
				const heads = near ? 8 : 3;
				for ( let k = 0; k < heads; k ++ ) {
					const hf = 0.7 + 0.3 * ( k / Math.max( 1, heads - 1 ) );
					const out = ( Math.sin( lean ) * hf + 0.2 * hf * hf ) * hq;
					const up = ( Math.cos( lean ) * hf - 0.07 * hf * hf ) * hq;
					const sa = az + ( k % 2 ? 1 : - 1 ) * ( 0.45 + 0.6 * hs[ k ] );
					const sdx = Math.cos( sa ), sdz = Math.sin( sa );
					const cx = bx + dx * out + sdx * 0.02, cz = bz + dz * out + sdz * 0.02;
					const L = near ? 0.085 : 0.13, W = near ? 0.022 : 0.04;
					const n = [ 0, 1, 0 ];
					const slotB = [ hf, KIND.OAT_HEAD, rnd, qTier ];
					const a = b.v( [ cx, up + 0.01, cz ], n, [ 0, 0, 0, 0 ], slot, slotB );
					const l = b.v( [ cx + sdx * L * 0.45 - sdz * W, up - L * 0.4, cz + sdz * L * 0.45 + sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
					const r = b.v( [ cx + sdx * L * 0.45 + sdz * W, up - L * 0.4, cz + sdz * L * 0.45 - sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
					const t = b.v( [ cx + sdx * L * 0.8, up - L * 0.95, cz + sdz * L * 0.8 ], n, [ 0, 0, 0, 0 ], slot, slotB );
					b.idx.push( a, l, t, a, t, r );
				}
			}
			if ( near ) {
				for ( let k = 0; k < 4; k ++ ) {
					const la = ( k / 4 ) * Math.PI * 2 + rand();
					b.blade( slot, KIND.GRASS, [ 0, 0.45, 0.8, 1 ], 0.01, Math.cos( la ), Math.sin( la ), 0.55 + 0.4 * rand(), 0.45, 0.35, rand(), [ 0, 0 ], 2 );
				}
			}
		} );
	}

	if ( near ) {
		// beach creeper (railroad vine): a runner crawling over the sand with notched leaves
		const notched = ( a ) => {
			const d = Math.min( Math.abs( a ), Math.abs( a - Math.PI * 2 ) );
			return 1 - 0.38 * Math.exp( - ( d * d ) / 0.12 ) - 0.15 * Math.pow( Math.sin( a * 0.5 ), 8 );
		};
		const petals = ( a ) => 0.82 + 0.18 * Math.cos( a * 5 );
		const vineSlots = blueNoise( mulberry32( seed + 3 ), VINES, CELL );
		vineSlots.forEach( ( [ x, z ], si ) => {
			const rand = mulberry32( seed * 3571 + si * 197 + 5 );
			const slot = [ x, z, rand(), 2 ];
			let az = rand() * Math.PI * 2;
			const pts = [];
			const n = 12;
			let px = - Math.cos( az ) * 1.1, pz = - Math.sin( az ) * 1.1;
			for ( let i = 0; i < n; i ++ ) {
				pts.push( [ px, 0.01, pz ] );
				az += ( rand() - 0.5 ) * 0.5;
				px += Math.cos( az ) * 0.19;
				pz += Math.sin( az ) * 0.19;
			}
			b.ribbon( slot, KIND.CREEPER, pts, 0.011, rand() );
			for ( let i = 1; i < pts.length; i ++ ) {
				const side = i % 2 ? 1 : - 1;
				const p0 = pts[ i - 1 ], p1 = pts[ i ];
				let dx = p1[ 0 ] - p0[ 0 ], dz = p1[ 2 ] - p0[ 2 ];
				const l = Math.hypot( dx, dz ) || 1;
				dx /= l; dz /= l;
				// leaves stand on short petioles, angled forward off the runner, tilted up
				const la = Math.atan2( dz, dx ) + side * ( 0.7 + 0.5 * rand() );
				const ldx = Math.cos( la ), ldz = Math.sin( la );
				const r = ( 0.07 + 0.04 * rand() ) * ( 0.6 + 0.4 * Math.sin( Math.PI * i / n ) );
				b.fan( slot, KIND.CREEPER, [ p1[ 0 ] + ldx * r * 0.9, p1[ 2 ] + ldz * r * 0.9 ], r, ldx, ldz, 0.3 + 0.3 * rand(), 7, notched, rand(), 0.015 );
			}
			const fp = pts[ 3 + Math.floor( rand() * 4 ) ];
			b.fan( slot, KIND.FLOWER, [ fp[ 0 ] + 0.03, fp[ 2 ] + 0.03 ], 0.036, 1, 0, 1.4, 10, petals, rand(), 0.07, 0.2 );
		} );
	}

	const clumpEnd = [];
	for ( const c of clumps ) {
		const slot = [ c.x, c.z, c.slotRand, 0 ];
		for ( const bl of c.blades ) {
			if ( bl.tier > maxTier ) continue;
			b.blade( slot, KIND.GRASS, rows, 0.012, bl.dx, bl.dz, bl.lean, bl.h, bl.curve, bl.rnd, bl.base, bl.tier );
		}
		clumpEnd.push( b.idx.length );
	}
	return { b, clumpEnd };
}

// ------------------------------------------------------------------------------------------ GLSL

const f = ( x ) => { const s = String( x ); return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0'; };

const VERT_PARS = /* glsl */`
	attribute vec4 iCell; attribute vec4 aSlot; attribute vec4 aBlade; attribute vec4 aSide;
	uniform float uTime; uniform vec2 uWind;
	uniform float uWindStr; uniform vec4 uGustOff; uniform sampler2D tDetail; uniform float uDetailOn; uniform vec3 uPlayer;
	uniform vec3 uGroundOrigin; uniform vec2 uGroundCam;
	uniform vec4 uGrassFade; // tier 2 fade (xy), tier 1 fade (zw), m
	uniform vec4 uGrassFade0; // tier 0 cut-off range (xy), blade width factor (z), -
	${ GROUND_GLSL }
	${ TERRAIN_MEADOW_GLSL }
	varying vec4 vVegGrass; // hf, kind, dune fraction, rand
	varying vec4 vVegGrassTone; // meadow tone (shared with the terrain), dryness
	varying vec4 vVegGrass2; // density, leaf / flower centre flag, across, dry blade
	varying float vVegGust; // current gust bend (wind sheen)

	// Dave Hoskins' sine-free hash, [0, 1), and value noise (Tidewater VegNodes.js)
	float vegHash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
	float vegNoise( vec2 p ) {
		vec2 i = floor( p ), fr = fract( p ); vec2 u = fr * fr * ( 3.0 - 2.0 * fr );
		return mix( mix( vegHash12( i ), vegHash12( i + vec2( 1, 0 ) ), u.x ), mix( vegHash12( i + vec2( 0, 1 ) ), vegHash12( i + vec2( 1, 1 ) ), u.x ), u.y );
	}
	float vegDet( vec2 uv ) { return uDetailOn > 0.5 ? textureLod( tDetail, uv, 0.0 ).w : 0.5; }
	vec2 vegRot2( vec2 v, float a ) { float c = cos( a ), s = sin( a ); return vec2( c * v.x - s * v.y, s * v.x + c * v.y ); }
	// travelling gust field in [0, 1] (Tidewater vegGustAt: the detail texture's fbm at 140 m and 61 m,
	// offset by the CPU-integrated gust drift; the terrain's wind sheen uses the same field)
	float vegGustAt( vec2 xz ) {
		if ( uDetailOn < 0.5 ) return 0.5;
		float n = textureLod( tDetail, uGustOff.xy + xz / 140.0, 0.0 ).w * 0.62 + textureLod( tDetail, uGustOff.zw + xz / 61.0 + 0.37, 0.0 ).w * 0.38;
		return smoothstep( 0.46, 0.6, n );
	}
	// per-tier visibility at camera distance d (1 = full width, 0 = gone); tier 0 thins out per blade
	float vegGrassTierFade( float tier, float d, float cut ) {
		float f2 = 1.0 - smoothstep( uGrassFade.x, uGrassFade.y, d );
		float f1 = 1.0 - smoothstep( uGrassFade.z, uGrassFade.w, d );
		float f0 = 1.0 - smoothstep( cut - 5.0, cut, d );
		return tier > 1.5 ? f2 : tier > 0.5 ? f1 : f0;
	}

	vec3 vegGrassP; vec3 vegGrassN;
	void vegGrassDeform() {
		vec2 slotXZ = aSlot.xy;
		vec2 rel = iCell.xy + slotXZ; // relative to the ground origin
		vec2 xz = iCell.zw + slotXZ; // world (hashes, noise and the detail texture)
		vec4 blade = aBlade;
		float hf = blade.x;
		float kind = blade.y;
		float bRnd = blade.z;
		vec4 m = groundGrass( rel );
		bool isGrass = kind < 0.5;
		bool isOat = kind > 0.5 && kind < 2.5;
		float lush = m.g;
		float dune = m.r;
		// the backshore grass is dense in its clumps (the mask carries the clumping and the edge)
		float duneF = dune / ( dune + lush + 1e-3 );
		float grassP = mix( lush, min( dune * 1.1, 1.0 ), duneF );
		float density = isGrass ? grassP : isOat ? m.b : m.a;
		float r = vegHash12( xz * 1.37 + 0.51 );
		float r2 = vegHash12( xz * 2.11 + 7.3 );
		float flowerOk = kind > 3.5 ? ( r2 < 0.35 ? 1.0 : 0.0 ) : 1.0;
		float present = ( r < density ? 1.0 : 0.0 ) * flowerOk;

		// ground under the clump (the terrain mesh's triangles) and its vertex data
		vec4 gd = groundAt( rel );
		// meadow tone at the clump: the same function and inputs as the terrain's meadow shading
		// (Terrain.js: TerrainMacro, the rainfall shift, slope, south exposure, the finer detail)
		float wetM = clamp( gd.y * 1.15 + 0.14, 0.0, 1.0 );
		float dryShift = ( 0.42 - wetM ) * 0.5;
		float mA = clamp( ( vegDet( vegRot2( xz, 0.7 ) / 173.0 ) + vegDet( vegRot2( xz, 2.9 ) / 131.0 + 0.61 ) - 1.0 ) * 0.7071 + 0.5, 0.0, 1.0 );
		float mB = clamp( ( vegDet( vegRot2( xz, 2.1 ) / 47.0 ) + vegDet( vegRot2( xz, 0.15 ) / 59.0 + 0.29 ) - 1.0 ) * 0.7071 + 0.5, 0.0, 1.0 );
		float det = vegDet( vegRot2( xz, 1.3 ) / 6.7 + 0.21 ) * 0.65 + vegDet( xz / 1.9 ) * 0.35;
		MeadowTone mt = terrainMeadowTone( mA + dryShift, mB + dryShift, gd.z, gd.w, det, true );
		// size: tall meadow grass, knee to waist high: swathes of taller grass in the lush patches,
		// lower where it is dry; wiry dune tufts
		float patchN = vegNoise( xz * ${ f( 1 / 6.5 ) } + 17.3 ) * 0.7 + vegNoise( xz * ${ f( 1 / 2.3 ) } ) * 0.3;
		float lushH = mix( 0.7, 1.3, patchN ) * ( mt.lush * 0.25 + 1.0 ) * ( 1.0 - mt.dry * 0.25 );
		// dune tufts vary a lot in size (young shoots to big old clumps)
		float grassH = mix( lushH, 0.62, duneF ) * mix( r2 * 0.35 + 0.83, r2 * r2 * 0.9 + 0.5, duneF ) * ( density * 0.35 + 0.65 );
		float oatH = r2 * 0.55 + 1.0;
		float vineS = r2 * 0.4 + 0.8;
		float hScale = isGrass ? grassH : isOat ? oatH : vineS;
		// meadow clumps fan out wider than the wiry dune tufts
		float spread = isGrass ? mix( 1.35, 1.3, duneF ) : 1.0;

		// distance LOD: tiers fade out (narrow to nothing), the remaining blades widen so the coverage
		// (blade density x width) stays constant; tier 0 thins out per blade near the far radius
		float dist = length( rel - uGroundCam );
		// tier: grass blades and oats carry their own (aBlade.w), otherwise the slot's
		float tier = max( kind < 2.5 ? blade.w : 0.0, aSlot.w );
		float cutK = bRnd * 7.13 + r2;
		float cut = mix( uGrassFade0.x + 5.0, uGrassFade0.y, cutK - floor( cutK ) );
		float own = vegGrassTierFade( tier, dist, cut );
		float f2 = 1.0 - smoothstep( uGrassFade.x, uGrassFade.y, dist );
		float f1 = 1.0 - smoothstep( uGrassFade.z, uGrassFade.w, dist );
		float comp = ${ f( TIER_N[ 0 ] + TIER_N[ 1 ] + TIER_N[ 2 ] ) } / ( f2 * ${ f( TIER_N[ 2 ] ) } + f1 * ${ f( TIER_N[ 1 ] ) } + ${ f( TIER_N[ 0 ] ) } );
		// oats and creeper simply shrink out
		float widthK = isGrass ? comp * own * uGrassFade0.z : 1.0;
		float sizeK = isGrass ? 1.0 : own;
		float scale = hScale * present * sizeK;

		// per-slot random yaw
		float yaw = vegHash12( xz * 0.73 + 3.3 ) * 6.2832;
		float cy = cos( yaw ), sy = sin( yaw );
		vec3 base = vec3( rel.x, gd.x - 0.03, rel.y );
		vec3 P = position;
		vec3 pl = vec3( P.x * spread, P.y, P.z * spread );
		vec3 o0 = vec3( pl.x * cy - pl.z * sy, pl.y, pl.x * sy + pl.z * cy ) * scale;

		// wind: travelling gusts bend blades downwind (length preserving), plus flutter
		vec2 wd = normalize( uWind + vec2( 1e-4 ) );
		vec3 wd3 = vec3( wd.x, 0.0, wd.y ), wp3 = vec3( - wd.y, 0.0, wd.x );
		float w = uWindStr;
		float g = vegGustAt( xz );
		float tm = uTime;
		float ph = r * 6.2832;
		float bendAmt = w * ( g * 0.55 + 0.22 ) + sin( tm * 1.9 + ph + xz.x * 0.2 ) * w * 0.1;
		float flut = sin( tm * 7.3 + ph * 3.0 + bRnd * 20.0 ) * ( w * 0.06 + 0.015 );
		float stiff = isGrass ? 1.0 : isOat ? 0.8 : 0.08;
		float hf2 = hf * hf;
		float oL = length( o0 );
		vec3 disp = ( wd3 * ( bendAmt * hf2 * stiff ) + wp3 * ( flut * hf2 * stiff ) ) * ( oL + 1e-4 );
		vec3 ob = normalize( o0 + disp + vec3( 0.0, 1e-5, 0.0 ) ) * oL;
		// (ours) pushed aside around the player, bent down a little
		vec2 away = rel + ob.xz - ( uPlayer.xz - uGroundOrigin.xz );
		float dp = length( away );
		float push = ( 1.0 - smoothstep( 0.35, 1.3, dp ) ) * hf * step( abs( base.y - uPlayer.y ), 2.5 ) * stiff;
		ob.xz += away / max( dp, 0.05 ) * push * 0.35 * ob.y;
		ob.y *= 1.0 - push * 0.45;

		float wScale = isGrass ? mix( 1.5, 1.55, duneF ) : 1.0;
		float wide = wScale * widthK * min( scale * 2.0, max( scale, 0.5 ) );
		vec3 side = aSide.xyz;
		vec3 sideR = vec3( side.x * cy - side.z * sy, side.y, side.x * sy + side.z * cy );
		vegGrassP = base + ob + sideR * wide;

		// lighting normal: blade normal bent towards up (soft, grass-like shading), rounded across the
		// blade (a folded leaf is lit differently on its two halves)
		float across = aSide.w;
		vec3 sideDir = normalize( sideR + vec3( 1e-5, 0.0, 0.0 ) );
		vec3 N = normal;
		vec3 nR = vec3( N.x * cy - N.z * sy, N.y, N.x * sy + N.z * cy );
		vegGrassN = normalize( nR * 0.5 + vec3( 0.0, 1.0, 0.0 ) + sideDir * ( across * 0.35 ) );

		// a share of the blades is dead / straw coloured (more in the dry patches)
		float dk = bRnd * 13.7 + r * 3.1;
		float dryBlade = dk - floor( dk ) < mt.dry * 0.3 + 0.07 ? 1.0 : 0.0;
		vVegGrass = vec4( hf, kind, duneF, bRnd );
		vVegGrassTone = vec4( mt.tone, mt.dry );
		vVegGrass2 = vec4( density, kind < 2.5 ? 0.0 : blade.w, across, dryBlade );
		vVegGust = clamp( g * w * 0.6, 0.0, 1.0 ) * stiff;
	}
`;

const FRAG_PARS = /* glsl */`
	varying vec4 vVegGrass; varying vec4 vVegGrassTone; varying vec4 vVegGrass2; varying float vVegGust;
	${ TERRAIN_MEADOW_GLSL }
`;

const FRAG_COLOR = /* glsl */`
	float gHf = vVegGrass.x;
	float gKind = vVegGrass.y;
	float duneF = vVegGrass.z;
	float gRnd = vVegGrass.w;
	float across = vVegGrass2.z;
	float dryBlade = vVegGrass2.w;
	// self-shadowing of the sward: dark at the base of the clump
	float gAo = mix( 0.32, 1.0, smoothstep( 0.0, 0.75, gHf ) );
	// dune grass: olive base, straw tips; meadow: the terrain's meadow tone, dark and brownish (dead
	// leaf sheaths) at the base, lighter / sun-bleached towards the tips
	vec3 duneBase = mix( ${ HEX( 0x5d6232 ) }, ${ HEX( 0x7f8a40 ) }, gRnd );
	vec3 duneTip = mix( ${ HEX( 0xb8ab6c ) }, ${ HEX( 0x9aa452 ) }, gRnd );
	vec3 tone = vVegGrassTone.xyz * ( gRnd * 0.34 + 0.83 );
	vec3 lushBase = mix( tone * 0.5, MEADOW_soil, 0.3 );
	float tipDry = vVegGrassTone.w * 0.4 + smoothstep( 0.8, 1.0, gRnd ) * 0.35;
	vec3 lushTip = mix( tone * vec3( 1.25, 1.25, 1.05 ), MEADOW_straw, tipDry * smoothstep( 0.55, 1.0, gHf ) );
	vec3 gBase = mix( lushBase, duneBase, duneF );
	vec3 gTip = mix( lushTip, duneTip, duneF );
	vec3 grass0 = mix( gBase, gTip, smoothstep( 0.05, 0.95, gHf ) );
	// dead blades: straw to brown
	grass0 = mix( grass0, mix( MEADOW_straw, MEADOW_soil * 1.8, gRnd * 0.6 ) * ( smoothstep( 0.0, 0.5, gHf ) * 0.4 + 0.6 ), dryBlade * ( 1.0 - duneF ) );
	// pale midrib (the interpolated edge value can overshoot 1 by a rounding error: pow of a negative
	// base is NaN, a black pixel that the TAA resolve spreads into a block)
	grass0 *= pow( max( 1.0 - abs( across ), 0.0 ), 6.0 ) * smoothstep( 0.05, 0.4, gHf ) * 0.18 + 1.0;
	// wind sheen: blades flattened by a gust show their paler undersides, so gusts read as bright waves
	// rolling across the grass
	vec3 grass = mix( grass0, grass0 * vec3( 1.3, 1.28, 1.1 ) + vec3( 0.03, 0.03, 0.015 ), vVegGust * smoothstep( 0.15, 0.9, gHf ) * 0.6 );
	vec3 oatStalk = mix( ${ HEX( 0x9c9a62 ) }, ${ HEX( 0xc2b27a ) }, gHf );
	vec3 oatHead = mix( ${ HEX( 0xc9b27a ) }, ${ HEX( 0xa8905a ) }, gRnd );
	float centre = vVegGrass2.y; // 1 at leaf / flower centre
	vec3 vine = mix( mix( ${ HEX( 0x2e5219 ) }, ${ HEX( 0x4a7328 ) }, gRnd ), ${ HEX( 0x7a8f4a ) }, centre * 0.3 ) * ( gHf < 0.075 ? vec3( 1.25, 1.05, 0.8 ) : vec3( 1.0 ) );
	vec3 flower = mix( ${ HEX( 0xb8479c ) }, ${ HEX( 0xf2e8ee ) }, smoothstep( 0.35, 0.9, centre ) );
	vec3 gC = gKind < 0.5 ? grass : gKind < 1.5 ? oatStalk : gKind < 2.5 ? oatHead : gKind < 3.5 ? vine : flower;
	diffuseColor.rgb = gC * ( gKind < 2.5 ? gAo : 1.0 );
	float gRough = gKind > 2.5 && gKind < 3.5 ? 0.45 : 0.8;
`;

const FRAG_NORMAL = /* glsl */`
	// (unflipped geometric normal) bent towards the viewer
	normal = normalize( normalize( vNormal ) + normalize( vViewPosition ) * 0.4 );
`;

// specular intensity 0.4 (F0 and F90 scaled, as MeshPhysicalMaterial's specularIntensity)
const FRAG_SPECULAR = /* glsl */`
	material.specularColor *= 0.4;
	material.specularColorBlended *= 0.4;
	material.specularF90 = 0.4;
`;

// back-lit thin blades glow (with the shadowed light colour of the light loop: grass in shadow does not)
const FRAG_TRANSLUCENT = /* glsl */`
	#if NUM_DIR_LIGHTS > 0
	{
		float back = pow( clamp( dot( - geometryViewDir, directLight.direction ), 0.0, 1.0 ), 4.0 );
		reflectedLight.directDiffuse += diffuseColor.rgb * vec3( 1.1, 1.3, 0.6 ) * directLight.color * ( back * 0.3 * smoothstep( 0.2, 1.0, gHf ) ) * ( 1.0 - uNight );
	}
	#endif
`;

function makeGrassMaterial( U ) {
	const m = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0, side: THREE.DoubleSide } );
	patchMaterial( m, 'vegGrassField', ( shader ) => {
		Object.assign( shader.uniforms, VG, U );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + VERT_PARS )
			.replace( '#include <beginnormal_vertex>', 'vegGrassDeform();\nvec3 objectNormal = vegGrassN;' )
			.replace( '#include <begin_vertex>', 'vec3 transformed = vegGrassP;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FRAG_PARS )
			.replace( '#include <map_fragment>', FRAG_COLOR )
			.replace( '#include <normal_fragment_maps>', FRAG_NORMAL )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;' )
			.replace( '#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + FRAG_SPECULAR )
			.replace( '#include <lights_fragment_maps>', FRAG_TRANSLUCENT + '\n#include <lights_fragment_maps>' );
	} );
	return m;
}

// per quality: radius scales ( near, mid, far ), share of the clumps drawn
export const GRASS_QUALITY = {
	low: null,
	medium: { near: 0.75, mid: 0.75, far: 0.72, clumps: 0.55 },
	high: { near: 1, mid: 1, far: 1, clumps: 1 },
	ultra: { near: 1.35, mid: 1.2, far: 1, clumps: 1 },
};

export class GrassField {
	// ground: GroundData
	constructor( ground ) {
		this.ground = ground;
		this.U = {
			uGrassFade: { value: new THREE.Vector4() },
			uGrassFade0: { value: new THREE.Vector4( FADE_T0[ 0 ], FADE_T0[ 1 ], 1, 0 ) },
			uGroundCam: { value: new THREE.Vector2() },
			...ground.uniforms,
		};
		this.material = makeGrassMaterial( this.U );
		const clumps = clumpParams( 7 );
		const patches = [ buildPatch( 0, clumps ), buildPatch( 1, clumps ), buildPatch( 2, clumps ) ];
		this.levels = [ [ patches[ 0 ], MAX_NEAR, 'veg-grass-near' ], [ patches[ 1 ], MAX_MID, 'veg-grass-mid' ], [ patches[ 2 ], MAX_FAR, 'veg-grass-far' ] ].map( ( [ p, max, name ] ) => {
			const geometry = p.b.build();
			const arr = new Float32Array( max * 4 );
			const attr = new THREE.InstancedBufferAttribute( arr, 4 );
			attr.setUsage( THREE.DynamicDrawUsage );
			geometry.setAttribute( 'iCell', attr );
			geometry.instanceCount = 0;
			const mesh = new THREE.Mesh( geometry, this.material );
			mesh.name = name;
			mesh.frustumCulled = false;
			mesh.castShadow = false;
			mesh.receiveShadow = true;
			return { mesh, geometry, attr, arr, max, count: 0, clumpEnd: p.clumpEnd, tris: p.b.triangles };
		} );
		this.meshes = this.levels.map( ( l ) => l.mesh );
		this._frustum = new THREE.Frustum();
		this._mat = new THREE.Matrix4();
		this._box = new THREE.Box3();
		this._last = new Float64Array( 9 ).fill( NaN );
		this.setQuality( 'high' );
	}

	setQuality( name ) {
		const q = GRASS_QUALITY[ name ] || null;
		this.q = q;
		this.enabled = !! q;
		for ( const m of this.meshes ) m.visible = this.enabled;
		if ( ! q ) return;
		this.rNear = R_NEAR * q.near; this.rMid = R_MID * q.mid; this.rFar = R_FAR * q.far;
		this.U.uGrassFade.value.set( FADE_T2[ 0 ] * q.near, FADE_T2[ 1 ] * q.near, FADE_T1[ 0 ] * q.mid, FADE_T1[ 1 ] * q.mid );
		this.U.uGrassFade0.value.set( FADE_T0[ 0 ] * q.far, FADE_T0[ 1 ] * q.far, 1 / Math.sqrt( q.clumps ), 0 );
		// a prefix of the clumps (well spread: blue noise)
		const n = Math.max( 1, Math.round( CLUMPS * q.clumps ) );
		for ( const l of this.levels ) l.geometry.setDrawRange( 0, l.clumpEnd[ n - 1 ] );
		this._last.fill( NaN );
	}

	// where the terrain shows the shaded base of the sward (TerrainGrass.fade x, y)
	get fade() { return this.q ? [ FADE_T0[ 0 ] * this.q.far, FADE_T0[ 1 ] * this.q.far ] : [ 0, 0 ]; }
	get radius() { return this.q ? this.rFar : 0; }

	// recompute the visible cells (cheap; skipped when the camera and the ground data did not change)
	update( camera ) {
		const gd = this.ground;
		const e = camera.matrixWorld.elements;
		this.U.uGroundCam.value.set( e[ 12 ] - gd.origin.x, e[ 14 ] - gd.origin.z );
		for ( const m of this.meshes ) m.position.copy( gd.origin );
		if ( ! this.enabled ) return false;
		const L = this._last;
		const pe = camera.projectionMatrix.elements;
		if ( Math.abs( e[ 12 ] - L[ 0 ] ) < 0.05 && Math.abs( e[ 13 ] - L[ 1 ] ) < 0.05 && Math.abs( e[ 14 ] - L[ 2 ] ) < 0.05 &&
			Math.abs( e[ 8 ] - L[ 3 ] ) < 1e-3 && Math.abs( e[ 9 ] - L[ 4 ] ) < 1e-3 && Math.abs( e[ 10 ] - L[ 5 ] ) < 1e-3 &&
			pe[ 0 ] === L[ 6 ] && pe[ 5 ] === L[ 7 ] && gd.version === L[ 8 ] ) return false;
		L[ 0 ] = e[ 12 ]; L[ 1 ] = e[ 13 ]; L[ 2 ] = e[ 14 ];
		L[ 3 ] = e[ 8 ]; L[ 4 ] = e[ 9 ]; L[ 5 ] = e[ 10 ];
		L[ 6 ] = pe[ 0 ]; L[ 7 ] = pe[ 5 ]; L[ 8 ] = gd.version;

		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem, camera.reversedDepth );
		const cx = e[ 12 ], cz = e[ 14 ];
		const R = this.rFar;
		const i0 = Math.floor( ( cx - R ) / CELL ), i1 = Math.floor( ( cx + R ) / CELL );
		const j0 = Math.floor( ( cz - R ) / CELL ), j1 = Math.floor( ( cz + R ) / CELL );
		const [ near, mid, far ] = this.levels;
		let nc = 0, mc = 0, fc = 0;
		const ox = gd.origin.x, oz = gd.origin.z, C = gd.cells;
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const x0 = i * CELL, z0 = j * CELL;
			// nearest point of the cell (horizontal, like the shader's LOD distance)
			const dx = Math.max( x0 - cx, 0, cx - x0 - CELL ), dz = Math.max( z0 - cz, 0, cz - z0 - CELL );
			const d = Math.hypot( dx, dz );
			if ( d > R ) continue;
			// the block (and the neighbours the filtering reads) is in, and a 4 m square has grass
			if ( ! gd.ready( Math.floor( x0 / 32 ), Math.floor( z0 / 32 ) ) ) continue;
			let any = 0, mn = Infinity, mx = - Infinity;
			for ( let q = 0; q < 4; q ++ ) {
				const k = gd.cell4( i * 2 + ( q & 1 ), j * 2 + ( q >> 1 ) );
				if ( k < 0 ) continue;
				mn = Math.min( mn, C[ k ] ); mx = Math.max( mx, C[ k + 1 ] );
				if ( C[ k + 2 ] ) any = 1;
			}
			if ( ! any ) continue;
			this._box.min.set( x0, mn - 0.5, z0 );
			this._box.max.set( x0 + CELL, mx + 1.8, z0 + CELL );
			if ( ! this._frustum.intersectsBox( this._box ) ) continue;
			const lvl = d < this.rNear ? near : d < this.rMid ? mid : far;
			const c = lvl === near ? nc ++ : lvl === mid ? mc ++ : fc ++;
			if ( c >= lvl.max ) continue;
			lvl.arr[ c * 4 ] = x0 - ox;
			lvl.arr[ c * 4 + 1 ] = z0 - oz;
			lvl.arr[ c * 4 + 2 ] = x0;
			lvl.arr[ c * 4 + 3 ] = z0;
		}
		for ( const [ lvl, count ] of [ [ near, nc ], [ mid, mc ], [ far, fc ] ] ) {
			lvl.count = Math.min( count, lvl.max );
			lvl.geometry.instanceCount = lvl.count;
			lvl.attr.clearUpdateRanges();
			lvl.attr.addUpdateRange( 0, Math.max( 1, lvl.count ) * 4 );
			lvl.attr.needsUpdate = true;
		}
		return true;
	}

	get cellCounts() { return this.levels.map( ( l ) => l.count ); }
	get triangles() { return this.levels.reduce( ( a, l ) => a + l.count * l.geometry.drawRange.count / 3, 0 ); }

	dispose() {
		this.material.dispose();
		for ( const l of this.levels ) l.geometry.dispose();
	}
}
