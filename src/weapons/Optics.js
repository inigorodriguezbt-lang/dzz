// Sights: reflex / holographic reticles drawn in the lens so they sit at infinity (the dot is wherever the
// optic's axis points, whatever the eye position: that is why a red dot has no parallax), and the full-screen
// overlay a magnified scope or binoculars turn into once you are behind the glass.
import * as THREE from 'three';

// reticle kinds (lens shader and overlay share the numbering)
export const RETICLE = { dot: 0, holo: 1, ring: 2, acog: 3, scope: 4, mildot: 5, pso: 6, binoc: 7 };
// which optics become a full-screen view at full ADS (the rest keep the gun and zoom the world a little)
export const OVERLAY_RETICLES = new Set( [ 'acog', 'scope', 'mildot', 'pso' ] );

const LENS_VS = /* glsl */`
	varying vec3 vView;
	void main() {
		vec4 mv = modelViewMatrix * vec4( position, 1.0 );
		vView = mv.xyz;
		gl_Position = projectionMatrix * mv;
	}`;

const LENS_FS = /* glsl */`
	uniform vec3 uAxis, uUp, uRight, uColor;
	uniform float uType, uGlow, uAlpha;
	varying vec3 vView;
	// anti-aliased band: 1 inside [a-w, a+w] of x
	float band( float x, float a, float w ) { float f = fwidth( x ) * 0.75 + 1e-6; return smoothstep( w + f, w - f, abs( x - a ) ); }
	void main() {
		vec3 d = normalize( vView );
		float z = max( dot( d, uAxis ), 1e-3 );
		// angles off the optic axis (radians, tangent plane)
		vec2 a = vec2( dot( d, uRight ), dot( d, uUp ) ) / z;
		float r = length( a );
		float ret = 0.0;
		if ( uType < 0.5 ) {
			ret = band( r, 0.0, 0.0022 );
		} else if ( uType < 1.5 ) {
			// EOTech-style: 65 MOA ring, 1 MOA dot, four ticks
			ret = max( band( r, 0.0, 0.0016 ), band( r, 0.0185, 0.0011 ) );
			float tick = ( band( a.x, 0.0, 0.0009 ) * step( 0.0185, abs( a.y ) ) * step( abs( a.y ), 0.024 ) ) + ( band( a.y, 0.0, 0.0009 ) * step( 0.0185, abs( a.x ) ) * step( abs( a.x ), 0.024 ) );
			ret = max( ret, tick );
		} else if ( uType < 2.5 ) {
			// AUG: a black ring around a dot
			ret = max( band( r, 0.0, 0.0018 ), band( r, 0.012, 0.0009 ) );
		} else {
			// chevron (ACOG seen off-axis before the overlay takes over)
			float cx = abs( a.x ), cy = - a.y;
			ret = band( cy, cx * 1.2, 0.0012 ) * step( cx, 0.006 ) * step( 0.0, cy );
		}
		vec3 glass = vec3( 0.45, 0.62, 0.72 );
		// a faint tinted coating on the glass
		vec3 col = uColor * uGlow * ret + glass * 0.06;
		gl_FragColor = vec4( col, clamp( max( ret, 0.06 ) * uAlpha, 0.0, 1.0 ) );
	}`;

// the lens of an optic: a disc (or the holo's window) at the reticle plane, facing the eye (-x in the gun frame)
export function reticleLens( attDef, info ) {
	const a = attDef.attachment;
	const kind = a.reticle === 'holo' ? RETICLE.holo : a.reticle === 'acog' ? RETICLE.acog : RETICLE.dot;
	const geo = info.window ? new THREE.PlaneGeometry( 0.027, info.lensH * 2 || 0.026 ) : new THREE.CircleGeometry( info.lensR || 0.012, 28 );
	geo.rotateY( - Math.PI / 2 );
	const u = {
		uAxis: { value: new THREE.Vector3( 0, 0, - 1 ) }, uUp: { value: new THREE.Vector3( 0, 1, 0 ) }, uRight: { value: new THREE.Vector3( 1, 0, 0 ) },
		uColor: { value: new THREE.Color( a.color ?? 0xff2a1a ) }, uType: { value: kind }, uGlow: { value: 6 }, uAlpha: { value: 1 },
	};
	const mat = new THREE.ShaderMaterial( { name: 'Reticle', uniforms: u, vertexShader: LENS_VS, fragmentShader: LENS_FS, transparent: true, depthWrite: false } );
	const m = new THREE.Mesh( geo, mat );
	m.position.set( info.reticleX ?? 0, info.axisH, 0 );
	m.renderOrder = 20;
	m.userData.uniforms = u;
	return m;
}

// an integrated optic's lens (the AUG's 1.5x ring)
export function integratedLens( io ) {
	const geo = new THREE.CircleGeometry( io.r * 0.95, 28 );
	geo.rotateY( - Math.PI / 2 );
	const u = {
		uAxis: { value: new THREE.Vector3( 0, 0, - 1 ) }, uUp: { value: new THREE.Vector3( 0, 1, 0 ) }, uRight: { value: new THREE.Vector3( 1, 0, 0 ) },
		uColor: { value: new THREE.Color( 0x080808 ) }, uType: { value: RETICLE.ring }, uGlow: { value: 1 }, uAlpha: { value: 1 },
	};
	const mat = new THREE.ShaderMaterial( { name: 'ReticleRing', uniforms: u, vertexShader: LENS_VS, fragmentShader: LENS_FS, transparent: true, depthWrite: false } );
	// a black ring reads on the glass as a dark line: draw it as "glass minus"
	mat.blending = THREE.NormalBlending;
	const m = new THREE.Mesh( geo, mat );
	m.position.set( io.x0 + 0.01, io.y, 0 );
	m.renderOrder = 20;
	m.userData.uniforms = u;
	return m;
}

// point a lens's reticle along the optic axis: q = the gun's quaternion in view space
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function aimLens( lens, q ) {
	const u = lens.userData.uniforms;
	// gun frame: +x forward (the optic axis), +y up, +z right
	u.uAxis.value.set( 1, 0, 0 ).applyQuaternion( q );
	u.uUp.value.set( 0, 1, 0 ).applyQuaternion( q );
	u.uRight.value.set( 0, 0, 1 ).applyQuaternion( q );
}

// ---- the scope / binocular overlay ----------------------------------------------------------------------------------

const OVERLAY_VS = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const OVERLAY_FS = /* glsl */`
	uniform vec2 uCenter; uniform float uAspect, uRadius, uAlpha, uType, uLit, uTime, uZoom;
	uniform vec3 uColor;
	varying vec2 vUv;
	float band( float x, float a, float w ) { float f = fwidth( x ) + 1e-6; return smoothstep( w + f, w - f, abs( x - a ) ); }
	float segH( vec2 u, float y, float x0, float x1, float w ) { return band( u.y, y, w ) * step( x0, u.x ) * step( u.x, x1 ); }
	float segV( vec2 u, float x, float y0, float y1, float w ) { return band( u.x, x, w ) * step( y0, u.y ) * step( u.y, y1 ); }
	float dot2( vec2 u, vec2 c, float r ) { float d = length( u - c ); float f = fwidth( d ) + 1e-6; return smoothstep( r + f, r - f, d ); }
	void main() {
		vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 ) * 2.0;
		vec2 q = p - uCenter;
		float r;
		if ( uType > 6.5 ) {
			// binoculars: two overlapping circles
			vec2 q1 = q - vec2( - 0.42, 0.0 ), q2 = q - vec2( 0.42, 0.0 );
			r = min( length( q1 ), length( q2 ) ) / ( uRadius * 0.82 );
		} else r = length( q ) / uRadius;
		float fw = fwidth( r ) + 1e-4;
		float inside = smoothstep( 1.0 + fw, 1.0 - fw, r );
		// the eye box: the image darkens and tints towards the rim
		float shade = smoothstep( 0.62, 1.0, r );
		vec2 u = q / uRadius;
		float black = 0.0, lit = 0.0;
		if ( uType > 3.5 && uType < 4.5 ) {
			// duplex: heavy posts, fine centre cross
			float fine = max( segH( u, 0.0, - 0.3, 0.3, 0.0022 ), segV( u, 0.0, - 0.3, 0.3, 0.0022 ) );
			float post = max( max( segH( u, 0.0, - 1.1, - 0.3, 0.012 ), segH( u, 0.0, 0.3, 1.1, 0.012 ) ), max( segV( u, 0.0, - 1.1, - 0.3, 0.012 ), segV( u, 0.0, 0.3, 1.1, 0.012 ) ) );
			black = max( fine, post );
		} else if ( uType > 4.5 && uType < 5.5 ) {
			// mil-dot: fine cross, dots every mil, thick outer posts
			float fine = max( segH( u, 0.0, - 0.7, 0.7, 0.0016 ), segV( u, 0.0, - 0.7, 0.7, 0.0016 ) );
			float post = max( max( segH( u, 0.0, - 1.1, - 0.7, 0.01 ), segH( u, 0.0, 0.7, 1.1, 0.01 ) ), max( segV( u, 0.0, - 1.1, - 0.7, 0.01 ), segV( u, 0.0, 0.7, 1.1, 0.01 ) ) );
			float dots = 0.0;
			for ( int i = 1; i <= 5; i ++ ) {
				float s = float( i ) * 0.12;
				dots = max( dots, max( max( dot2( u, vec2( s, 0.0 ), 0.008 ), dot2( u, vec2( - s, 0.0 ), 0.008 ) ), max( dot2( u, vec2( 0.0, s ), 0.008 ), dot2( u, vec2( 0.0, - s ), 0.008 ) ) ) );
			}
			black = max( max( fine, post ), dots );
			lit = dot2( u, vec2( 0.0 ), 0.004 ) * 0.6;
		} else if ( uType > 2.5 && uType < 3.5 ) {
			// ACOG: lit chevron, bullet-drop stadia below it
			float cx = abs( u.x ), cy = - u.y;
			lit = band( cy, cx * 1.3, 0.006 ) * step( cx, 0.06 ) * step( 0.0, cy );
			black = segV( u, 0.0, - 0.55, - 0.09, 0.0025 );
			for ( int i = 1; i <= 5; i ++ ) { float y = - 0.09 - float( i ) * 0.085; float w = 0.07 - float( i ) * 0.01; black = max( black, segH( u, y, - w, w, 0.0025 ) ); }
			black = max( black, max( segH( u, 0.0, - 1.1, - 0.5, 0.004 ), segH( u, 0.0, 0.5, 1.1, 0.004 ) ) );
		} else if ( uType > 5.5 && uType < 6.5 ) {
			// PSO-1: main chevron, three hold-over chevrons, windage scale, rangefinder curve
			for ( int i = 0; i < 4; i ++ ) {
				vec2 c = vec2( 0.0, - float( i ) * ( i == 0 ? 0.0 : 0.11 ) - ( i > 0 ? 0.08 : 0.0 ) );
				float sc = i == 0 ? 1.0 : 0.6;
				float cx = abs( u.x - c.x ) / sc, cy = ( c.y - u.y ) / sc;
				lit = max( lit, band( cy, cx * 1.6, 0.005 ) * step( cx, 0.045 ) * step( 0.0, cy ) );
			}
			lit = max( lit, segH( u, 0.0, - 0.6, - 0.06, 0.003 ) * 0.9 );
			for ( int i = 1; i <= 10; i ++ ) { float x = - float( i ) * 0.055; lit = max( lit, segV( u, x, 0.0, i == 5 || i == 10 ? 0.04 : 0.025, 0.003 ) ); }
			float curve = band( u.y, - 0.55 + 0.12 / ( 1.0 + ( u.x + 0.6 ) * 6.0 ), 0.003 ) * step( - 0.9, u.x ) * step( u.x, - 0.25 );
			lit = max( lit, curve );
		} else if ( uType > 6.5 ) {
			// binoculars: a mil scale
			black = segH( u, 0.0, - 0.3, 0.3, 0.002 ) * 0.7;
			for ( int i = - 5; i <= 5; i ++ ) black = max( black, segV( u, float( i ) * 0.06, 0.0, i == 0 ? 0.06 : 0.03, 0.002 ) * 0.7 );
		}
		vec3 col = vec3( 0.0 );
		float a = 1.0 - inside;
		// lens tint and eyebox shadow
		a = max( a, shade * shade * 0.85 );
		col = mix( col, uColor * uLit, lit );
		a = max( a, black );
		a = max( a, lit );
		// a thin coloured rim where the glass meets the tube
		float rimC = band( r, 0.985, 0.012 ) * inside;
		col += vec3( 0.12, 0.2, 0.28 ) * rimC;
		gl_FragColor = vec4( col, a * uAlpha );
	}`;

export class ScopeOverlay {
	constructor() {
		this.u = {
			uCenter: { value: new THREE.Vector2() }, uAspect: { value: 16 / 9 }, uRadius: { value: 0.92 }, uAlpha: { value: 0 },
			uType: { value: RETICLE.scope }, uLit: { value: 5 }, uTime: { value: 0 }, uZoom: { value: 4 }, uColor: { value: new THREE.Color( 1, 0.15, 0.08 ) },
		};
		const mat = new THREE.ShaderMaterial( { name: 'ScopeOverlay', uniforms: this.u, vertexShader: OVERLAY_VS, fragmentShader: OVERLAY_FS, transparent: true, depthTest: false, depthWrite: false } );
		this.mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), mat );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1000;
		this.mesh.visible = false;
	}
	// kind: a RETICLE name
	set( kind, color = null, lit = 5 ) {
		this.u.uType.value = RETICLE[ kind ] ?? RETICLE.scope;
		if ( color != null ) this.u.uColor.value.set( color );
		this.u.uLit.value = lit;
	}
	update( alpha, aspect, cx = 0, cy = 0, radius = 0.92 ) {
		this.u.uAlpha.value = alpha;
		this.u.uAspect.value = aspect;
		this.u.uCenter.value.set( cx, cy );
		this.u.uRadius.value = radius;
		this.mesh.visible = alpha > 0.002;
	}
}
