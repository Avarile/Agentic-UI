/**
 * Boot-time check for pending permission migrations, with operator warnings.
 *
 * Checks whether agents and prompts still need their ACL permissions migrated
 * (`checkAgentPermissionsMigration`, `checkPromptPermissionsMigration`) and logs actionable
 * warnings if so.
 *
 * Design: it *warns* rather than migrating. A permissions migration rewrites access-control data
 * across every shared resource, so it must be an explicit, observable operator action — running
 * it implicitly at boot could silently change who can see what. Called last in the boot sequence
 * (after `app.listen`) because it needs every other subsystem initialized.
 *
 * Connections: called from `server/index.js`; helpers from `packages/api`
 */
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  logAgentMigrationWarning,
  logPromptMigrationWarning,
  checkAgentPermissionsMigration,
  checkPromptPermissionsMigration,
} = require('@librechat/api');
const { findRoleByIdentifier } = require('~/models');

/**
 * Check if permissions migrations are needed for shared resources
 * This runs at the end to ensure all systems are initialized
 */
async function checkMigrations() {
  try {
    const agentMigrationResult = await checkAgentPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
      },
      AgentModel: mongoose.models.Agent,
    });
    logAgentMigrationWarning(agentMigrationResult);
  } catch (error) {
    logger.error('Failed to check agent permissions migration:', error);
  }
  try {
    const promptMigrationResult = await checkPromptPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
      },
      PromptGroupModel: mongoose.models.PromptGroup,
    });
    logPromptMigrationWarning(promptMigrationResult);
  } catch (error) {
    logger.error('Failed to check prompt permissions migration:', error);
  }
}

module.exports = {
  checkMigrations,
};
