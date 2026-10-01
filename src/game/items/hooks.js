// Extension hooks for the item modules (Node-safe, no three.js): the domain files under defs/ register
// behaviour here instead of editing ItemUse.js.
//   addUseActions( fn( stack, def, ctx ) )   adds right-click verbs. ctx: { add( verb, run, notes ), first( verb,
//                                            run, notes ), game, use (game.itemUse), inv }. `first` makes the verb the
//                                            double-click default. Runs after the built-in verbs, in registration order.
//                                            A verb that cheers or calms (play, smoke, admire) calls
//                                            use.applyFun( def, k = 1, { repeat: s, fallback } ) when it's done, and
//                                            practice calls use.xp( skill, n ) (game.skills.xp).
export const USE_PROVIDERS = [];
export function addUseActions( fn ) { USE_PROVIDERS.push( fn ); }
