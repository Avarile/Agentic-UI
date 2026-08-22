// The composer: text state, key handling, drafts, mentions, speech, and user keys.
//
// The densest interaction surface in the app — a single Enter press can send,
// steer, queue, insert a newline, or accept an autocomplete depending on state, so
// the resolution logic is deliberately centralized rather than spread across
// handlers.

export * from './useAutoSave';
export { default as useUserKey } from './useUserKey';
export { default as useDebounce } from './useDebounce';
export { default as useTextarea } from './useTextarea';
export { default as useQueryParams } from './useQueryParams';
export { default as useHandleKeyUp } from './useHandleKeyUp';
export { default as useRequiresKey } from './useRequiresKey';
export { default as useMultipleKeys } from './useMultipleKeys';
export { default as useSpeechToText } from './useSpeechToText';
export { default as useTextToSpeech } from './useTextToSpeech';
export { default as useGetAudioSettings } from './useGetAudioSettings';
