// The poll's two behaviours that are not React Query's defaults.
//
//   1. The breaker latches after N *consecutive* failures and can be reopened.
//      React Query v4 resets `fetchFailureCount` on every fetch dispatch, so this
//      counter is the only thing that can see across polls — and unlike a file
//      preview, this poll has no terminal state, so a latch with no way out would
//      be a permanently dead scene.
//   2. A server-supplied `nextPollMs` is floored. It arrives over the wire, so a
//      zero or a hostile value must not be able to turn the poll into a loop.

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SystemCoreSnapshotResponse } from 'librechat-data-provider';
import snapshotFixture from '~/components/SystemCore/live/__tests__/__fixtures__/snapshot.json';

const mockGetSnapshot = jest.fn();
const mockGetAvailability = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getSystemCoreSnapshot: () => mockGetSnapshot(),
      getSystemCoreAvailability: () => mockGetAvailability(),
    },
  };
});

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: () => true,
}));

import {
  resetSnapshotBreaker,
  snapshotBreakerOpen,
  useSystemCoreSnapshot,
  snapshotRefetchInterval,
  useSystemCoreAvailability,
  SNAPSHOT_MAX_CONSECUTIVE_ERRORS,
} from '../queries';

const snapshot = snapshotFixture as unknown as SystemCoreSnapshotResponse;

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnapshotBreaker();
  mockGetSnapshot.mockResolvedValue(snapshot);
  mockGetAvailability.mockResolvedValue({ configured: true, enabled: true });
});

describe('useSystemCoreAvailability', () => {
  it('asks once and answers whether to offer the feature', async () => {
    const { result } = renderHook(() => useSystemCoreAvailability(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ configured: true, enabled: true });
    expect(mockGetAvailability).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled, so the login screen stays quiet', async () => {
    // Firing here would hit the 401 path and trip request.ts' redirect-to-login.
    renderHook(() => useSystemCoreAvailability({ enabled: false }), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetAvailability).not.toHaveBeenCalled();
  });

  it('does not retry a refusal', async () => {
    mockGetAvailability.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useSystemCoreAvailability(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // A 403 is a decision, not a transient failure.
    expect(mockGetAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('useSystemCoreSnapshot', () => {
  it('fetches a snapshot when enabled', async () => {
    const { result } = renderHook(() => useSystemCoreSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.modules).toHaveLength(28);
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useSystemCoreSnapshot({ enabled: false }), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });

  it('does not retry a failed poll — the next tick is the retry', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useSystemCoreSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // A retried poll is a duplicate sample, and it would corrupt the counter.
    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('the breaker', () => {
  it('starts closed', () => {
    expect(snapshotBreakerOpen()).toBe(false);
  });

  it('latches after the configured number of consecutive failures', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('down'));

    for (let attempt = 0; attempt < SNAPSHOT_MAX_CONSECUTIVE_ERRORS; attempt += 1) {
      expect(snapshotBreakerOpen()).toBe(false);
      const { result, unmount } = renderHook(() => useSystemCoreSnapshot(), {
        wrapper: wrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      unmount();
    }

    expect(snapshotBreakerOpen()).toBe(true);
  });

  it('is reset by a snapshot that arrives, however broken', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('down'));
    const first = renderHook(() => useSystemCoreSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    first.unmount();

    // A snapshot reporting partial failure is still a working poll: the endpoint
    // answers 200 with the errors in the body.
    mockGetSnapshot.mockResolvedValue({
      ...snapshot,
      errors: [{ source: 'sqlBundle', code: 'unreachable', message: 'could not reach Prometheus' }],
    });
    const second = renderHook(() => useSystemCoreSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(snapshotBreakerOpen()).toBe(false);
  });

  it('can be reopened by hand, because the poll has no terminal state', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('down'));
    for (let attempt = 0; attempt < SNAPSHOT_MAX_CONSECUTIVE_ERRORS; attempt += 1) {
      const { result, unmount } = renderHook(() => useSystemCoreSnapshot(), {
        wrapper: wrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      unmount();
    }
    expect(snapshotBreakerOpen()).toBe(true);

    resetSnapshotBreaker();
    expect(snapshotBreakerOpen()).toBe(false);
  });

  it('gives up after roughly eighty seconds of silence', () => {
    // Documented rather than derived, so a change to either number is deliberate:
    // four polls at twenty seconds.
    expect(SNAPSHOT_MAX_CONSECUTIVE_ERRORS).toBe(4);
  });
});

describe('the poll interval', () => {
  it('polls faster than the scrape, so it cannot systematically miss a sample', () => {
    // Polling *at* 30s beats against scrape phase and drops one sample per drift
    // cycle. A duplicate tick is nearly free; a missed one is a visible stall.
    expect(snapshotRefetchInterval(snapshot)).toBeLessThanOrEqual(20_000);
  });

  it('honours a server that asks to be polled less often', () => {
    expect(snapshotRefetchInterval({ ...snapshot, nextPollMs: 15_000 })).toBe(15_000);
  });

  it('never polls faster than the floor, whatever the server asks for', () => {
    // `nextPollMs` is remote input. Without the floor, a zero or a negative would
    // turn this into a request loop against the admin's own cluster.
    for (const nextPollMs of [0, 1, -1, -100_000, 500, NaN]) {
      const interval = snapshotRefetchInterval({ ...snapshot, nextPollMs });
      expect(interval).toBeGreaterThanOrEqual(10_000);
    }
  });

  it('caps at the client interval, so a huge value cannot freeze the scene', () => {
    expect(snapshotRefetchInterval({ ...snapshot, nextPollMs: 3_600_000 })).toBe(20_000);
  });

  it('stops entirely once the feed reports itself unconfigured', () => {
    // No amount of asking again changes an unset environment variable.
    expect(snapshotRefetchInterval({ ...snapshot, configured: false })).toBe(false);
  });

  it('stops once the breaker has latched', async () => {
    mockGetSnapshot.mockRejectedValue(new Error('down'));
    for (let attempt = 0; attempt < SNAPSHOT_MAX_CONSECUTIVE_ERRORS; attempt += 1) {
      const { result, unmount } = renderHook(() => useSystemCoreSnapshot(), {
        wrapper: wrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      unmount();
    }

    expect(snapshotRefetchInterval(snapshot)).toBe(false);
  });

  it('polls on the default interval before the first snapshot arrives', () => {
    expect(snapshotRefetchInterval(undefined)).toBe(20_000);
  });
});
