// Extension hooks for the item modules (Node-safe, no three.js): the domain files under defs/ register
// behaviour here instead of editing ItemUse.js.
//   addUseActions( fn( stack, def, ctx ) )   adds right-click verbs. ctx: { add( verb, run, notes ), first( verb,
//                                            run, notes ), game, use (game.itemUse), inv }. `first` makes the verb the
//                                            double-click default. Runs after the built-in verbs, in registration order.
export const USE_PROVIDERS = [];
export function addUseActions( fn ) { USE_PROVIDERS.push( fn ); }
