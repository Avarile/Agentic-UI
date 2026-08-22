// Barrel for the hooks layer — where the client's behaviour actually lives.
//
// The directory is organized by *domain*, not by hook kind: `Chat/` owns sending
// and aborting, `SSE/` owns receiving, `Messages/` owns rendering concerns,
// `Input/` owns the composer, `Files/` owns uploads, and so on. A hook belongs in
// the folder named after the thing it manipulates.
//
// That split is what keeps the store readable. Atoms in `~/store` are deliberately
// dumb — values and selectors, no orchestration — and every non-trivial
// interaction between them is a hook here. If logic touches two atoms, a query,
// and a ref, it is a hook, not a selector.
//
// A handful of root-level entries (`AuthContext`, `ApiErrorBoundaryContext`,
// `ScreenshotContext`) are contexts rather than hooks. They live here rather than
// in `~/Providers` because they are consumed almost exclusively through their
// hooks, and because they must be importable before the provider stack exists.

export * from './Audio';
export * from './Assistants';
export * from './Agents';
export * from './Chat';
export * from './Config';
export * from './Conversations';
export * from './Nav';
export * from './Files';
export * from './Generic';
export * from './Input';
export * from './MCP';
export * from './Mermaid';
export * from './Messages';
export * from './Plugins';
export * from './Prompts';
export * from './Roles';
export * from './Sharing';
export * from './Skills';
export * from './SSE';
export * from './AuthContext';
export * from './ScreenshotContext';
export * from './ApiErrorBoundaryContext';
export * from './Endpoint';

export type { TranslationKeys } from './useLocalize';

export { default as useTimeout } from './useTimeout';
export { default as useNewConvo } from './useNewConvo';
export { default as useLocalize } from './useLocalize';
export { default as useGreeting } from './useGreeting';
export { default as useFocusTrap } from './useFocusTrap';
export { default as useFavorites } from './useFavorites';
export { default as useToolFavorites } from './useToolFavorites';
export { default as useChatBadges } from './useChatBadges';
export { default as useScrollToRef } from './useScrollToRef';
export { default as useIsActiveItem } from './useIsActiveItem';
export { default as useLocalStorage } from './useLocalStorage';
export { default as useDocumentTitle } from './useDocumentTitle';
export { default as useSpeechToText } from './Input/useSpeechToText';
export { default as useTextToSpeech } from './Input/useTextToSpeech';
export { default as useGenerationsByLatest } from './useGenerationsByLatest';
export { default as useLocalizedConfig } from './useLocalizedConfig';
export { default as useResourcePermissions } from './useResourcePermissions';
export { useRoleSelector } from './useRoleSelector';
