/**
 * OpenTelemetry on/off switch, exporting a uniform interface either way.
 *
 * Design: the module branches at *require* time and exports two shape-compatible objects — a
 * real controller with middleware when telemetry is on, and no-op passthrough middleware plus
 * `enabled: false` when it is off. Callers therefore never guard (`if (telemetry.enabled)` is
 * an optimization, not a requirement), and the heavy `@librechat/api/telemetry` subtree — SDK,
 * exporters, instrumentations — is never loaded in deployments that do not use it.
 *
 * `server/index.js` requires this on line 3, immediately after credentials: instrumentation
 * must monkey-patch `http`, `express`, `mongoose` and friends *before* those modules are
 * required by anything else, or spans will be missing.
 *
 * Enabling requires `OTEL_TRACING_ENABLED=true` *and* `OTEL_SDK_DISABLED` not truthy, so the
 * standard OTel kill switch works without touching app config.
 *
 * Connections:
 * - `telemetryMiddleware` / `telemetryErrorMiddleware` mounted in `server/index.js`
 * - implementation lives in `packages/api` (telemetry)
 */
require('dotenv').config();

function isTruthy(value) {
  return value?.trim().toLowerCase() === 'true';
}

function isTelemetryEnabled() {
  return isTruthy(process.env.OTEL_TRACING_ENABLED) && !isTruthy(process.env.OTEL_SDK_DISABLED);
}

if (isTelemetryEnabled()) {
  const {
    initializeTelemetry,
    telemetryMiddleware,
    telemetryErrorMiddleware,
  } = require('@librechat/api/telemetry');
  const controller = initializeTelemetry();

  module.exports = {
    get enabled() {
      return controller.enabled;
    },
    get status() {
      return controller.status;
    },
    shutdown: controller.shutdown,
    telemetryMiddleware,
    telemetryErrorMiddleware,
  };
} else {
  module.exports = {
    enabled: false,
    get status() {
      return 'disabled';
    },
    shutdown: async () => {},
    telemetryMiddleware: (_req, _res, next) => next(),
    telemetryErrorMiddleware: (err, _req, _res, next) => next(err),
  };
}
