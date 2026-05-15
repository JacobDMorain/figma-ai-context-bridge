# Figma AI Context Bridge

Figma AI Context Bridge exports selected Figma designs as AI-friendly JSON and exposes live design context to AI coding agents through a local MCP bridge.

The plugin is intentionally focused on AI agent workflows:

- export semantic, compact JSON for the current selection
- keep a local MCP bridge in sync with the active selection summary
- let agents search summary nodes and lazy-load detailed node data on demand

## Quick Start: Export AI JSON

1. Select a frame, component, or node in Figma.
2. Run `Export AI JSON`.
3. Use the downloaded JSON with your AI agent.

The exported JSON uses the `ai-optimized` schema and includes layout, CSS-like styles, text, positioning, component definitions, tokens, interactions, and implementation hints.

## Quick Start: MCP Bridge

1. Build the plugin and MCP server:

   ```powershell
   npm install
   npm run build
   cd mcp-server
   npm install
   npm run build
   ```

2. Configure your MCP client to start the local server:

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

3. In Figma, run `Open AI Agent Bridge`.
4. Select or switch to the design you want the agent to inspect.
5. In the agent, call:
   - `get_connection_status`
   - `get_design_summary`
   - `search_nodes`
   - `get_design_node`

`get_design_node` automatically requests detailed data for summary nodes. Keep the Figma panel open while the agent is working.

## MCP Workflow

Recommended agent flow:

1. Check `get_connection_status`.
2. Read `get_design_summary`.
3. Use `search_nodes` to find a target node.
4. Call `get_design_node({ nodeId })` to lazy-load that node's detail.
5. Use returned CSS, text, tokens, component definitions, positioning, and hints to implement or review code.

## Troubleshooting

- **MCP offline**: Start or restart your MCP client so it launches `mcp-server/dist/index.js`.
- **Port already in use**: Stop the old server process using port `7800`, or restart your MCP client.
- **No summary**: Open `Open AI Agent Bridge` in Figma and switch selection once.
- **Lazy detail timeout**: Keep the panel open and call `get_design_node` again.
- **Large selection feels slow**: Summary sync is automatic; detail is lazy-loaded to avoid exporting the full tree by default.

## Development

Run verification:

```powershell
npm run verify
```

Create a release folder:

```powershell
npm run release:pack
```

