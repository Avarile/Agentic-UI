// The skills feature: markdown documents with attached files that agents can
// invoke.
//
// Organized by role rather than by entity — `layouts/` for the page shell,
// `lists/` for browsing, `display/` for reading, `forms/` for editing, `tree/` for
// the file editor, `dialogs/`, `buttons/`, `sidebar/`, and `utils/` for frontmatter
// parsing. That split is what keeps the view, the editor and the file tree from
// reaching into each other.

export * from './buttons';
export * from './dialogs';
export * from './display';
export * from './forms';
export * from './lists';
export * from './sidebar';
export * from './tree';
export * from './utils';
