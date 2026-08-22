// Re-exports `./ui` only.
//
// Deliberately not a barrel for the whole component tree. Feature directories are
// imported by path (`~/components/Chat/...`), because a single root barrel over 860
// files would defeat code splitting — importing one component would pull the
// whole tree into every chunk that touched it.

export * from './ui';
