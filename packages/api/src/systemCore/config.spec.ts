// Real env objects throughout — getSystemCoreConfig takes one, so there is no
// reason to mutate process.env and no way for these cases to interfere.

import { getSystemCoreConfig, isSystemCoreConfigured } from './config';

const URL_VAR = 'SYSTEM_CORE_PROMETHEUS_URL';

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { [URL_VAR]: 'http://prometheus.infra.svc.cluster.local:9090', ...overrides };
}

function configFrom(overrides: Record<string, string> = {}) {
  const result = getSystemCoreConfig(env(overrides));
  if (!result.ok) {
    throw new Error(`expected a config, got ${result.reason}`);
  }
  return result.config;
}

describe('the switch', () => {
  it('is off when the URL is unset', () => {
    expect(getSystemCoreConfig({})).toEqual({ ok: false, reason: 'unset' });
  });

  it('is off when the URL is blank or whitespace', () => {
    expect(getSystemCoreConfig({ [URL_VAR]: '' })).toEqual({ ok: false, reason: 'unset' });
    expect(getSystemCoreConfig({ [URL_VAR]: '   ' })).toEqual({ ok: false, reason: 'unset' });
  });

  it('reports a bad URL as bad rather than as absent', () => {
    // The two are not the same operator mistake, and the client says so.
    expect(getSystemCoreConfig({ [URL_VAR]: 'prometheus:9090' }).ok).toBe(false);
    expect(getSystemCoreConfig({ [URL_VAR]: 'prometheus:9090' })).toEqual({
      ok: false,
      reason: 'invalid_url',
    });
  });

  it('is on for a well-formed http or https URL', () => {
    expect(getSystemCoreConfig({ [URL_VAR]: 'http://prom:9090' }).ok).toBe(true);
    expect(getSystemCoreConfig({ [URL_VAR]: 'https://prom.example.test' }).ok).toBe(true);
  });

  it('agrees with the cheap predicate', () => {
    expect(isSystemCoreConfigured({})).toBe(false);
    expect(isSystemCoreConfigured({ [URL_VAR]: 'nonsense' })).toBe(false);
    expect(isSystemCoreConfigured(env())).toBe(true);
  });
});

describe('URL validation', () => {
  it.each([
    ['not a url at all', 'nonsense'],
    ['a bare host and port', 'prometheus:9090'],
    ['a scheme we do not speak', 'ftp://prom:9090'],
    ['a file URL', 'file:///etc/passwd'],
    ['embedded credentials', 'http://user:secret@prom:9090'],
    ['a username alone', 'http://user@prom:9090'],
    ['a query string', 'http://prom:9090?query=up'],
    ['a fragment', 'http://prom:9090#frag'],
  ])('rejects %s', (_why, raw) => {
    expect(getSystemCoreConfig({ [URL_VAR]: raw })).toEqual({
      ok: false,
      reason: 'invalid_url',
    });
  });

  it('rejects rather than strips, so a surprising value never half-works', () => {
    // Credentials and a query string both mean the value was not what whoever
    // set it believed it was. Quietly dropping the part we dislike would start
    // the feature against a destination nobody chose.
    expect(getSystemCoreConfig({ [URL_VAR]: 'http://u:p@prom:9090?x=1' }).ok).toBe(false);
  });

  it('normalizes the base so a path prefix survives resolution', () => {
    // The bug this exists to prevent: `new URL('/api/v1/query', base)` throws a
    // path prefix away, so a Prometheus at /prom would be queried at the root
    // and 404 on every request.
    expect(configFrom({ [URL_VAR]: 'https://host/prom' }).baseUrl.href).toBe('https://host/prom/');
    expect(
      new URL('api/v1/query', configFrom({ [URL_VAR]: 'https://host/prom' }).baseUrl).href,
    ).toBe('https://host/prom/api/v1/query');
  });

  it('leaves an already-rooted base alone', () => {
    expect(configFrom({ [URL_VAR]: 'http://prom:9090' }).baseUrl.href).toBe('http://prom:9090/');
    expect(
      new URL('api/v1/query', configFrom({ [URL_VAR]: 'http://prom:9090' }).baseUrl).href,
    ).toBe('http://prom:9090/api/v1/query');
  });

  it('trims surrounding whitespace', () => {
    expect(configFrom({ [URL_VAR]: '  http://prom:9090  ' }).baseUrl.href).toBe(
      'http://prom:9090/',
    );
  });
});

describe('defaults', () => {
  it('are the documented ones', () => {
    expect(configFrom()).toEqual({
      baseUrl: expect.any(URL),
      timeoutMs: 5_000,
      cacheTtlMs: 25_000,
      scrapeIntervalSeconds: 30,
      staleAfterSeconds: 90,
      staleMaxMs: 300_000,
    });
  });

  it('keep the cache TTL at or below the scrape interval', () => {
    // Above it, a refresh can systematically land between scrapes and skip a
    // sample; the whole point of the default pair is that it cannot.
    const config = configFrom();
    expect(config.cacheTtlMs).toBeLessThanOrEqual(config.scrapeIntervalSeconds * 1000);
  });
});

describe('clamping', () => {
  it.each([
    ['SYSTEM_CORE_TIMEOUT_MS', 'timeoutMs', '1', 500],
    ['SYSTEM_CORE_TIMEOUT_MS', 'timeoutMs', '-9999', 500],
    ['SYSTEM_CORE_TIMEOUT_MS', 'timeoutMs', '999999', 30_000],
    ['SYSTEM_CORE_TIMEOUT_MS', 'timeoutMs', '2500', 2_500],
    ['SYSTEM_CORE_CACHE_TTL_MS', 'cacheTtlMs', '0', 5_000],
    ['SYSTEM_CORE_CACHE_TTL_MS', 'cacheTtlMs', '99999999', 300_000],
    ['SYSTEM_CORE_CACHE_TTL_MS', 'cacheTtlMs', '10000', 10_000],
    ['SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS', 'scrapeIntervalSeconds', '1', 5],
    ['SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS', 'scrapeIntervalSeconds', '99999', 600],
    ['SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS', 'scrapeIntervalSeconds', '15', 15],
    ['SYSTEM_CORE_STALE_MAX_MS', 'staleMaxMs', '-1', 0],
    ['SYSTEM_CORE_STALE_MAX_MS', 'staleMaxMs', '99999999', 3_600_000],
  ])('%s=%s clamps %s to %i', (variable, field, raw, expected) => {
    const config = configFrom({ [variable]: raw }) as unknown as Record<string, number>;
    expect(config[field]).toBe(expected);
  });

  it.each(['', '   ', 'abc', 'NaN', 'Infinity', '1e', 'null'])(
    'falls back to the default for the unparseable value %p',
    (raw) => {
      // '' and '   ' are the interesting two: Number('') is 0, which is finite,
      // so a blank variable would otherwise clamp to the floor instead of
      // meaning "unset" — a 500ms timeout from a line that looks like nothing.
      expect(configFrom({ SYSTEM_CORE_TIMEOUT_MS: raw }).timeoutMs).toBe(5_000);
    },
  );

  it('still honours a real zero by clamping it into range', () => {
    expect(configFrom({ SYSTEM_CORE_STALE_MAX_MS: '0' }).staleMaxMs).toBe(0);
    expect(configFrom({ SYSTEM_CORE_TIMEOUT_MS: '0' }).timeoutMs).toBe(500);
  });

  it('truncates a fractional value toward zero rather than rounding', () => {
    expect(configFrom({ SYSTEM_CORE_TIMEOUT_MS: '1500.9' }).timeoutMs).toBe(1_500);
  });

  it('derives staleness from the scrape interval, always three of them', () => {
    for (const [interval, expected] of [
      ['5', 15],
      ['30', 90],
      ['600', 1_800],
    ] as const) {
      const config = configFrom({ SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS: interval });
      expect(config.staleAfterSeconds).toBe(expected);
      expect(config.staleAfterSeconds).toBe(config.scrapeIntervalSeconds * 3);
    }
  });

  it('derives staleness from the clamped interval, not the raw one', () => {
    // A hostile value must not reach the derived field through the back door.
    expect(configFrom({ SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS: '99999' }).staleAfterSeconds).toBe(
      1_800,
    );
  });
});
