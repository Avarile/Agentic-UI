// Projects: a grouping of conversations with its own workspace.
//
// A chat can be scoped to a project via `?projectId`, which ChatRoute verifies
// before trusting — see its note on why a transient query failure must not unscope
// a valid project.

export { default as ProjectsView } from './ProjectsView';
export { default as ProjectWorkspace } from './ProjectWorkspace';
