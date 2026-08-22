/**
 * Share-link access middleware, constructed from the `packages/api` factory.
 *
 * Only injects `mongoose`; the ACL logic lives in TypeScript in `packages/api` so it can be
 * shared and unit-tested independently of Express.
 *
 * Connections: used by `server/routes/share.js`
 */
const mongoose = require('mongoose');
const { createSharedLinkAccessMiddleware } = require('@librechat/api');

const canAccessSharedLink = createSharedLinkAccessMiddleware({ mongoose });

module.exports = canAccessSharedLink;
