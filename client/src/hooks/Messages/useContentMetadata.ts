// Whether a message contains parallel content — any content part carrying a
// `groupId`.
//
// Parallel parts are rendered side by side rather than sequentially, so the
// renderer has to know before it lays anything out. Memoized on the content array
// so the check runs once per message rather than per part.

import { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';

export type ContentMetadataResult = {
  /** Whether the message has parallel content (content with groupId) */
  hasParallelContent: boolean;
};

/**
 * Hook to check if a message has parallel content.
 * Returns whether any content part has a groupId.
 *
 * @param message - The message to check
 * @returns ContentMetadataResult with hasParallelContent boolean
 */
export default function useContentMetadata(
  message: TMessage | null | undefined,
): ContentMetadataResult {
  return useMemo(() => {
    const content = message?.content;
    if (!content || !Array.isArray(content)) {
      return { hasParallelContent: false };
    }

    // Check if any content part has a groupId (TMessageContentParts now includes ContentMetadata)
    const hasParallelContent = content.some((part) => part?.groupId != null);

    return { hasParallelContent };
  }, [message?.content]);
}
