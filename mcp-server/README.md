# Figma Design MCP Server

Local MCP bridge server for Figma AI Context Bridge.

The server has two roles:

- expose MCP tools/resources/prompts over stdio
- receive Figma plugin data over loopback HTTP

## Install

### GitHub repository clone

```powershell
cd mcp-server
npm install
npm run build
```

This is the recommended path when you cloned the full GitHub repository and want to run tests or modify the bridge.

### Standalone MCP server package

If you received the standalone MCP server package, extract `figma-ai-context-bridge-mcp-server.zip` and run:

```powershell
cd figma-ai-context-bridge-mcp-server
npm install
npm run build
```

The standalone MCP server package intentionally excludes `node_modules` and `dist`; install dependencies and build locally after extraction.

## Run

MCP clients should start the server with:

```powershell
node mcp-server/dist/index.js
```

The server also listens on `localhost:7800` for Figma plugin pushes.

## MCP Client Config

### Codex

Use the repository root `.mcp.json`, or add this server entry to your Codex MCP settings:

```json
{
  "mcpServers": {
    "figma-design": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "MCP_HTTP_PORT": "7800"
      }
    }
  }
}
```

Restart Codex after editing MCP settings.

### Claude Code

Configure a stdio MCP server:

```json
{
  "mcpServers": {
    "figma-design": {
      "command": "node",
      "args": ["D:/FigmaPlugin/mcp-server/dist/index.js"],
      "env": {
        "MCP_HTTP_PORT": "7800"
      }
    }
  }
}
```

Use the path for your local checkout. The server writes logs to stderr and reserves stdout for MCP JSON-RPC.

### Cursor

Add the same `figma-design` stdio server entry in Cursor's MCP settings. Prefer an absolute path to `mcp-server/dist/index.js` because Cursor may not launch from the repository root.

## Tools

- `get_connection_status`
- `get_design_summary`
- `get_design_selection`
- `get_design_diff`
- `get_design_tokens`
- `get_component_definitions`
- `get_design_node`
- `search_nodes`

## Lazy Node Detail

When `get_design_node` is called for a node that exists only in summary data, the server queues a node-detail request. The Figma panel polls that request, serializes the node subtree, and pushes the detail payload back to the server.

Keep `Open AI Agent Bridge` open in Figma while using lazy detail.

## Troubleshooting

- `EADDRINUSE`: another server is already using port `7800`.
- `connected: false`: open the Figma panel or wait for heartbeat.
- missing summary: switch selection in Figma once.
- lazy detail timeout: keep the panel open and call `get_design_node` again.
