import test from "node:test";
import assert from "node:assert/strict";
import { DesignCache } from "../dist/index.js";

test("cache stores and reads summary selection and diff by exact key", () => {
  const cache = new DesignCache({ now: () => 1000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const summary = { mode: "ai-summary", nodes: [{ id: "1:1", name: "Summary" }] };
  const selection = { mode: "ai-optimized", nodes: [{ id: "1:1", name: "Detail" }] };
  const diff = { mode: "ai-diff", changed: [{ id: "1:1", name: "Changed" }] };

  cache.putSummary(key, summary);
  cache.putSelection(key, selection);
  cache.putDiff(key, diff);

  assert.deepEqual(cache.getSummary(key), summary);
  assert.deepEqual(cache.getSelection(key), selection);
  assert.deepEqual(cache.getDiff(key), diff);
});

test("cache isolates file page and session entries", () => {
  const cache = new DesignCache({ now: () => 1000 });
  const first = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
  const second = { fileKey: "file-a", pageId: "page-b", sessionId: "session-a" };

  cache.putSummary(first, { label: "first" });
  cache.putSummary(second, { label: "second" });

  assert.deepEqual(cache.getSummary(first), { label: "first" });
  assert.deepEqual(cache.getSummary(second), { label: "second" });
});

test("cache defaults to most recently active session", () => {
  let now = 1000;
  const cache = new DesignCache({ now: () => now });

  cache.putSummary({ fileKey: "file-a", pageId: "page-a", sessionId: "old" }, { label: "old" });
  now = 2000;
  cache.putSummary({ fileKey: "file-b", pageId: "page-b", sessionId: "new" }, { label: "new" });

  assert.deepEqual(cache.getSummary(), { label: "new" });
  assert.equal(cache.getStatus().activeSessionId, "new");
});

test("cache expires summary selection and diff after ttl", () => {
  let now = 1000;
  const cache = new DesignCache({ now: () => now, dataTtlMs: 300000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };

  cache.putSummary(key, { label: "summary" });
  cache.putSelection(key, { label: "selection" });
  cache.putDiff(key, { label: "diff" });
  now = 1000 + 300001;

  assert.equal(cache.getSummary(key), null);
  assert.equal(cache.getSelection(key), null);
  assert.equal(cache.getDiff(key), null);
});

test("cache status reports diff availability and latest push time", () => {
  let now = 1000;
  const cache = new DesignCache({ now: () => now });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };

  cache.putSummary(key, { label: "summary" });
  now = 2000;
  cache.putDiff(key, { label: "diff" });

  const status = cache.getStatus(key);
  assert.equal(status.hasSummary, true);
  assert.equal(status.hasSelection, false);
  assert.equal(status.hasDiff, true);
  assert.equal(status.lastPushAt, 2000);
});

test("cache connection status follows heartbeat freshness", () => {
  let now = 1000;
  const cache = new DesignCache({ now: () => now, heartbeatTtlMs: 30000 });
  const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };

  cache.heartbeat({ ...key, pluginVersion: "1.0.0" });
  assert.equal(cache.getStatus(key).connected, true);

  now = 1000 + 30001;
  assert.equal(cache.getStatus(key).connected, false);
});
