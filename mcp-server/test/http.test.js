import test from "node:test";
import assert from "node:assert/strict";
import { DesignCache, createHttpServer } from "../dist/index.js";

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

test("GET /health returns ok and connection state", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.connected, false);
  });
});

test("GET /health is reachable on IPv6 localhost", async () => {
  await withServer(async ({ server }) => {
    const response = await fetch(`http://[::1]:${server.port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  });
});

test("OPTIONS returns CORS headers for allowed origin", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/push/summary`, {
      method: "OPTIONS",
      headers: { Origin: "null" }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "null");
    assert.match(response.headers.get("access-control-allow-methods"), /POST/);
  });
});

test("OPTIONS allows browser private network preflight from Figma web", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/heartbeat`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.figma.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
        "Access-Control-Request-Private-Network": "true"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://www.figma.com");
    assert.equal(response.headers.get("access-control-allow-private-network"), "true");
  });
});

test("POST summary selection diff and heartbeat update cache", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
    const summaryPayload = { mode: "ai-summary", nodes: [{ id: "1:1" }] };
    const selectionPayload = { mode: "ai-optimized", nodes: [{ id: "1:1", css: {} }] };
    const diffPayload = { mode: "ai-diff", changed: [{ id: "1:1" }], removed: [] };

    const summaryResponse = await fetch(`${baseUrl}/api/push/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, payload: summaryPayload })
    });
    const selectionResponse = await fetch(`${baseUrl}/api/push/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, payload: selectionPayload })
    });
    const diffResponse = await fetch(`${baseUrl}/api/push/diff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, payload: diffPayload })
    });
    const heartbeatResponse = await fetch(`${baseUrl}/api/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, pluginVersion: "1.0.0" })
    });

    assert.equal(summaryResponse.status, 200);
    assert.equal(selectionResponse.status, 200);
    assert.equal(diffResponse.status, 200);
    assert.equal(heartbeatResponse.status, 200);
    assert.deepEqual(cache.getSummary(key), summaryPayload);
    assert.deepEqual(cache.getSelection(key), selectionPayload);
    assert.deepEqual(cache.getDiff(key), diffPayload);
    assert.equal(cache.getStatus(key).connected, true);
  });
});

test("GET requests and POST node-detail support lazy node detail sync", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
    const request = cache.createNodeDetailRequest(key, "1:2", "subtree");

    const requestsResponse = await fetch(`${baseUrl}/api/requests?fileKey=file-a&pageId=page-a&sessionId=session-a`);
    const requestsBody = await requestsResponse.json();
    assert.equal(requestsResponse.status, 200);
    assert.deepEqual(requestsBody.requests, [{
      requestId: request.requestId,
      type: "node-detail",
      nodeId: "1:2",
      scope: "subtree",
      createdAt: request.createdAt
    }]);

    const detail = { mode: "ai-optimized", nodes: [{ id: "1:2", name: "Lazy Detail" }] };
    const pushResponse = await fetch(`${baseUrl}/api/push/node-detail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, requestId: request.requestId, nodeId: "1:2", payload: detail })
    });

    assert.equal(pushResponse.status, 200);
    assert.deepEqual(cache.getNodeDetail(key, "1:2"), detail);
    assert.deepEqual(cache.getPendingDetailRequests(key), []);
  });
});

test("POST node-detail error completes lazy request without payload", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "file-a", pageId: "page-a", sessionId: "session-a" };
    const request = cache.createNodeDetailRequest(key, "missing", "subtree");

    const response = await fetch(`${baseUrl}/api/push/node-detail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, requestId: request.requestId, nodeId: "missing", error: "Node not found" })
    });

    assert.equal(response.status, 200);
    assert.equal(cache.getNodeDetail(key, "missing"), null);
    assert.equal(cache.getNodeDetailRequest(key, request.requestId).status, "error");
  });
});

test("POST node-detail missing request fields returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/push/node-detail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileKey: "file-a", pageId: "page-a", sessionId: "session-a", nodeId: "1:1", payload: {} })
    });

    assert.equal(response.status, 400);
  });
});

test("Phase 2 UI bridge body works with heartbeat summary and selection reads", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const envelope = {
      fileKey: "real-file",
      pageId: "page-id",
      sessionId: "panel-session"
    };
    const summary = { schemaVersion: "2.1.0", mode: "ai-summary", nodes: [{ id: "1:1", name: "Frame" }] };
    const selection = { schemaVersion: "2.1.0", mode: "ai-optimized", nodes: [{ id: "1:1", css: { display: "flex" } }] };

    await fetch(`${baseUrl}/api/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...envelope, pluginVersion: "1.0.0" })
    });
    await fetch(`${baseUrl}/api/push/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...envelope, payload: summary })
    });
    await fetch(`${baseUrl}/api/push/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...envelope, payload: selection })
    });

    assert.equal(cache.getStatus(envelope).connected, true);
    assert.deepEqual(cache.getSummary(envelope), summary);
    assert.deepEqual(cache.getSelection(envelope), selection);
  });
});

test("Figma web origin can post heartbeat", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "web-file", pageId: "page-id", sessionId: "web-session" };
    const response = await fetch(`${baseUrl}/api/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://www.figma.com"
      },
      body: JSON.stringify({ ...key, pluginVersion: "1.0.0" })
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://www.figma.com");
    assert.equal(cache.getStatus(key).connected, true);
  });
});

test("Figma web origin can post diff", async () => {
  await withServer(async ({ baseUrl, cache }) => {
    const key = { fileKey: "web-file", pageId: "page-id", sessionId: "web-session" };
    const payload = { mode: "ai-diff", changed: [{ id: "1:2" }] };
    const response = await fetch(`${baseUrl}/api/push/diff`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://www.figma.com"
      },
      body: JSON.stringify({ ...key, payload })
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://www.figma.com");
    assert.deepEqual(cache.getDiff(key), payload);
  });
});

test("POST missing key fields returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/push/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileKey: "file-a", payload: {} })
    });

    assert.equal(response.status, 400);
  });
});

test("POST from disallowed origin returns 403", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/push/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://example.com"
      },
      body: JSON.stringify({ fileKey: "file-a", pageId: "page-a", sessionId: "session-a", payload: {} })
    });

    assert.equal(response.status, 403);
  });
});
