/**
 * Returns the caller's token balance.
 *
 * Design: reads `res.locals.balanceData` when `setBalanceConfig` already loaded it, avoiding a
 * second query on the common path, and returns 204 (not 404) when the balance feature is
 * disabled — "no balance system" is different from "no balance record". Auto-refill fields are
 * stripped when auto-refill is off, so the client cannot render a refill schedule that will
 * never run. `_id` is always removed.
 *
 * Connections: `setBalanceConfig` from `packages/api`; route `server/routes/balance.js`
 */
const { findBalanceByUser } = require('~/models');

async function balanceController(req, res) {
  const balanceLocals = res.locals || {};

  if (balanceLocals.balanceConfigEnabled === false) {
    return res.sendStatus(204);
  }

  const balanceData = balanceLocals.balanceData ?? (await findBalanceByUser(req.user.id));

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  const { _id: _, ...result } = balanceData;

  if (!result.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
  }

  res.status(200).json(result);
}

module.exports = balanceController;
