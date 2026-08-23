// Barrel for the client's React Query layer — the single import site for data access.
//
// Not to be confused with the `librechat-data-provider` package (packages/data-provider),
// which this sits on top of. That package owns the wire contract — endpoint URLs,
// request/response types, `dataService`, and the shared QueryKeys/MutationKeys.
// This directory owns the *client* concerns the package cannot know about: cache
// keys and staleness, invalidation after a mutation, optimistic updates, polling
// and backoff, and query gating on auth or permissions.
//
// The layout records the project's convention and its history. New features get a
// directory (`Feature/queries.ts`, `Feature/mutations.ts`, `Feature/index.ts`,
// re-exported here). The flat files at this level — queries.ts, mutations.ts,
// prompts.ts, roles.ts, tags.ts, Favorites.ts — predate that rule and still hold
// conversations, presets, assistants, actions, and speech. Add to a directory, not
// to the flat files.

export * from './Auth';
export * from './Agents';
export * from './Endpoints';
export * from './Skills';
export * from './Files';
export * from './Langfuse';
/* Memories */
export * from './Memories';
export * from './Messages';
export * from './Misc';
export * from './Projects';
export * from './Tools';
export * from './connection';
export * from './Favorites';
export * from './mutations';
export * from './prompts';
export * from './queries';
export * from './roles';
export * from './tags';
export * from './MCP';
export * from './SSE';
export * from './SystemCore';
