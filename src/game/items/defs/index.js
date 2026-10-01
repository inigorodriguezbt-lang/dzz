// Every item definition module. Importing this registers the whole catalogue with ItemDB (pure data, Node-safe).
// firearms.js belongs to the weapons module; the rest is ours.
import './firearms.js';
import './clothing.js';
import './food.js';
import './medical.js';
import './tools.js';
import './materials.js';
// the expansion domains (docs/ITEMS_PLAN.md)
import './ext/kitchen.js';
import './ext/pharmacy.js';
import './ext/outdoors.js';
import './ext/arms.js';
import './ext/tech.js';
import './ext/gear.js';
import './ext/leisure.js';
// placeables core items (traps, alarm clock, rain barrel, tote, candle, tiki torch)
import './ext/placeables.js';
// outdoor loot sites: the site_<kind> tables, stash notes and treasure maps
import '../sites/tables.js';
