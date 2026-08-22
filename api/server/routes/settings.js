/**
 * User preference endpoints: tool/entity favorites and active skills.
 *
 * Mounted under `/api/user/settings` by `server/routes/user.js`.
 *
 * Design: tool favorites are handled by `createToolFavoritesHandlers` from `packages/api` with
 * the model functions injected, while entity favorites and skill states use local controllers.
 * Every route carries `requireJwtAuth` individually rather than router-wide — these are all
 * strictly per-user data with no anonymous variant.
 */
const express = require('express');
const { createToolFavoritesHandlers } = require('@librechat/api');
const {
  updateFavoritesController,
  getFavoritesController,
} = require('~/server/controllers/FavoritesController');
const {
  getSkillStatesController,
  updateSkillStatesController,
} = require('~/server/controllers/SkillStatesController');
const { requireJwtAuth } = require('~/server/middleware');
const { getToolFavorites, addToolFavorite, removeToolFavorite } = require('~/models');

const router = express.Router();

const toolFavorites = createToolFavoritesHandlers({
  getToolFavorites,
  addToolFavorite,
  removeToolFavorite,
});

router.get('/favorites/tools', requireJwtAuth, toolFavorites.listToolFavorites);
router.put('/favorites/tools/:itemType/:itemId', requireJwtAuth, toolFavorites.addToolFavorite);
router.delete(
  '/favorites/tools/:itemType/:itemId',
  requireJwtAuth,
  toolFavorites.removeToolFavorite,
);
router.get('/favorites', requireJwtAuth, getFavoritesController);
router.post('/favorites', requireJwtAuth, updateFavoritesController);
router.get('/skills/active', requireJwtAuth, getSkillStatesController);
router.post('/skills/active', requireJwtAuth, updateSkillStatesController);

module.exports = router;
