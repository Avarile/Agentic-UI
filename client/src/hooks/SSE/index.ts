// The receive side: consuming a generation's event stream and folding it into state.
//
// Entry point is `useAdaptiveSSE`. The per-event-type handlers (`useStepHandler`,
// `useContentHandler`, `useAttachmentHandler`, `useUsageHandler`) are exported for
// reuse and for tests, but feature code should not wire them up directly.

export { default as useSSE } from './useSSE';
export { default as useResumableSSE } from './useResumableSSE';
export { default as useAdaptiveSSE } from './useAdaptiveSSE';
export { default as useResumeOnLoad } from './useResumeOnLoad';
export { default as useStepHandler } from './useStepHandler';
export { default as useUsageHandler } from './useUsageHandler';
export { default as useContentHandler } from './useContentHandler';
export { default as useAttachmentHandler } from './useAttachmentHandler';
