// Identity-guarded submission cleanup after an abort.
//
// Small and load-bearing. The abort HTTP response can resolve *after* the aborted
// run's final SSE event already fired the interrupt drain and started the next
// submission. Clearing unconditionally at that point tears down the new run's
// stream before it attaches, and its placeholder finalizes empty — a bug that looks
// like "the model returned nothing". So the submission is captured before the round
// trip and cleared only if it is still current.

import { useRecoilCallback } from 'recoil';
import type { TSubmission } from 'librechat-data-provider';
import store from '~/store';

/**
 * Identity-guarded post-abort cleanup: the abort HTTP response can resolve
 * AFTER the aborted run's final SSE already fired the interrupt drain and
 * started the NEXT submission — clearing unconditionally at that point tears
 * down the new run's stream before it ever attaches, so its placeholder
 * finalizes empty. Capture the submission before the abort round-trip and
 * only clear when it is still the current one.
 */
export function useAbortCleanup(index: string | number) {
  const clearAllSubmissions = store.useClearSubmissionState();

  const captureSubmission = useRecoilCallback(
    ({ snapshot }) =>
      (): TSubmission | null =>
        snapshot.getLoadable(store.submissionByIndex(index)).getValue(),
    [index],
  );

  const clearSubmissionsUnlessReplaced = useRecoilCallback(
    ({ snapshot }) =>
      (captured: TSubmission | null) => {
        const current = snapshot.getLoadable(store.submissionByIndex(index)).getValue();
        if (current != null && current !== captured) {
          return;
        }
        clearAllSubmissions();
      },
    [clearAllSubmissions, index],
  );

  return { captureSubmission, clearSubmissionsUnlessReplaced };
}
