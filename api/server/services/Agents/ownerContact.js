/**
 * Attaches owner/support contact information to a list of agents.
 *
 * `attachOwnerContacts(agents)` resolves who to contact about a shared agent, so the UI can
 * show a support path on an agent the viewer does not own.
 *
 * Design:
 * - Agents that already declare a support contact (`hasSupportContact`) are skipped, so an
 *   explicit contact always wins over an inferred owner.
 * - Owners are resolved in **one batched query** for all remaining agents
 *   (`getFirstOwnerIdsByResource`) rather than per agent — this runs on list endpoints, where a
 *   per-row lookup would be an N+1.
 * - "Owner" is defined as the principal holding the full bit set
 *   (`VIEW|EDIT|DELETE|SHARE`), so a merely-shared collaborator is never surfaced as the contact.
 *
 * Connections: `server/routes/agents/actions.js` and the agent listing paths;
 * `resolveAgentOwnerContact` from `packages/api`
 */
const { logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PermissionBits } = require('librechat-data-provider');
const { hasSupportContact, resolveAgentOwnerContact } = require('@librechat/api');
const db = require('~/models');

const OWNER_PERMISSION_BITS =
  PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE;

const getFirstOwnerIdsByResource = async (agents) => {
  const resourceIds = agents
    .filter((agent) => !hasSupportContact(agent))
    .map((agent) => agent?._id)
    .filter(Boolean);

  if (resourceIds.length === 0) {
    return new Map();
  }

  try {
    const entries = await db.aggregateAclEntries([
      {
        $match: {
          resourceType: ResourceType.AGENT,
          resourceId: { $in: resourceIds },
          principalType: PrincipalType.USER,
          permBits: OWNER_PERMISSION_BITS,
        },
      },
      { $sort: { grantedAt: 1, createdAt: 1, _id: 1 } },
      { $group: { _id: '$resourceId', principalId: { $first: '$principalId' } } },
    ]);

    return new Map(
      entries
        .map((entry) => [entry?._id?.toString(), entry?.principalId?.toString()])
        .filter(([resourceId, ownerId]) => resourceId && ownerId),
    );
  } catch (error) {
    logger.warn('[/Agents] Failed to resolve agent owner ACL entries', error);
    return new Map();
  }
};

const attachOwnerContacts = async (agents) => {
  if (!Array.isArray(agents) || agents.length === 0) {
    return agents;
  }

  const ownerIdsByResource = await getFirstOwnerIdsByResource(agents);
  const ownerIds = [
    ...new Set(
      agents
        .filter((agent) => !hasSupportContact(agent))
        .map((agent) => ownerIdsByResource.get(agent?._id?.toString()) ?? agent?.author?.toString())
        .filter(Boolean),
    ),
  ];

  let ownersById = new Map();
  if (ownerIds.length > 0) {
    try {
      const users = await db.findUsers({ _id: { $in: ownerIds } }, 'name username');
      ownersById = new Map(users.map((user) => [user?._id?.toString(), user]));
    } catch (error) {
      logger.warn('[/Agents] Failed to resolve agent owner users', error);
    }
  }

  return agents.map((agent) => {
    if (hasSupportContact(agent)) {
      delete agent.owner_contact;
      return agent;
    }
    const ownerId = ownerIdsByResource.get(agent?._id?.toString()) ?? agent?.author?.toString();
    const ownerContact = resolveAgentOwnerContact(agent, ownersById.get(ownerId) ?? null);
    if (ownerContact) {
      agent.owner_contact = ownerContact;
    } else {
      delete agent.owner_contact;
    }
    return agent;
  });
};

module.exports = {
  attachOwnerContacts,
};
