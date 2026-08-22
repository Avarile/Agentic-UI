/**
 * Attaches the resolved application config to `req.config` for the request.
 *
 * Design: config is resolved per user (role and tenant can change overlays), and almost every
 * controller reads `req.config`, so resolving it once here avoids repeated cache/DB work
 * downstream. On failure it retries with tenant-only options before giving up — degrading to a
 * less specific config keeps the request serviceable, whereas failing outright would break
 * routes that only need base values.
 *
 * Connections:
 * - `getAppConfig` from `server/services/Config`; `getAppConfigOptionsFromUser` from
 *   `packages/api`
 * - exported through the middleware barrel as `configMiddleware`
 */
const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

const configMiddleware = async (req, res, next) => {
  try {
    req.config = await getAppConfig(getAppConfigOptionsFromUser(req.user));

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await getAppConfig({ tenantId: req.user?.tenantId });
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

module.exports = configMiddleware;
