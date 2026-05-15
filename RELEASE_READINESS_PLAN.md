# Release Readiness Plan

## Product Direction

This plugin is for AI coding agents, not a general-purpose Figma data exporter.

Release v1 should focus on two capabilities:

1. **Export AI-friendly JSON**
   - Export the current Figma selection as semantic, compact JSON for AI agents.
   - Preserve layout, text, styles, tokens, components, positioning, interactions, and hints.
   - Keep raw Figma-style export code only as internal/dev capability unless explicitly needed later.

2. **Local MCP Bridge**
   - Let Codex, Claude Code, Cursor, and similar agents read live Figma context through MCP.
   - The plugin pushes summary data to a local server.
   - Agents search summary nodes and lazily request node detail through `get_design_node`.
   - Detail is fetched on demand from the open Figma panel, avoiding full-selection heavy sync by default.

## Release UX

### Manifest Menu

Simplify the public menu to:

- `Export AI JSON`
  - Directly downloads the current selection as AI-optimized JSON.
  - Uses the existing `ai-optimized` detail schema.

- `Open AI Agent Bridge`
  - Opens the panel used for MCP sync.
  - Automatically pushes summary on selection changes.
  - Supports lazy node detail requests from MCP tools.
  - Keeps manual Copy/Download for AI JSON as a convenience.

Remove these from the public release menu:

- `Export Selection (AI Summary)`
- `Export Selection (Referenced Resources)`
- `Export Selection (Full Resources)`
- `Open Export Panel (MCP Debug)`

The underlying raw/summary/diff serializer code may remain for tests and future internal debugging, but the release-facing product should not expose raw export modes.

### Panel UX

Rename and polish the panel as an agent bridge, not a debug surface.

Required panel sections:

- **Connection**
  - MCP server URL.
  - Connected/offline heartbeat state.
  - Clear offline copy: direct export still works, MCP sync requires local server.

- **Current Selection**
  - Selection count.
  - Node count.
  - Estimated tokens.
  - Last summary sync time.

- **Agent Sync**
  - Last sync type: `summary`, `node-detail`, `selection`, or `diff`.
  - Pending lazy detail count if available.
  - Error area for local MCP failures.

- **Actions**
  - `Copy AI JSON`
  - `Download AI JSON`

Avoid debug wording in release UI. Use diagnostics only as compact status text.

## MCP Bridge Release Shape

### Server Packaging

Keep the MCP server as a local companion package under `mcp-server/`.

Release requirements:

- `npm install` works in `mcp-server`.
- `npm run build`, `npm test`, and `npm run check` pass.
- `node dist/index.js` starts the MCP stdio server and loopback HTTP receiver.
- Logs go to stderr only; stdout remains MCP JSON-RPC.
- The server binds only to loopback.

### Agent Setup

Document setup for:

- Codex
- Claude Code
- Cursor

Minimum setup example:

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

Recommended agent flow:

1. Open `Open AI Agent Bridge` in Figma.
2. Select a frame or component.
3. Agent calls `get_connection_status`.
4. Agent calls `get_design_summary`.
5. Agent uses `search_nodes` to find relevant nodes.
6. Agent calls `get_design_node({ nodeId })` to lazily load detail.
7. Agent implements or reviews code using the returned semantic JSON.

## Publishing Requirements

### Figma Manifest

Before public publishing:

- Replace local development `id` with the real Figma plugin id.
- Keep `api: "1.0.0"` unless a required API forces an upgrade.
- Prefer `editorType: ["figma"]` for v1.
- Keep `documentAccess: "dynamic-page"`.
- Keep `networkAccess.allowedDomains` limited to the local MCP endpoint.
- Update `networkAccess.reasoning` to clearly state that data is sent only to the local MCP bridge server.

### Privacy And Trust

Add a privacy section to README and release notes:

- The plugin can read selected node names, text, style data, variables, components, and layout metadata.
- Direct export writes a local JSON file or copies JSON to clipboard.
- MCP mode sends data only to the configured local loopback server.
- No cloud service is used by this repository.
- Users are responsible for not exporting confidential designs to third-party agents.

### Docs To Add

Create:

- `README.md`
  - What the plugin does.
  - Quick start for AI JSON export.
  - Quick start for MCP bridge.
  - Agent workflow.
  - Troubleshooting.

- `PRIVACY.md`
  - Local-only data flow.
  - What data is exported.
  - MCP server boundary.

- `CHANGELOG.md`
  - Initial release entry.

- `mcp-server/README.md`
  - Install/build/run.
  - MCP client configuration examples.
  - Tools list.
  - Troubleshooting port conflicts.

## Engineering Hardening

### Release Build

Add root scripts:

- `build`
  - Already builds `code.js`.

- `test`
  - Already runs build and Node tests.

- `check`
  - Already checks `code.js`.

- `verify`
  - New script that runs root test/check and MCP server test/check.

- `release:pack`
  - New script that creates a release folder or zip with only:
    - `manifest.json`
    - `code.js`
    - `ui.html`
    - `README.md`
    - `PRIVACY.md`
    - optional schema/docs

Do not package:

- `node_modules`
- `dist`
- `.git`
- `.claude`
- test files
- local logs

### Schema And Compatibility

Keep:

- `schema/ai-export.schema.json`
- parser compatibility test against unsupported object spread syntax
- tests for summary, lazy node detail, MCP tools, and HTTP endpoints

Add release checks:

- manifest JSON parse
- package JSON parse
- schema JSON parse
- release package contains no ignored/private files

## Simplification Backlog

These changes make the product cleaner for AI-agent users:

- Rename plugin and UI from `Selection Style Exporter` to an AI-agent-focused name.
- Remove raw export commands from public `manifest.json`.
- Remove direct `AI Summary` menu command from public UI; summary remains MCP-internal.
- Keep `AI Diff` as internal or future feature unless it has a clear release workflow.
- Replace `MCP Debug` wording with `AI Agent Bridge`.
- Make offline MCP state friendly, not alarming.
- Keep lazy detail as the default detail path for agents.

## Release Acceptance Criteria

The release is ready when:

- Figma public menu has only `Export AI JSON` and `Open AI Agent Bridge`.
- Direct AI JSON export works without the MCP server.
- MCP bridge works with Codex after opening the panel.
- `get_design_summary`, `search_nodes`, and lazy `get_design_node` work on a real Figma selection.
- Full verification passes:

```powershell
npm.cmd test
npm.cmd run check
cd mcp-server
npm.cmd test
npm.cmd run check
```

- Release package excludes dependencies, generated server dist, local config, and test-only files.
- README, Privacy, and MCP setup docs are present.

