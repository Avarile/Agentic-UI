/**
 * Returns the active operator announcement banner, if any.
 *
 * Uses `optionalJwtAuth` because the banner should also be visible on the login screen; the
 * user (when present) is passed to `getBanner` so a banner can be audience-scoped.
 */
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const { getBanner } = require('~/models');

const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    res.status(200).send(await getBanner(req.user));
  } catch (error) {
    logger.error('[getBanner] Error getting banner', error);
    res.status(500).json({ message: 'Error getting banner' });
  }
});

module.exports = router;
