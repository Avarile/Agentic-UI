// Hooks for the older OpenAI/Azure assistants endpoints, mirroring hooks/Agents.
// Kept separate rather than generalized because the two APIs differ enough that a
// shared abstraction would be mostly branching.

export { default as useAssistantsMap } from './useAssistantsMap';
export { default as useSelectAssistant } from './useSelectAssistant';
export { default as useAssistantListMap } from './useAssistantListMap';
