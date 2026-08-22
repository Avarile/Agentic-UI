/**
 * The data-access surface for the entire backend — every DB method the app calls.
 *
 * Builds the method set once via `createMethods(mongoose, ...)` from `packages/data-schemas`
 * and spreads it into the module exports, then adds `seedDatabase` for boot-time seeding
 * (roles, default roles, categories, system grants).
 *
 * Design: model *methods* live in `packages/data-schemas` (shareable across backend
 * projects per the workspace boundaries) while this file is the thin JS binding that injects
 * the runtime dependencies those methods need — model-name matching helpers from
 * `packages/api` and the cache accessor from `cache/getLogStores.js`. That inversion is why
 * `packages/data-schemas` can stay free of app-level imports.
 *
 * `seedDatabase` groups the four idempotent seed steps in dependency order so
 * `server/index.js` has a single `runAsSystem(seedDatabase)` call rather than four.
 *
 * Connections:
 * - imported as `~/models` by controllers, services, middleware and strategies throughout
 * - `getCache` wiring means role lookups are cached via `CacheKeys.ROLES`
 * - called at boot by `server/index.js`
 */
const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const { matchModelName, findMatchingPattern, isDeploymentSkillId } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  isExternalSkillId: isDeploymentSkillId,
  getCache: getLogStores,
});

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
  await methods.seedSystemGrants();
};

module.exports = {
  ...methods,
  seedDatabase,
};
