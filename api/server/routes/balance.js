/**
 * Returns the caller's token balance.
 *
 * `setBalanceConfig` (from `packages/api`, wired with `getAppConfig`, `findBalanceByUser`,
 * `upsertBalanceFields`) runs first so a user with no balance record yet is initialized from
 * the configured defaults before the controller reads it — otherwise a fresh account would
 * report no balance rather than its starting allocation.
 *
 * Connections: controller `server/controllers/Balance.js`
 */
const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

router.get('/', requireJwtAuth, setBalanceConfig, controller);

module.exports = router;
