// MCP (Model Context Protocol) server selection, connection lifecycle, and tool
// visibility.
//
// MCP is the one integration where the client must manage a *connection* rather
// than just call an endpoint: servers initialize, may require OAuth, may defer
// connection to request time, and may never enumerate their tools.

export * from './useMCPSelect';
export * from './useVisibleTools';
export * from './useMCPServerManager';
export * from './useMCPConnectionStatus';

export { useMCPIconMap, useMCPServerNames } from './useMCPIconMap';
export { useRemoveMCPTool } from './useRemoveMCPTool';
