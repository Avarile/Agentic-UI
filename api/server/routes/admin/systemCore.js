/**
 * Admin API for the System Core live telemetry feed.
 *
 * `GET /snapshot` — one normalized reading of the cluster, always 200 when the feed is
 * configured; partial failure travels in the body rather than in the status code, because the
 * client is a poll driving a live visualisation and React Query discards the body of a non-2xx.
 * `GET /availability` — whether to offer the feature to this caller at all.
 *
 * Design: both handlers take nothing off the request, and `getSystemCoreSnapshot()` takes no
 * arguments, so there is no route by which a query string, a body or a path param could reach a
 * PromQL expression. Read-only throughout, so there is no write capability to gate separately —
 * ACCESS_ADMIN alone is the whole authorization story.
 *
 * Connections: handlers from `createSystemCoreHandlers` (`packages/api`)
 */
const express = require('express');
const { createSystemCoreHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const handlers = createSystemCoreHandlers();

router.use(requireJwtAuth, requireCapability(SystemCapabilities.ACCESS_ADMIN));

router.get('/snapshot', handlers.getSnapshot);
router.get('/availability', handlers.getAvailability);

module.exports = router;
