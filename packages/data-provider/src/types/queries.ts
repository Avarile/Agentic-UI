import type { InfiniteData } from '@tanstack/react-query';
import type * as p from '../accessPermissions';
import type * as a from '../types/agents';
import type * as s from '../schemas';
import type * as t from '../types';

export type Conversation = {
  id: string;
  createdAt: number;
  participants: string[];
  lastMessage: string;
  conversations: s.TConversation[];
};

export type ConversationListParams = {
  cursor?: string;
  isArchived?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
  tags?: string[];
  search?: string;
  projectId?: string;
};

export type MinimalConversation = Pick<
  s.TConversation,
  'conversationId' | 'endpoint' | 'title' | 'createdAt' | 'updatedAt' | 'user' | 'chatProjectId'
>;

export type ConversationListResponse = {
  conversations: MinimalConversation[];
  nextCursor: string | null;
};

export type ConversationData = InfiniteData<ConversationListResponse>;
export type ConversationUpdater = (
  data: ConversationData,
  conversation: s.TConversation,
) => ConversationData;

export type ProjectListParams = {
  cursor?: string;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'lastConversationAt';
  sortDirection?: 'asc' | 'desc';
  search?: string;
};

export type ProjectListResponse = {
  projects: t.TChatProject[];
  nextCursor: string | null;
};

export type ProjectData = InfiniteData<ProjectListResponse>;

/* Messages */
export type MessagesListParams = {
  cursor?: string | null;
  sortBy?: 'endpoint' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
  conversationId?: string;
  messageId?: string;
  search?: string;
};

export type MessagesListResponse = {
  messages: s.TMessage[];
  nextCursor: string | null;
};

/* Shared Links */
export type SharedMessagesResponse = Omit<s.TSharedLink, 'messages'> & {
  messages: s.TMessage[];
};

export interface SharedLinksListParams {
  pageSize: number;
  sortBy: 'title' | 'createdAt';
  sortDirection: 'asc' | 'desc';
  search?: string;
  cursor?: string;
}

export type SharedLinkItem = {
  shareId: string;
  title: string;
  createdAt: string;
  conversationId: string;
};

export interface SharedLinksResponse {
  links: SharedLinkItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface SharedLinkQueryData {
  pages: SharedLinksResponse[];
  pageParams: (string | null)[];
}

export type AllPromptGroupsFilterRequest = {
  category: string;
  pageNumber: string;
  pageSize: string | number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  name?: string;
  author?: string;
};

export type AllPromptGroupsResponse = t.TPromptGroup[];

export type ConversationTagsResponse = s.TConversationTag[];

/* MCP Types */
export type MCPTool = {
  name: string;
  pluginKey: string;
  description: string;
};

export type MCPServer = {
  name: string;
  icon: string;
  authenticated: boolean;
  authConfig: s.TPluginAuthConfig[];
  tools: MCPTool[];
};

export type MCPServersResponse = {
  servers: Record<string, MCPServer>;
};

export type VerifyToolAuthParams = { toolId: string };
export type VerifyToolAuthResponse = {
  authenticated: boolean;
  message?: string | s.AuthType;
  authTypes?: [string, s.AuthType][];
};

export type GetToolCallParams = { conversationId: string };
export type ToolCallResults = a.ToolCallResult[];

/* Memories */
export type TUserMemory = {
  key: string;
  value: string;
  updated_at: string;
  tokenCount?: number;
  /** Agent partition this memory belongs to; absent = shared personal pool */
  agentId?: string;
  /** Display name of the partition's agent, resolved server-side when available */
  agentName?: string;
};

export type MemoriesResponse = {
  memories: TUserMemory[];
  totalTokens: number;
  tokenLimit: number | null;
  usagePercentage: number | null;
};

export type PrincipalSearchParams = {
  q: string;
  limit?: number;
  types?: Array<p.PrincipalType.USER | p.PrincipalType.GROUP | p.PrincipalType.ROLE>;
};

export type PrincipalSearchResponse = {
  query: string;
  limit: number;
  types?: Array<p.PrincipalType.USER | p.PrincipalType.GROUP | p.PrincipalType.ROLE>;
  results: p.TPrincipalSearchResult[];
  count: number;
  sources: {
    local: number;
    entra: number;
  };
};

export type AccessRole = {
  accessRoleId: p.AccessRoleIds;
  name: string;
  description: string;
  permBits: number;
};

export type AccessRolesResponse = AccessRole[];

export type ListRolesResponse = {
  roles: Array<{ _id?: string; name: string; description?: string }>;
  total: number;
  limit: number;
  offset?: number;
};

export interface MCPServerStatus {
  requiresOAuth: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  authorizationState?:
    | 'not_required'
    | 'authorizing'
    | 'authorized'
    | 'needs_authorization'
    | 'error';
}

export interface MCPConnectionStatusResponse {
  success: boolean;
  connectionStatus: Record<string, MCPServerStatus>;
  /** Server-configured OAuth completion window in ms (`MCP_OAUTH_HANDLING_TIMEOUT`) */
  oauthTimeout?: number;
}

export interface MCPServerConnectionStatusResponse {
  success: boolean;
  serverName: string;
  requiresOAuth: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  authorizationState?: MCPServerStatus['authorizationState'];
}

export interface MCPAuthValuesResponse {
  success: boolean;
  serverName: string;
  authValueFlags: Record<string, boolean>;
}

/**
 * User Favorites — pinned agents, models, and model specs.
 * Exactly one variant should be set per entry; exclusivity is enforced
 * server-side in FavoritesController. Shape is loose for state-update ergonomics.
 */
export type TUserFavorite = {
  agentId?: string;
  model?: string;
  endpoint?: string;
  spec?: string;
};

/**
 * Tool favorites — starred marketplace items (built-in capabilities, plugin
 * tools, MCP servers, skills). Identity is the compound (itemType, itemId)
 * pair, matching the marketplace `itemKey` format `itemType:itemId`.
 */
export type TToolFavoriteType = 'builtin' | 'tool' | 'mcp' | 'skill';

export type TToolFavorite = {
  itemType: TToolFavoriteType;
  itemId: string;
};

/* SharePoint Graph API Token */
export type GraphTokenParams = {
  scopes: string;
};

export type GraphTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

/* System Core — live infrastructure telemetry (admin) */

/**
 * Mirrors the keys of `client/src/components/SystemCore/data/status.ts`.
 *
 * Restated rather than imported because this package cannot depend on the
 * client. The client asserts the two agree at compile time; a divergence there
 * is a type error rather than a module the scene silently rejects.
 */
export type SystemCoreStatus = 'running' | 'degraded' | 'fault' | 'init' | 'loading' | 'controller';

/** Whether a module came from the curated catalogue or was found by discovery. */
export type SystemCoreOrigin = 'catalog' | 'discovered';

export type SystemCoreUnit =
  | 'ratio'
  | 'bytes'
  | 'seconds'
  | 'days'
  | 'count'
  | 'cores'
  | 'per_second'
  | 'boolean';

export type SystemCoreChannelId =
  | 'load'
  | 'saturation'
  | 'throughput'
  | 'latency'
  | 'errors'
  | 'capacity'
  | 'connections'
  | 'availability';

/**
 * 'activity' is a level to animate — busier means more, and nothing more.
 * 'health' is 0 bad .. 1 good and is averaged into the module's `health`.
 */
export type SystemCoreChannelPolarity = 'activity' | 'health';

/**
 * 'ok' carries a value. 'missing' means the series is not being scraped, which
 * is not a failure. 'error' means its query did not come back.
 *
 * The distinction matters: a gauge reading zero and a gauge that does not exist
 * must not look the same, or the scene draws "idle" where it means "unknown".
 */
export type SystemCoreChannelState = 'ok' | 'missing' | 'error';

export type SystemCoreChannel = {
  id: SystemCoreChannelId;
  label: string;
  state: SystemCoreChannelState;
  polarity: SystemCoreChannelPolarity;
  /** Normalized 0..1 and clamped. null unless `state` is 'ok'. */
  value: number | null;
  /** The upstream number in `unit`, for the panel's read-only display. */
  raw: number | null;
  unit: SystemCoreUnit;
  /** The catalogue query id behind this channel. Never an expression. */
  source: string;
};

export type SystemCoreTarget = {
  job: string;
  instance: string;
  namespace: string | null;
  pod: string | null;
  up: boolean;
};

/** The authored arrangement for one module, as the server holds it. */
export type SystemCorePlacement = {
  radius: number;
  y: number;
  arc: number;
  band: number;
  speed: number;
  hz: number | null;
  level: number;
  lane: number | null;
  order: number;
};

export type SystemCoreStaleness = {
  /** Seconds since the sample backing this module was scraped; null with no target. */
  scrapeAgeSeconds: number | null;
  stale: boolean;
};

export type SystemCoreModule = {
  id: string;
  label: string;
  status: SystemCoreStatus;
  origin: SystemCoreOrigin;
  /** Mean of the 'health'-polarity channels that resolved. null if none did. */
  health: number | null;
  /** Utilisation, for the panel readout. null when nothing reported it. */
  load: number | null;
  /** Throughput in events per second, unbounded. Drives the strip's spin. */
  rate: number | null;
  placement: SystemCorePlacement;
  channels: SystemCoreChannel[];
  staleness: SystemCoreStaleness;
  description: string;
  group: string;
  tags: string[];
  dependsOn: string[];
  target: SystemCoreTarget | null;
};

export type SystemCoreErrorCode =
  | 'timeout'
  | 'unreachable'
  | 'upstream_error'
  | 'bad_response'
  | 'truncated';

export type SystemCoreQueryError = {
  /** A catalogue query id, or 'up' for collection-wide problems. Never a URL. */
  source: string;
  code: SystemCoreErrorCode;
  message: string;
};

export type SystemCoreUnconfiguredReason = 'unset' | 'invalid_url';

export type SystemCoreSnapshotResponse = {
  /** false when the feed is not configured. The client keeps its fixture. */
  configured: boolean;
  reason?: SystemCoreUnconfiguredReason;
  /** When the upstream queries ran — not when this response was served. */
  collectedAt: string;
  /** Age of the served snapshot in the server's cache. 0 on a fresh fetch. */
  cacheAgeMs: number;
  /** Poll floor the server is asking for. Polling faster returns identical samples. */
  nextPollMs: number;
  /** Prometheus' scrape_interval, for the client's staleness wording. */
  scrapeIntervalSeconds: number;
  /**
   * Changes only when the *set* of modules or their placement changes, never
   * when a sample does. Lets the client reconcile its module list rarely and
   * apply readings often.
   */
  catalogRevision: string;
  modules: SystemCoreModule[];
  /** Per-query failures. Non-empty alongside populated `modules` is normal. */
  errors: SystemCoreQueryError[];
};

export type SystemCoreAvailabilityResponse = {
  /** Whether a Prometheus URL is configured at all. */
  configured: boolean;
  /** Whether *this* caller may read the feed. Both must hold to show the entry point. */
  enabled: boolean;
};
