// Tool and MCP view-model types: `MCPServerInfo` and friends, the merged shape
// AgentPanelContext builds from two incomplete sources.

import type { AuthType } from 'librechat-data-provider';

export type ApiKeyFormData = {
  apiKey: string;
  authType?: string | AuthType;
};
