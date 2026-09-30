// Water you can reach: the sea (salty — it makes thirst worse, but bottles can be filled for boiling),
// and the rain (look up and drink when it pours).
import * as THREE from 'three';

export class Water {
	constructor( game ) {
		this.game = game;
		game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
	}

	provide( ray ) {
		const g = this.game, p = g.player;
		const out = [];
		// the sea surface in front of you
		if ( ray.dir.y < - 0.15 ) {
			const water = g.physics.waterLevel( ray.origin.x, ray.origin.z );
			const t = ( ray.origin.y - water ) / - ray.dir.y;
			if ( t > 0 && t < 2.8 ) {
				const x = ray.origin.x + ray.dir.x * t, z = ray.origin.z + ray.dir.z * t;
				if ( g.hf.heightAt( x, z ) < water - 0.05 ) {
					const fill = g.itemUse?.fillFrom ? p.inventory.find( ( s, d ) => d?.tool?.liquid && ( ! s.data.liquid || s.data.liquid === 'sea' ) && ( s.data.amount || 0 ) < d.tool.liquid ) : null;
					if ( fill ) out.push( { id: 'sea-fill', t, label: 'Fill', sub: 'Seawater', action: () => g.itemUse.fillFrom( 'sea', fill ) } );
					else out.push( { id: 'sea', t, label: 'Drink', sub: 'Seawater', action: () => this.drinkSea() } );
				}
			}
		}
		// rain: look up
		if ( ( g.weather?.rain || 0 ) > 0.35 && ray.dir.y > 0.85 && ! g.world.isIndoors?.( p.pos ) ) {
			out.push( { id: 'rain', t: 0.5, noOcclusion: true, label: 'Drink', sub: 'Rain', action: () => this.drinkRain() } );
		}
		return out;
	}

	drinkSea() {
		const g = this.game;
		g.actions.start( { label: 'Drinking', time: 1.5, sound: 'drink', onDone: () => g.survival.drink( null, 0.2, 'sea' ) } );
	}

	drinkRain() {
		const g = this.game;
		g.actions.start( {
			label: 'Catching rain', time: 6, cancelOnMove: true,
			onDone: () => { g.survival.drink( null, 0.15, 'water' ); g.toast( 'Rainwater', 'good' ); },
		} );
	}
}

void THREE;
