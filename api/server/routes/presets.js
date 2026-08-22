/**
 * CRUD for saved conversation presets (endpoint + parameter bundles).
 *
 * `requireJwtAuth` is applied router-wide; presets are strictly per-user, and every query is
 * scoped by `req.user.id`. A missing `presetId` is filled with a random UUID so the client can
 * create without pre-generating an id. Deletion is a `POST /delete` with a filter body rather
 * than `DELETE /:id`, which is what lets "delete all presets" be expressed as an empty
 * filter.
 */
const crypto = require('crypto');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { getPresets, savePreset, deletePresets } = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  const presets = (await getPresets(req.user.id)).map((preset) => preset);
  res.status(200).json(presets);
});

router.post('/', async (req, res) => {
  const update = req.body || {};

  update.presetId = update?.presetId || crypto.randomUUID();

  try {
    const preset = await savePreset(req.user.id, update);
    res.status(201).json(preset);
  } catch (error) {
    logger.error('[/presets] error saving preset', error);
    res.status(500).send('There was an error when saving the preset');
  }
});

router.post('/delete', async (req, res) => {
  let filter = {};
  const { presetId } = req.body || {};

  if (presetId) {
    filter = { presetId };
  }

  logger.debug('[/presets/delete] delete preset filter', filter);

  try {
    const deleteCount = await deletePresets(req.user.id, filter);
    res.status(201).json(deleteCount);
  } catch (error) {
    logger.error('[/presets/delete] error deleting presets', error);
    res.status(500).send('There was an error deleting the presets');
  }
});

module.exports = router;
