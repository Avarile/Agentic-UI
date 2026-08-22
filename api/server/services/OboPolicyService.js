/**
 * Trust policy deciding whether an MCP server config may perform an OBO token exchange.
 *
 * `createOboTrustChecker()` returns the predicate the MCP runtime calls before exchanging a
 * token on the user's behalf.
 *
 * Design: OBO delegation is a privilege escalation surface — a user-created MCP server config
 * that could trigger an exchange would obtain a downstream token minted for that user's
 * identity. `isDbSourced` therefore identifies user-created configs using the same
 * `isUserSourced` heuristics as the rest of the MCP layer (explicit `source` is authoritative;
 * otherwise `dbId` presence), and the checker defers to `isOboConfigStillTrusted` so a config
 * that was trusted when saved but has since been altered no longer qualifies.
 *
 * Connections: used by the MCP runtime via `server/services/MCP.js`; predicate implementation in
 * `packages/api`
 */
const { isOboConfigStillTrusted } = require('@librechat/api');
const db = require('~/models');

/**
 * Checks whether a parsed MCP server config is DB-sourced (user-created) using
 * the same `isUserSourced` heuristics as the rest of the MCP layer: an explicit
 * `source` is authoritative when present; otherwise `dbId` presence is used.
 */
function isDbSourced({ source, dbId }) {
  if (source != null) {
    return source === 'user';
  }
  return !!dbId;
}

/**
 * Builds the predicate the MCP runtime calls before performing an OBO token exchange.
 *
 * YAML/Config-sourced configs (admin-defined) bypass the check — admins are
 * already trusted at the deployment level. DB-sourced configs (created via the
 * UI) are gated on the original author still holding `MCP_SERVERS.CONFIGURE_OBO`,
 * so retained configs fail closed when an author's role is downgraded.
 */
function createOboTrustChecker() {
  return async ({ source, author, dbId }) => {
    if (!isDbSourced({ source, dbId })) {
      return true;
    }
    return isOboConfigStillTrusted({
      authorId: author,
      getUserRoleByAuthorId: async (userId) => {
        const user = await db.findUser({ _id: userId }, 'role');
        return user?.role;
      },
      getRolePermissions: async (roleName) => {
        const role = await db.getRoleByName(roleName);
        return role?.permissions;
      },
    });
  };
}

module.exports = { createOboTrustChecker };
