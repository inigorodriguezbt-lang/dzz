// The expansion domains' model files (docs/ITEMS_PLAN.md), registered after the food, clothing and gear builders.
import { register as kitchen } from './kitchen.js';
import { register as pharmacy } from './pharmacy.js';
import { register as outdoors } from './outdoors.js';
import { register as arms } from './arms.js';
import { register as tech } from './tech.js';
import { register as gear } from './gear.js';
import { register as leisure } from './leisure.js';
import { register as placeables } from './placeables.js';
import { register as sites } from '../../sites/models.js';

export function registerDomainModels( reg ) {
	for ( const f of [ kitchen, pharmacy, outdoors, arms, tech, gear, leisure, placeables, sites ] ) f( reg );
}
