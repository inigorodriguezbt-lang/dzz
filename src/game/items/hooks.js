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
//   addEatHook( fn( stack, def, k, use ) )   runs after Survival.eat for each portion eaten (k = 1 / portions): a stack
//                                            that carries its own nutrition (an evolved dish's data.dish) adds it here
//   addSpoilHook( fn( items, k, dh, game ) -> k )   for each list of items food ages in (a carried bag, the open
//                                            container, a stash): returns the rate the food in it ages at (ice in a
//                                            cooler slows it; the ice melts meanwhile)
export const EAT_HOOKS = [];
export function addEatHook( fn ) { EAT_HOOKS.push( fn ); }
export const SPOIL_HOOKS = [];
export function addSpoilHook( fn ) { SPOIL_HOOKS.push( fn ); }
export function spoilRate( items, k, dh, game ) {
	for ( const fn of SPOIL_HOOKS ) { try { k = fn( items, k, dh, game ); } catch ( e ) { console.error( 'spoil hook', e ); } }
	return k;
}
//   addMedHook( { check( stack, def, use ) -> 'reason' | true | null, done( stack, def, use, res ) } )   around a medical
//                                            item's use (ItemUse.medicate): check refuses with a short reason, or
//                                            returns true to allow what the base rules would refuse (a dressing to
//                                            change while not bleeding); done runs after Survival.medicate, with what
//                                            it returned (the pharmacy: the old dressing comes off dirty)
export const MED_HOOKS = [];
export function addMedHook( h ) { MED_HOOKS.push( h ); }
