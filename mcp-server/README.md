# Figma Design MCP Server

Local MCP bridge server for Figma AI Context Bridge.

The server has two roles:

- expose MCP tools/resources/prompts over stdio
- receive Figma plugin data over loopback HTTP

## Install

```powershell
cd mcp-server
npm install
npm run build
```

## Run

MCP clients should start the server with:

```powershell
node mcp-server/dist/index.js
```

The server also listens on `localhost:7800` for Figma plugin pushes.

## MCP Client Config

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

