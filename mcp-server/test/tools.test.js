import test from "node:test";
import assert from "node:assert/strict";
import { DesignCache, createMcpServer, createToolHandlers } from "../dist/index.js";

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

function hasRegistration(collection, name) {
  return collection instanceof Map ? collection.has(name) : Object.prototype.hasOwnProperty.call(collection, name);
}

test("tools return friendly message when summary is empty", async () => {
  const tools = createToolHandlers(new DesignCache({ now: () => 1000 }));

  const result = parseToolResult(await tools.getDesignSummary({}));

  assert.equal(result.ok, false);
  assert.equal(result.message, "Open Export Panel in Figma and push a selection first.");
});

test("tools read pushed summary and selection", async () => {
  const cache = new DesignCache({ now: () => 1000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const summary = { mode: "ai-summary", nodes: [{ id: "1:1", name: "Summary" }] };
  const selection = { metadata: { nodeCount: 1 }, nodes: [{ id: "1:1", name: "Frame", type: "FRAME", children: [{ id: "1:2" }] }] };
  const tools = createToolHandlers(cache);

  cache.putSummary(key, summary);
  cache.putSelection(key, selection);

  assert.deepEqual(parseToolResult(await tools.getDesignSummary(key)).data, summary);
  assert.deepEqual(parseToolResult(await tools.getDesignSelection({ ...key, format: "full" })).data, selection);
  assert.deepEqual(parseToolResult(await tools.getDesignSelection({ ...key, format: "compact" })).data, {
    metadata: { nodeCount: 1 },
    nodes: [{ id: "1:1", name: "Frame", type: "FRAME", childCount: 1, children: [{ id: "1:2", childCount: 0 }] }]
  });
});

test("tools read design diff in full and compact formats", async () => {
  const cache = new DesignCache({ now: () => 1000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const diff = {
    mode: "ai-diff",
    metadata: { nodeCount: 2 },
    changed: [{ id: "1:1", name: "Frame", type: "FRAME", children: [{ id: "1:2", name: "Copy", type: "TEXT" }] }],
    removed: [{ id: "1:3", name: "Old" }],
    unchangedCount: 4,
    currentHashes: { "1:1": "hash" }
  };
  const tools = createToolHandlers(cache);

  cache.putDiff(key, diff);

  assert.deepEqual(parseToolResult(await tools.getDesignDiff({ ...key, format: "full" })).data, diff);
  assert.deepEqual(parseToolResult(await tools.getDesignDiff({ ...key, format: "compact" })).data, {
    metadata: { nodeCount: 2 },
    changed: [{ id: "1:1", name: "Frame", type: "FRAME", childCount: 1, children: [{ id: "1:2", name: "Copy", type: "TEXT", childCount: 0 }] }],
    removed: [{ id: "1:3", name: "Old" }],
    unchangedCount: 4
  });
});

test("tools read tokens components nodes and search pushed design data", async () => {
  const cache = new DesignCache({ now: () => 1000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const selection = {
    mode: "ai-optimized",
    metadata: { nodeCount: 3 },
    designTokens: {
      colors: { color_1: "#ffffff" },
      typography: { body: { fontSize: "16px" } },
      spacing: { space_1: "8px" }
    },
    componentDefinitions: {
      "comp-1": { name: "Primary Button" }
    },
    nodes: [{
      id: "1:1",
      name: "Root",
      type: "FRAME",
      children: [
        {
          id: "1:2",
          name: "Primary Button",
          type: "INSTANCE",
          componentId: "comp-1",
          text: { characters: "Submit order" },
          hints: { htmlTag: "button" },
          children: []
        },
        {
          id: "1:3",
          name: "Hidden Icon",
          type: "RECTANGLE",
          figma: { visible: false },
          hints: { htmlTag: "img" },
          children: []
        }
      ]
    }]
  };
  const tools = createToolHandlers(cache);
  cache.putSelection(key, selection);

  assert.deepEqual(parseToolResult(await tools.getDesignTokens({ ...key, category: "colors" })).data, { color_1: "#ffffff" });
  assert.deepEqual(parseToolResult(await tools.getComponentDefinitions({ ...key, componentId: "comp-1" })).data, { name: "Primary Button" });

  const node = parseToolResult(await tools.getDesignNode({ ...key, nodeId: "1:1" })).data;
  assert.equal(node.id, "1:1");
  assert.deepEqual(node.children, [
    { id: "1:2", name: "Primary Button", type: "INSTANCE", componentId: "comp-1", childCount: 0 },
    { id: "1:3", name: "Hidden Icon", type: "RECTANGLE", childCount: 0 }
  ]);

  const subtree = parseToolResult(await tools.getDesignNode({ ...key, nodeId: "1:1", includeChildren: true })).data;
  assert.equal(subtree.children[0].text.characters, "Submit order");

  const visibleSearch = parseToolResult(await tools.searchNodes({ ...key, query: "icon" }));
  assert.equal(visibleSearch.count, 0);

  const hiddenSearch = parseToolResult(await tools.searchNodes({ ...key, query: "icon", includeHidden: true }));
  assert.equal(hiddenSearch.count, 1);
  assert.equal(hiddenSearch.results[0].pathString, "Root / Hidden Icon");

  const typeSearch = parseToolResult(await tools.searchNodes({ ...key, type: "INSTANCE", limit: 1 }));
  assert.equal(typeSearch.count, 1);
  assert.equal(typeSearch.results[0].textPreview, "Submit order");
});

test("connection status reports fresh and stale heartbeat", async () => {
  let now = 1000;
  const cache = new DesignCache({ now: () => now, heartbeatTtlMs: 30000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const tools = createToolHandlers(cache);

  cache.heartbeat({ ...key, pluginVersion: "1.0.0" });
  assert.equal(parseToolResult(await tools.getConnectionStatus(key)).connected, true);

  now = 32000;
  assert.equal(parseToolResult(await tools.getConnectionStatus(key)).connected, false);
});

test("mcp server registers Phase 3 tools resources and prompts", () => {
  const server = createMcpServer(new DesignCache({ now: () => 1000 }));

  for (const name of [
    "get_connection_status",
    "get_design_summary",
    "get_design_selection",
    "get_design_diff",
    "get_design_tokens",
    "get_component_definitions",
    "get_design_node",
    "search_nodes"
  ]) {
    assert.equal(hasRegistration(server._registeredTools, name), true);
  }

  for (const name of [
    "figma://status",
    "figma://summary",
    "figma://selection",
    "figma://diff",
    "figma://tokens",
    "figma://components"
  ]) {
    assert.equal(hasRegistration(server._registeredResources, name), true);
  }

  for (const name of ["implement-design", "review-design", "extract-design-system"]) {
    assert.equal(hasRegistration(server._registeredPrompts, name), true);
  }
});
