// Trade-wind weather: clear, fair-weather cumulus, windward showers, overcast, Kona storms.
// Drives cloud cover, rain, wind, sea state and fog; transitions are slow and seeded by the clock.
import * as THREE from 'three';
import { G } from '../render/Materials.js';
import { LAYER_OVERLAY } from '../render/Renderer.js';

// cover: cloud coverage of the volumetric clouds (Tidewater's "Partly cloudy" preset is 0.49); heavy:
// overcast skies are denser and darker underneath (density x1.3, ambient x0.7)
export const WEATHERS = {
	clear: { cover: 0.35, rain: 0, wind: 0.35, sea: 0.35, fog: 0.8, heavy: 0 },
	fair: { cover: 0.49, rain: 0, wind: 0.45, sea: 0.45, fog: 1, heavy: 0 },
	cloudy: { cover: 0.62, rain: 0, wind: 0.55, sea: 0.55, fog: 1.3, heavy: 0 },
	showers: { cover: 0.72, rain: 0.45, wind: 0.6, sea: 0.6, fog: 1.8, heavy: 0 },
	overcast: { cover: 0.88, rain: 0.15, wind: 0.5, sea: 0.5, fog: 2.2, heavy: 1 },
	storm: { cover: 0.96, rain: 1, wind: 1, sea: 1, fog: 3.2, heavy: 1 },
};

export class Weather {
	constructor( game ) {
		this.game = game;
		this.state = 'fair';
		this.cover = 0.49; this.rain = 0; this.wind = 0.45; this.sea = 0.45; this.fog = 1; this.heavy = 0;
		this.nextChange = 0.6; // game hours until the next change
		this.locked = false;
		this.lightningT = 5;
		this.flash = 0;
		this.rainMesh = null;
	}

	set( name, instant = false ) {
		if ( ! WEATHERS[ name ] ) return false;
		this.state = name;
		if ( instant ) Object.assign( this, pick( WEATHERS[ name ] ) );
		this.nextChange = 2 + Math.random() * 6;
		return true;
	}

	update( dt ) {
		const g = this.game;
		const gh = dt / ( g.time.dayMinutes * 60 ) * 24;
		if ( ! this.locked ) {
			this.nextChange -= gh;
			if ( this.nextChange <= 0 ) {
				const r = Math.random();
				const next = r < 0.2 ? 'clear' : r < 0.55 ? 'fair' : r < 0.72 ? 'cloudy' : r < 0.87 ? 'showers' : r < 0.95 ? 'overcast' : 'storm';
				this.set( next );
			}
		}
		const w = WEATHERS[ this.state ];
		if ( ! ( this.heavy >= 0 ) ) this.heavy = 0; // (saves from before the field)
		const k = Math.min( 1, dt * 0.02 );
		this.cover += ( w.cover - this.cover ) * k;
		// windward showers are local: more rain over the wet side of the islands
		const p = g.player.pos;
		const moist = g.hf.surfaceAt( p.x, p.z )[ 0 ];
		const localRain = w.rain * ( this.state === 'showers' ? 0.5 + moist : 1 );
		this.rain += ( Math.min( 1, localRain ) - this.rain ) * Math.min( 1, dt * 0.05 );
		this.wind += ( w.wind - this.wind ) * k;
		this.sea += ( w.sea - this.sea ) * k;
		this.fog += ( w.fog - this.fog ) * k;
		this.heavy += ( w.heavy - this.heavy ) * k;
		const sky = g.world.sky;
		sky.cloudCover = this.cover;
		sky.cloudDensityK = 1 + 0.3 * this.heavy;
		sky.cloudAmbientK = 1 - 0.3 * this.heavy;
		// marine haze (Tidewater AirHaze density 1.6 on a humid tropical day), thicker in bad weather
		G.uHazeDensity.value = 1.6 * this.fog;
		G.uFogBoost.value = this.fog;
		G.uWet.value += ( ( this.rain > 0.05 ? Math.min( 1, this.rain * 1.4 ) : 0 ) - G.uWet.value ) * Math.min( 1, dt * ( this.rain > 0.05 ? 0.05 : 0.01 ) );
		g.world.ocean.seaState = this.sea;
		// lightning in storms
		if ( this.state === 'storm' && this.cover > 0.85 ) {
			this.lightningT -= dt;
			if ( this.lightningT <= 0 ) {
				this.lightningT = 6 + Math.random() * 18;
				this.flash = 1;
				const d = 400 + Math.random() * 2500;
				setTimeout( () => g.audio.play( 'thunder', { vol: Math.min( 1, 900 / d ), bus: 'ambient' } ), d / 343 * 1000 );
			}
		}
		this.flash = Math.max( 0, this.flash - dt * 4 );
		g.flash = this.flash * 0.25;
		this._rain( dt );
	}

	// rain streaks around the camera
	_rain( dt ) {
		const g = this.game;
		if ( ! this.rainMesh ) {
			const N = 7000;
			const geo = new THREE.BufferGeometry();
			const pos = new Float32Array( N * 2 * 3 ), seed = new Float32Array( N * 2 );
			for ( let i = 0; i < N; i ++ ) {
				const x = ( Math.random() - 0.5 ) * 40, y = Math.random() * 30, z = ( Math.random() - 0.5 ) * 40;
				pos.set( [ x, y, z, x, y, z ], i * 6 );
				seed[ i * 2 ] = 0; seed[ i * 2 + 1 ] = 1;
			}
			geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
			geo.setAttribute( 'tip', new THREE.BufferAttribute( seed, 1 ) );
			const mat = new THREE.ShaderMaterial( {
				uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLight: { value: new THREE.Color() } },
				vertexShader: /* glsl */`
					attribute float tip; uniform float uT; uniform vec3 uCam; uniform float uAmt; uniform vec2 uWind; varying float vA;
					void main() {
						vec3 p = position;
						float fall = 14.0;
						p.y = mod( p.y - uT * fall, 30.0 );
						p.xz += uWind * ( 30.0 - p.y ) * 0.25;
						vec3 w = vec3( mod( p.x - uCam.x + 20.0, 40.0 ) - 20.0 + uCam.x, p.y + uCam.y - 10.0, mod( p.z - uCam.z + 20.0, 40.0 ) - 20.0 + uCam.z );
						w.y -= tip * 0.55; w.xz -= tip * uWind * 0.04;
						vA = uAmt * step( fract( position.x * 13.7 + position.z * 7.1 ), uAmt ) ;
						gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
					}`,
				fragmentShader: /* glsl */`uniform vec3 uLight; varying float vA; void main() { if ( vA <= 0.0 ) discard; gl_FragColor = vec4( uLight, 0.28 * vA ); }`,
				transparent: true, depthWrite: false,
			} );
			this.rainMesh = new THREE.LineSegments( geo, mat );
			this.rainMesh.frustumCulled = false;
			// drawn after the TAA resolve (thin fast streaks would smear through the history)
			this.rainMesh.layers.set( LAYER_OVERLAY );
			this.rainMesh.renderOrder = 20;
			g.scene.add( this.rainMesh );
		}
		const u = this.rainMesh.material.uniforms;
		u.uT.value += dt;
		u.uCam.value.copy( g.camera.position );
		const indoor = g.world.isIndoors?.( g.player.pos );
		u.uAmt.value = indoor ? 0 : this.rain;
		u.uWind.value.copy( G.uWind.value ).multiplyScalar( this.wind * 4 );
		u.uLight.value.copy( g.world.sky.sunColor ).multiplyScalar( 0.12 ).addScalar( 0.12 + this.flash );
		this.rainMesh.visible = this.rain > 0.01;
	}

	serialize() { return { state: this.state, cover: this.cover, rain: this.rain, wind: this.wind, sea: this.sea, fog: this.fog, heavy: this.heavy, nextChange: this.nextChange, locked: this.locked }; }
	load( o ) { if ( o ) Object.assign( this, o ); }
}

function pick( w ) { return { cover: w.cover, rain: w.rain, wind: w.wind, sea: w.sea, fog: w.fog, heavy: w.heavy }; }
