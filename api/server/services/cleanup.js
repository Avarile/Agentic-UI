/**
 * Startup cleanup: removes conversations left null or empty by an interrupted request.
 *
 * Design: intentionally swallow-and-log. A failure here must never prevent boot — the data it
 * removes is cosmetic (empty conversation rows that would show as blank entries in the sidebar),
 * so the correct behaviour on error is to log and continue.
 *
 * Connections: `deleteNullOrEmptyConversations` from `~/models`
 */
const { logger } = require('@librechat/data-schemas');
const { deleteNullOrEmptyConversations } = require('~/models');

const cleanup = async () => {
  try {
    await deleteNullOrEmptyConversations();
  } catch (error) {
    logger.error('[cleanup] Error during app cleanup', error);
  } finally {
    logger.debug('Startup cleanup complete');
  }
};

module.exports = { cleanup };
