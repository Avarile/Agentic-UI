// Invariants over the static query registry.
//
// Two of these are load-bearing rather than tidy:
//
//  - The source-level check that no expression contains a backtick or `${`.
//    Read off the file text, not off the values, because by the time a template
//    literal is a value it has already been evaluated and looks exactly like a
//    literal. Checking the source is what makes "nothing is ever spliced into
//    PromQL" a fact a reader can confirm in one grep.
//
//  - The `or`/`label_replace` accounting per bundle. `or` drops right-hand
//    samples whose label set already exists on the left, so a bundle operand
//    that forgot its label_replace, or reused another operand's `sc` value,
//    would silently vanish — a channel reading 'missing' forever with nothing
//    anywhere to say why.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUERIES, BUNDLE_LABEL, queryById } from './queries';

const SOURCE = readFileSync(join(__dirname, 'queries.ts'), 'utf8');

/**
 * The text of the QUERIES array with its comments removed.
 *
 * The comments have to go: several of them quote PromQL and this very rule in
 * backticks, so a naive whole-file scan would fail on its own documentation.
 * Every comment inside the array sits on its own line, which is what makes this
 * safe — and the assertions below refuse to run against an empty region, so a
 * rename cannot turn this into a test that passes by finding nothing.
 */
function queriesArraySource(): string {
  const start = SOURCE.indexOf('export const QUERIES');
  const end = SOURCE.indexOf('] as const;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const region = SOURCE.slice(start, end);
  return region
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('no expression is ever built', () => {
  it('locates the registry, so the checks below cannot pass vacuously', () => {
    const region = queriesArraySource();
    expect(region.length).toBeGreaterThan(2_000);
    for (const def of QUERIES) {
      expect(region).toContain(`id: '${def.id}'`);
    }
  });

  it('contains no template literal in the source of the registry', () => {
    expect(queriesArraySource()).not.toContain('`');
  });

  it('contains no interpolation in the source of the registry', () => {
    expect(queriesArraySource()).not.toContain('${');
  });

  it('has no interpolation left in any evaluated expression either', () => {
    for (const def of QUERIES) {
      expect(def.expr).not.toContain('`');
      expect(def.expr).not.toContain('${');
    }
  });

  it('never reaches the range endpoint, where a fine step over a long window bites', () => {
    for (const def of QUERIES) {
      expect(def.expr).not.toContain('query_range');
      expect(def.expr).not.toMatch(/\bstep\b/);
      expect(def.expr).not.toMatch(/\bstart\b/);
      expect(def.expr).not.toMatch(/\bend\b/);
    }
  });
});

describe('shape', () => {
  it('is the documented fifteen calls', () => {
    // A compile-time constant: it does not grow with modules or with viewers.
    // Pinned because the number appears in three file headers, and it has drifted
    // from them once already — the design was written against eight labelled
    // queries and `podsReady` made nine.
    expect(QUERIES).toHaveLength(15);
    expect(QUERIES.filter((q) => q.shape === 'labelled')).toHaveLength(9);
    expect(QUERIES.filter((q) => q.shape === 'bundle')).toHaveLength(6);
  });

  it('has unique ids, and finds every one of them', () => {
    const ids = QUERIES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(queryById(id)?.id).toBe(id);
    }
  });

  it('has no expression that is blank or untrimmed', () => {
    for (const def of QUERIES) {
      expect(def.expr.length).toBeGreaterThan(0);
      expect(def.expr).toBe(def.expr.trim());
    }
  });

  it('declares signals for bundles and only for bundles', () => {
    for (const def of QUERIES) {
      if (def.shape === 'bundle') {
        expect(def.signals?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(def.signals).toBeUndefined();
      }
    }
  });
});

describe('rate windows', () => {
  /** Every `[Nx]` range selector in the registry, in seconds. */
  function windows(): Array<{ id: string; raw: string; seconds: number }> {
    const unit: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };
    const found: Array<{ id: string; raw: string; seconds: number }> = [];
    for (const def of QUERIES) {
      for (const match of def.expr.matchAll(/\[(\d+)([smhd])\]/g)) {
        found.push({
          id: def.id,
          raw: match[0],
          seconds: Number(match[1]) * unit[match[2]],
        });
      }
    }
    return found;
  }

  it('are all at least two scrape intervals wide', () => {
    // Below 2× the 30s scrape a rate has fewer than two samples to work from
    // and reads as zero, which the scene would draw as an idle service.
    const all = windows();
    expect(all.length).toBeGreaterThan(0);
    for (const w of all) {
      expect(w.seconds).toBeGreaterThanOrEqual(60);
    }
  });

  it('are all the same width, so no two rates are smoothed differently', () => {
    expect(new Set(windows().map((w) => w.raw))).toEqual(new Set(['[5m]']));
  });
});

describe('bundles', () => {
  const bundles = QUERIES.filter((q) => q.shape === 'bundle');

  /**
   * The top-level operands of a bundle.
   *
   * Split on ` or ` *followed by* label_replace, because an operand may carry an
   * `or vector(0)` of its own — the idiom that turns an absent metric into a
   * zero — and a naive split on ` or ` would tear those in half.
   */
  function operandsOf(expr: string): string[] {
    return expr.split(/ or (?=label_replace\()/);
  }

  it.each(bundles.map((b) => [b.id, b] as const))('%s tags every operand', (_id, def) => {
    const signals = def.signals ?? [];
    const replacements = def.expr.match(/label_replace\(/g) ?? [];

    // One label_replace per signal, and one top-level operand per signal. An
    // operand that slipped in untagged would be dropped by `or` in silence.
    expect(replacements).toHaveLength(signals.length);
    expect(operandsOf(def.expr)).toHaveLength(signals.length);
  });

  it.each(bundles.map((b) => [b.id, b] as const))(
    '%s names each of its signals exactly once',
    (_id, def) => {
      const signals = def.signals ?? [];
      expect(new Set(signals).size).toBe(signals.length);
      for (const signal of signals) {
        const occurrences = def.expr.split(`"${BUNDLE_LABEL}", "${signal}"`).length - 1;
        expect(occurrences).toBe(1);
      }
    },
  );

  it.each(bundles.map((b) => [b.id, b] as const))(
    '%s aggregates every operand, so each yields one unlabelled sample',
    (_id, def) => {
      // Without an aggregation the operand keeps its `instance` label, a second
      // replica reintroduces a second series, and the `sc` keying that makes
      // `or` safe stops holding. Grouping defeats it the same way, which is why
      // `by (...)` and `without (...)` are forbidden here even though they are
      // exactly what the labelled queries above are built on.
      for (const operand of operandsOf(def.expr)) {
        expect(operand).toMatch(/\b(?:sum|avg|max|min|count)\(|\bvector\(/);
        expect(operand).not.toMatch(/\bby\s*\(/);
        expect(operand).not.toMatch(/\bwithout\s*\(/);
      }
    },
  );

  it('uses a short tag unlikely to collide with a real exporter label', () => {
    expect(BUNDLE_LABEL).toBe('sc');
  });
});
