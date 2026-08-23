// Polling for the System Core telemetry feed.
//
// Modelled on `useActiveJobs` (../SSE/queries.ts), with the module-level
// error-budget breaker from ../Files/queries.ts. Two queries, with very different
// cadences:
//
//   availability   once per session. Decides whether the entry point is offered
//                  at all, and the answer cannot change without a reload.
//   snapshot       every POLL_MS while the modal is open.
//
// WHY 20s AND NOT 30s
// -------------------
// Prometheus scrapes every 30s and the server caches for 25s. Polling *at* the
// scrape interval beats against scrape phase and drops one sample per drift
// cycle; polling faster than it guarantees at most one poll per sample. A
// duplicate tick is nearly free — after the binding layer's rounding every
// derived channel is identical, so the material registry returns the same object
// identities and R3F writes nothing to the GPU.
//
// WHY THE BREAKER IS COUNTED BY HAND
// ----------------------------------
// React Query v4 resets `state.fetchFailureCount` to 0 on every fetch dispatch,
// so it cannot count failures *across* polls — the same reason
// ../Files/queries.ts keeps its own counter. Unlike a file preview this poll has
// no terminal state, so the latch has to be openable: reopening the modal and the
// panel's retry both clear it, because reopening is the natural retry gesture.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  SystemCoreSnapshotResponse,
  SystemCoreAvailabilityResponse,
} from 'librechat-data-provider';
import store from '~/store';

/** One tick short of the 30s scrape, so a poll cannot systematically miss one. */
const POLL_MS = 20_000;

/**
 * The floor on a server-supplied interval.
 *
 * `nextPollMs` comes off the wire, so a misconfigured or hostile value must not
 * be able to turn this into a request loop.
 */
const POLL_FLOOR_MS = 10_000;

/** Roughly eighty seconds of silence before the poll gives up. */
export const SNAPSHOT_MAX_CONSECUTIVE_ERRORS = 4;

let consecutiveErrors = 0;

/**
 * The snapshot fetch, wrapped so failures can be counted across polls.
 *
 * A snapshot that arrives at all resets the count, including one reporting
 * partial failure: the endpoint answers 200 with the errors in the body, and
 * "eleven of fifteen queries worked" is a working poll.
 */
const fetchSnapshot = async (): Promise<SystemCoreSnapshotResponse> => {
  try {
    const data = await dataService.getSystemCoreSnapshot();
    consecutiveErrors = 0;
    return data;
  } catch (err) {
    consecutiveErrors += 1;
    throw err;
  }
};

/** Whether the breaker has latched. */
export const snapshotBreakerOpen = (): boolean =>
  consecutiveErrors >= SNAPSHOT_MAX_CONSECUTIVE_ERRORS;

/** Closes the breaker. Called when the modal opens and by the panel's retry. */
export const resetSnapshotBreaker = (): void => {
  consecutiveErrors = 0;
};

/**
 * The next interval, or false to stop.
 *
 * The server is asked how fast to poll rather than guessed at, so changing the
 * scrape interval on the cluster does not need a client release. Exported because
 * "how fast do we ask" is a policy worth pinning in a test rather than an
 * implementation detail — `nextPollMs` arrives over the wire, and the floor is
 * what stands between a bad value and a request loop.
 */
export const snapshotRefetchInterval = (
  data: SystemCoreSnapshotResponse | undefined,
): number | false => {
  if (snapshotBreakerOpen()) {
    return false;
  }
  // Not configured means there is nothing to poll for, and no amount of asking
  // again will change that until the server restarts.
  if (data != null && !data.configured) {
    return false;
  }
  const asked = data?.nextPollMs ?? 0;
  return Math.max(POLL_FLOOR_MS, asked > 0 ? Math.min(asked, POLL_MS) : POLL_MS);
};

/**
 * Whether to offer the System Core at all.
 *
 * Fetched rather than computed because the client cannot work it out:
 * `SystemCapabilities` is backend-only and never reaches the browser, and whether
 * a Prometheus is configured is server state. Same shape as
 * `useGetSearchEnabledQuery` (../Misc/queries.ts), which exists for exactly this
 * "ask before showing an affordance" purpose.
 */
export const useSystemCoreAvailability = (
  config?: UseQueryOptions<SystemCoreAvailabilityResponse>,
): QueryObserverResult<SystemCoreAvailabilityResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<SystemCoreAvailabilityResponse>(
    [QueryKeys.systemCoreAvailability],
    () => dataService.getSystemCoreAvailability(),
    {
      // The answer cannot change without a server restart, and a 403 must not be
      // retried on every window focus.
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useSystemCoreSnapshot = (
  config?: UseQueryOptions<SystemCoreSnapshotResponse>,
): QueryObserverResult<SystemCoreSnapshotResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<SystemCoreSnapshotResponse>([QueryKeys.systemCoreSnapshot], fetchSnapshot, {
    // Equal to the poll interval, which is what makes the three refetchOn*
    // settings below safe: a reopen or a window focus inside one interval reuses
    // the cache instead of firing an extra request.
    staleTime: POLL_MS,
    refetchInterval: snapshotRefetchInterval,
    // A background tab has its timers throttled, so coming back to a stale one is
    // exactly when a refetch earns its keep.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    // A retried poll is a duplicate sample, the next tick *is* the retry, and
    // retries would corrupt the consecutive-error count above.
    retry: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

/**
 * Clears the breaker and asks for a snapshot now.
 *
 * `invalidateQueries` rather than `refetch` so that a modal which is mounted but
 * whose query is disabled does not fire a request it would then discard.
 */
export const useRetrySystemCoreSnapshot = (): (() => void) => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    resetSnapshotBreaker();
    queryClient.invalidateQueries([QueryKeys.systemCoreSnapshot]);
  }, [queryClient]);
};
