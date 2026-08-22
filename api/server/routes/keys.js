/**
 * Stores and clears per-user provider credentials (BYOK API keys).
 *
 * Values are encrypted by the model layer (`updateUserKey`); this router only ever returns
 * *expiry* metadata via `getUserKeyExpiry`, never the key itself — a stored credential must not
 * be readable back through the API.
 *
 * Design: bulk delete requires an explicit `?all=true`, so a truncated request path cannot
 * wipe every key by accident.
 */
const express = require('express');
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.put('/', requireJwtAuth, async (req, res) => {
  if (req.body == null || typeof req.body !== 'object') {
    return res.status(400).send({ error: 'Invalid request body.' });
  }
  const { name, value, expiresAt } = req.body;
  await updateUserKey({ userId: req.user.id, name, value, expiresAt });
  res.status(201).send();
});

router.delete('/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', requireJwtAuth, async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

module.exports = router;
