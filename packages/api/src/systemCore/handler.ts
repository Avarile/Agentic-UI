// The HTTP edge, and nothing else.
//
// Deliberately thin, and deliberately ignorant: it does not import ./queries, it
// reads nothing off the request but what the auth middleware put there, and the
// snapshot function it calls takes no arguments. So there is no route by which a
// query string, a body or a path param could reach a PromQL expression.
//
// ALWAYS 200 WHEN CONFIGURED
// --------------------------
// This diverges from ../admin/langfuse.ts, which 404s when its integration is
// unavailable, and the divergence is the point. This endpoint feeds a poll that
// drives a live visualisation: React Query treats any non-2xx as an error and
// discards the body, so a 503 for "three of fifteen queries failed" would throw
// away the eleven that worked and force the client to rebuild partial-failure
// semantics out of an error object. Instead the body always describes the state —
// configured or not, whole or partial — and the status code stays boring.
//
// Please do not "fix" this toward the langfuse shape.

import type { Request, Response } from 'express';
import type { SystemCoreAvailabilityResponse } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import { getSystemCoreSnapshot } from './snapshot';
import { isSystemCoreConfigured } from './config';

export interface SystemCoreHandlers {
  getSnapshot: (req: Request, res: Response) => Promise<void>;
  getAvailability: (req: Request, res: Response) => Promise<void>;
}

/**
 * A snapshot is a live reading and must never be reused by a cache in between.
 * `private` keeps it out of shared proxies; `no-store` keeps it out of the
 * browser's. The server's own TTL cache is what stops this hammering Prometheus.
 */
const NO_STORE = 'private, no-store';

export function createSystemCoreHandlers(): SystemCoreHandlers {
  return {
    async getSnapshot(_req: Request, res: Response): Promise<void> {
      try {
        const snapshot = await getSystemCoreSnapshot();
        res.set('Cache-Control', NO_STORE);
        res.status(200).json(snapshot);
      } catch (err) {
        // getSystemCoreSnapshot turns upstream failures into data, so reaching
        // here means a genuine defect rather than an unhealthy cluster.
        logger.error('[systemCore] failed to build a snapshot', err);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    },

    /**
     * Whether to offer the feature to this caller, and whether there is live data.
     *
     * Two separate answers, and conflating them was a bug worth naming: `enabled`
     * used to return `configured`, which hid the entry point on every deployment
     * without a Prometheus — the majority of them — and with it the fixture-only
     * scene that is supposed to be the fallback. The panel carries a chip reading
     * "Example data" for precisely that state, and nothing could reach it.
     *
     * `enabled` is authorization. Reaching this handler at all means the
     * capability middleware passed, so the answer is simply true; a caller without
     * ACCESS_ADMIN never arrives here, they get a 403, which the client reads as
     * closed. This is the half the client cannot work out for itself, because
     * `SystemCapabilities` is backend-only and never reaches the browser.
     *
     * `configured` is whether a feed exists. It drives the poll and the chip — not
     * whether the feature is offered.
     */
    async getAvailability(_req: Request, res: Response): Promise<void> {
      const body: SystemCoreAvailabilityResponse = {
        configured: isSystemCoreConfigured(),
        enabled: true,
      };
      res.set('Cache-Control', NO_STORE);
      res.status(200).json(body);
    },
  };
}
