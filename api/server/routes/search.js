/**
 * Reports whether conversation search is usable: `GET /enable`.
 *
 * Design: returns `false` — never an error — when `SEARCH` is off *or* the MeiliSearch health
 * check fails. The client uses this purely to decide whether to show the search UI, so a
 * degraded search backend should hide the feature rather than surface an error. The health
 * check is live (not cached) so search reappears as soon as Meili recovers.
 *
 * Connections: index maintenance in `db/indexSync.js`
 */
const express = require('express');
const { MeiliSearch } = require('meilisearch');
const { isEnabled } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/enable', async function (req, res) {
  if (!isEnabled(process.env.SEARCH)) {
    return res.send(false);
  }

  try {
    const client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
    });

    const { status } = await client.health();
    return res.send(status === 'available');
  } catch (error) {
    return res.send(false);
  }
});

module.exports = router;
