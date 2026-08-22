// Rendering-side concerns for messages: content metadata, expansion, scrolling,
// copying, attachments, and the per-message action set.
//
// Nothing here sends or receives. These hooks exist because the message list is the
// performance-critical subtree, and each isolates a subscription or a measurement
// so that a change in one message does not re-render the tree.

export { default as useProgress } from './useProgress';
export {
  MESSAGE_CONTENT_LAYOUT_CHANGE_EVENT,
  dispatchMessageContentLayoutChange,
  getRenderedContentMaxScrollTop,
  reconcileMessageContentLayout,
  scheduleMessageContentLayoutReconcile,
} from './messageLayout';
export { EXPAND_TRANSITION } from './useExpandCollapse';
export { default as useAttachments } from './useAttachments';
export { default as useSubmitMessage } from './useSubmitMessage';
export type { ContentMetadataResult } from './useContentMetadata';
export { default as useExpandCollapse } from './useExpandCollapse';
export { default as useMessageActions } from './useMessageActions';
export { useLatestMessage, useLatestMessageId } from './useLatestMessage';
export { default as useMemoizedChatContext } from './useMemoizedChatContext';
export { default as useMessageProcess } from './useMessageProcess';
export { default as useMessageHelpers } from './useMessageHelpers';
export { default as useCopyToClipboard } from './useCopyToClipboard';
export { default as useContentMetadata } from './useContentMetadata';
export { default as useMessageScrolling } from './useMessageScrolling';
export { default as useSmoothStreaming } from './useSmoothStreaming';
