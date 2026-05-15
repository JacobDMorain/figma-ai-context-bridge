# Figma Design MCP Bridge Architecture

## Status

Phase 1 and Phase 2 are complete. Phase 3 extends the bridge from "latest summary/detail cache" to a practical MCP interface for AI coding agents.

- Phase 1: mock HTTP push -> in-memory cache -> MCP tools.
- Phase 2: Figma `Open AI Agent Bridge` -> heartbeat -> live summary push.
- Phase 3: diff cache, richer tools, MCP resources, MCP prompts, manual detail/diff push from the panel, and lazy node-detail requests from summary nodes.

## Runtime Flow

```text
Figma Plugin Panel
  -> ui.html fetch()
  -> http://localhost:7800/api/*
  -> DesignCache
  -> MCP stdio server
  -> Agent tools/resources/prompts
```

The MCP server is started by the agent through the repository `.mcp.json`:

```json
{
  "mcpServers": {
    "figma-design": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": { "MCP_HTTP_PORT": "7800" }
    }
  }
}
```

Server stdout is reserved for MCP JSON-RPC. Logs must go to stderr.

## Figma Plugin Push Rules

Only `Open AI Agent Bridge` enables MCP sync.

- Heartbeat: UI posts `/api/heartbeat` immediately and every 15 seconds.
- Automatic sync: `selectionchange` debounce pushes AI Summary only.
- Manual AI Detail export: Download or Copy also pushes `/api/push/selection`.
- Manual AI Diff export: Download or Copy also pushes `/api/push/diff`.
- Lazy node detail: when an agent calls `get_design_node` for a summary-only node, the server queues a node-detail request. The panel polls `/api/requests`, serializes that node subtree, and pushes `/api/push/node-detail`.
- Direct menu exports still download only and do not sync to MCP.
- Push failures are non-fatal: the panel shows offline/error state but download/copy still works.

## HTTP Endpoints

All push endpoints require `fileKey`, `pageId`, and `sessionId`.

| Endpoint | Method | Purpose |
|---|---:|---|
| `/health` | GET | Returns `{ ok: true, connected: boolean }`. |
| `/api/heartbeat` | POST | Updates connection freshness and plugin version. |
| `/api/push/summary` | POST | Stores latest AI Summary payload. |
| `/api/push/selection` | POST | Stores latest AI Detail payload. |
| `/api/push/diff` | POST | Stores latest AI Diff payload. |
| `/api/requests` | GET | Returns pending lazy node-detail requests for the current session. |
| `/api/push/node-detail` | POST | Stores a fulfilled node subtree detail payload or request error. |

Allowed origins:

- no Origin
- `null`
- `https://www.figma.com`
- `https://figma.com`

The server binds loopback only, using `127.0.0.1` and `::1` by default.

## Cache Model

Cache key is:

```text
fileKey + pageId + sessionId
```

Data entries:

- `summary`: latest AI Summary, TTL 5 minutes.
- `selection`: latest AI Detail, TTL 5 minutes.
- `diff`: latest AI Diff, TTL 5 minutes.
- `nodeDetails`: per-node AI Detail payloads produced by lazy loading, TTL 5 minutes.
- `detailRequests`: pending/fulfilled/error lazy node-detail requests, TTL 30 seconds.
- `connection`: heartbeat state, connected when last heartbeat is within 30 seconds.

When no explicit key is passed to a tool, the cache returns the most recently active session.

## MCP Tools

The server exposes these tools:

- `get_connection_status`
  - Reports freshness, active file/page/session, plugin version, `hasSummary`, `hasSelection`, `hasDiff`, `hasNodeDetails`, and `pendingDetailCount`.
- `get_design_summary`
  - Returns latest AI Summary.
- `get_design_selection`
  - Returns latest AI Detail. `format: "compact"` keeps a recursive node skeleton.
- `get_design_diff`
  - Returns latest AI Diff. `format: "compact"` keeps `metadata`, compact `changed`, `removed`, and `unchangedCount`.
- `get_design_tokens`
  - Reads `designTokens`, preferring detail selection and falling back to summary.
- `get_component_definitions`
  - Reads all component definitions or one `componentId`.
- `get_design_node`
  - Looks up a node by id from full selection detail, lazy node detail, or summary.
  - If only summary is available and the panel is connected, it queues a lazy node-detail request and waits up to `waitMs` (default 10 seconds, max 15 seconds).
  - Supports `detail: "summary-only"` to bypass lazy loading and return the summary skeleton immediately.
- `search_nodes`
  - Searches id, name, type, component id, text characters, and `hints.htmlTag`.

All tools return MCP text content containing formatted JSON.

## MCP Resources

Fixed resources:

- `figma://status`
- `figma://summary`
- `figma://selection`
- `figma://diff`
- `figma://tokens`
- `figma://components`

Each resource returns `application/json` text using the same cache and query behavior as its corresponding tool.

## MCP Prompts

Prompts registered by the server:

- `implement-design`
  - Guides an agent to check status, inspect summary, drill into nodes, read tokens/components, then implement.
- `review-design`
  - Guides visual fidelity review against the current pushed Figma data.
- `extract-design-system`
  - Guides extraction of tokens and component definitions as CSS, Tailwind, or JSON.

## Agent Usage Pattern

Recommended flow:

1. Call `get_connection_status`.
2. If connected and `hasSummary`, call `get_design_summary`.
3. Use `search_nodes` to find target node ids.
4. Call `get_design_node({ nodeId })`; if only summary exists, the tool requests lazy node detail from the open Figma panel and returns it when ready.
5. If manual AI Detail was pushed, call `get_design_selection`, `get_design_tokens`, and `get_component_definitions` for full-selection context.
6. If manual AI Diff was pushed, call `get_design_diff`.
7. If data is missing or stale, ask the user to open the Figma panel and switch selection once.
