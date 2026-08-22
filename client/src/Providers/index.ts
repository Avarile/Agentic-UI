// Barrel for the context layer.
//
// One import site (`~/Providers`) for every context in the app. Worth keeping
// because the provider stack is assembled in a handful of places (App, Root,
// ChatView, Presentation) that each pull several contexts at once, and because it
// keeps the `Context` / `useXContext` / `XProvider` triples from leaking
// file-path knowledge into feature code.

export { default as AssistantsProvider } from './AssistantsContext';
export { default as AgentsProvider } from './AgentsContext';
export * from './ActivePanelContext';
export * from './AgentPanelContext';
export * from './ChatContext';
export * from './ShareContext';
export * from './FileMapContext';
export * from './AddedChatContext';
export * from './EditorContext';
export * from './ChatFormContext';
export * from './BookmarkContext';
export * from './MessageContext';
export * from './AssistantsContext';
export * from './AgentsContext';
export * from './AssistantsMapContext';
export * from './AnnouncerContext';
export * from './AgentsMapContext';
export * from './ArtifactContext';
export * from './CodeBlockContext';
export * from './ToolCallsMapContext';
export * from './SetConvoContext';
export * from './SearchContext';
export * from './BadgeRowContext';
export * from './DragDropContext';
export * from './UploadModalContext';
export * from './ArtifactsContext';
export * from './PromptGroupsContext';
export * from './MessagesViewContext';
export { default as BadgeRowProvider } from './BadgeRowContext';
