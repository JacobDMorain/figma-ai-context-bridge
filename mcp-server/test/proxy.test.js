import test from "node:test";
import assert from "node:assert/strict";
import { DesignCache, createHttpServer, createProxyToolHandlers } from "../dist/index.js";

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

async function withServer(fn) {
  const cache = new DesignCache({ now: () => Date.now() });
  const server = createHttpServer({ cache, port: 0 });
  await server.start();
  try {
    await fn({ cache, server, baseUrl: `http://127.0.0.1:${server.port}` });
  } finally {
    await server.stop();
  }
}

test("proxy tool handlers forward calls to an existing broker", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
    const summary = { mode: "ai-summary", nodes: [{ id: "1:1", name: "Frame" }] };
    cache.putSummary(key, summary);

    const tools = createProxyToolHandlers(baseUrl);
    const result = parseToolResult(await tools.getDesignSummary(key));

    assert.equal(result.ok, true);
    assert.deepEqual(result.data, summary);
  });
});
