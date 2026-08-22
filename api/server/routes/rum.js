/**
 * OTLP ingest proxy for browser Real User Monitoring beacons.
 *
 * Design:
 * - Returns 404 when the proxy is not configured, so an unconfigured deployment exposes no
 *   ingest surface at all.
 * - Uses `express.raw` with a protobuf/octet-stream type filter and its own body limit
 *   (`getRumProxyBodyLimit`) — OTLP payloads are binary and must not go through the global
 *   JSON parser.
 * - Authenticated by `requireRumProxyAuth` rather than the normal JWT gate: browser beacons
 *   (especially those sent during page unload via `sendBeacon`) cannot attach an Authorization
 *   header.
 *
 * Connections: proxy implementation from `packages/api`; config via
 * `server/services/Config/rum.js`
 */
const express = require('express');
const { getRumProxyBodyLimit, isRumProxyEnabled, proxyRumRequest } = require('@librechat/api');
const { requireRumProxyAuth } = require('~/server/middleware');

const router = express.Router();
const rawOtlpBody = express.raw({
  limit: getRumProxyBodyLimit(),
  type: ['application/x-protobuf', 'application/octet-stream'],
});

function requireRumProxyEnabled(_req, res, next) {
  if (!isRumProxyEnabled()) {
    return res.status(404).json({ message: 'RUM proxy is not configured' });
  }

  return next();
}

router.post(
  '/v1/traces',
  requireRumProxyEnabled,
  requireRumProxyAuth,
  rawOtlpBody,
  proxyRumRequest,
);
router.post('/v1/logs', requireRumProxyEnabled, requireRumProxyAuth, rawOtlpBody, proxyRumRequest);

module.exports = router;
