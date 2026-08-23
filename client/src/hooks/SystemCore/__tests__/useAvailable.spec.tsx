// The access gate.
//
// The feed is gated on ACCESS_ADMIN at the endpoint, so the only job here is not
// to offer an entry point the server will answer 403 to. Two properties matter
// and both are asserted directly: it is closed until the server says otherwise,
// and a refusal reads as closed rather than as an error state that leaks the
// affordance anyway.

import { renderHook, waitFor, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RecoilRoot } from 'recoil';

const mockGetAvailability = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getSystemCoreAvailability: () => mockGetAvailability(),
    },
  };
});

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

import useSystemCoreAvailable from '../useAvailable';
import SystemCoreButton from '~/components/Chat/SystemCoreButton';

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>{children}</RecoilRoot>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSystemCoreAvailable', () => {
  it('is closed until the server has answered', () => {
    // Never offer first and withdraw later: a button that vanishes is worse than
    // one that appears.
    mockGetAvailability.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useSystemCoreAvailable(), { wrapper: wrapper() });
    expect(result.current).toBe(false);
  });

  it('opens when the server says this caller may read the feed', async () => {
    mockGetAvailability.mockResolvedValue({ configured: true, enabled: true });
    const { result } = renderHook(() => useSystemCoreAvailable(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays closed when the server says this caller may not read the feed', async () => {
    mockGetAvailability.mockResolvedValue({ configured: true, enabled: false });
    const { result } = renderHook(() => useSystemCoreAvailable(), { wrapper: wrapper() });
    await waitFor(() => expect(mockGetAvailability).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('opens with no feed configured, because the fixture scene is the fallback', async () => {
    // This case had the assertion backwards, which is how the entry point came to
    // be hidden on every deployment without a Prometheus. `configured` says
    // whether there is live data; it does not say whether the feature exists.
    mockGetAvailability.mockResolvedValue({ configured: false, enabled: true });
    const { result } = renderHook(() => useSystemCoreAvailable(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reads a refusal as closed, not as an error to recover from', async () => {
    // A non-admin gets 403. `retry: false` means that costs one request, and the
    // undefined data resolves to a clean false rather than to a retry loop.
    mockGetAvailability.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useSystemCoreAvailable(), { wrapper: wrapper() });
    await waitFor(() => expect(mockGetAvailability).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it('asks once however many callers there are', async () => {
    // Three call sites — the button, the sidebar link and the poll — share one
    // query key and staleTime: Infinity.
    mockGetAvailability.mockResolvedValue({ configured: true, enabled: true });
    const Wrapper = wrapper();
    const { result } = renderHook(
      () => [useSystemCoreAvailable(), useSystemCoreAvailable(), useSystemCoreAvailable()],
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(mockGetAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('SystemCoreButton', () => {
  it('renders nothing at all when the feed is not on offer', async () => {
    mockGetAvailability.mockResolvedValue({ configured: true, enabled: false });
    render(<SystemCoreButton />, { wrapper: wrapper() });

    await waitFor(() => expect(mockGetAvailability).toHaveBeenCalled());
    expect(screen.queryByTestId('system-core-button')).not.toBeInTheDocument();
  });

  it('renders even with no Prometheus configured', async () => {
    // The scene falls back to the bundled fixture and the panel says "Example
    // data". Hiding the button here left that state with no way in.
    mockGetAvailability.mockResolvedValue({ configured: false, enabled: true });
    render(<SystemCoreButton />, { wrapper: wrapper() });

    expect(await screen.findByTestId('system-core-button')).toBeInTheDocument();
  });

  it('renders nothing when the caller is refused', async () => {
    mockGetAvailability.mockRejectedValue(new Error('Forbidden'));
    render(<SystemCoreButton />, { wrapper: wrapper() });

    await waitFor(() => expect(mockGetAvailability).toHaveBeenCalled());
    expect(screen.queryByTestId('system-core-button')).not.toBeInTheDocument();
  });

  it('renders the entry point once the server allows it', async () => {
    mockGetAvailability.mockResolvedValue({ configured: true, enabled: true });
    render(<SystemCoreButton />, { wrapper: wrapper() });

    expect(await screen.findByTestId('system-core-button')).toBeInTheDocument();
  });
});
