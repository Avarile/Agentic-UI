// The public surface of the System Core feed: two Express handlers.
//
// Deliberately this narrow. `./queries` (the PromQL registry), `./catalog`,
// `./assemble` and `./snapshot` are all unexported, so no caller outside this
// directory can reach an expression, a catalogue entry or the cache — which is
// what keeps the zero-argument path from the route to the query a property of
// the module graph rather than a convention.

export { createSystemCoreHandlers } from './handler';
export type { SystemCoreHandlers } from './handler';
