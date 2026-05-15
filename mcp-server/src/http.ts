import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { DesignCache } from "./cache.js";
import type { CacheKey } from "./types.js";

interface HttpServerOptions {
  cache: DesignCache;
  port?: number;
  host?: string;
}

interface HttpServerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
}

interface PushBody extends Partial<CacheKey> {
  payload?: unknown;
  pluginVersion?: string;
  requestId?: string;
  nodeId?: string;
  error?: string;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === undefined
    || origin === "null"
    || origin === "https://www.figma.com"
    || origin === "https://figma.com";
}

function setCorsHeaders(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Origin not allowed" }));
    return false;
  }

  response.setHeader("access-control-allow-origin", origin || "null");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-private-network", "true");
  return true;
}

async function readJson(request: IncomingMessage): Promise<PushBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function keyFromBody(body: PushBody): CacheKey | null {
  if (!body.fileKey || !body.pageId || !body.sessionId) {
    return null;
  }
  return {
    fileKey: body.fileKey,
    pageId: body.pageId,
    sessionId: body.sessionId
  };
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

export function createHttpServer(options: HttpServerOptions): HttpServerHandle {
  const listenPort = options.port ?? 7800;
  let actualPort = listenPort;
  const hosts = options.host ? [options.host] : ["127.0.0.1", "::1"];
  const servers: http.Server[] = [];

  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (!setCorsHeaders(request, response)) {
        return;
      }

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url || "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          ok: true,
          connected: options.cache.getStatus().connected
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/requests") {
        const query: Partial<CacheKey> = {};
        const fileKey = url.searchParams.get("fileKey");
        const pageId = url.searchParams.get("pageId");
        const sessionId = url.searchParams.get("sessionId");
        if (fileKey) {
          query.fileKey = fileKey;
        }
        if (pageId) {
          query.pageId = pageId;
        }
        if (sessionId) {
          query.sessionId = sessionId;
        }
        writeJson(response, 200, {
          ok: true,
          requests: options.cache.getPendingDetailRequests(query).map((detailRequest) => ({
            requestId: detailRequest.requestId,
            type: detailRequest.type,
            nodeId: detailRequest.nodeId,
            scope: detailRequest.scope,
            createdAt: detailRequest.createdAt
          }))
        });
        return;
      }

      if (request.method === "POST" && ["/api/push/summary", "/api/push/selection", "/api/push/diff", "/api/push/node-detail", "/api/heartbeat"].includes(url.pathname)) {
        const body = await readJson(request);
        const key = keyFromBody(body);
        if (!key) {
          writeJson(response, 400, { ok: false, error: "fileKey, pageId and sessionId are required" });
          return;
        }

        if (url.pathname === "/api/push/summary") {
          options.cache.putSummary(key, body.payload);
        } else if (url.pathname === "/api/push/selection") {
          options.cache.putSelection(key, body.payload);
        } else if (url.pathname === "/api/push/diff") {
          options.cache.putDiff(key, body.payload);
        } else if (url.pathname === "/api/push/node-detail") {
          if (!body.requestId || !body.nodeId) {
            writeJson(response, 400, { ok: false, error: "requestId and nodeId are required" });
            return;
          }
          if (body.error) {
            options.cache.failNodeDetailRequest(key, body.requestId, body.nodeId, body.error);
          } else {
            options.cache.fulfillNodeDetailRequest(key, body.requestId, body.nodeId, body.payload);
          }
        } else {
          options.cache.heartbeat({
            ...key,
            pluginVersion: body.pluginVersion || ""
          });
        }

        writeJson(response, 200, { ok: true });
        return;
      }

      writeJson(response, 404, { ok: false, error: "Not found" });
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return {
    async start() {
      for (let index = 0; index < hosts.length; index += 1) {
        const host = hosts[index];
        const server = http.createServer(handleRequest);
        const port = index === 0 ? listenPort : actualPort;

        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, host, () => {
            server.off("error", reject);
            const address = server.address();
            actualPort = typeof address === "object" && address ? address.port : port;
            servers.push(server);
            resolve();
          });
        });
      }
    },
    async stop() {
      await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      })));
      servers.length = 0;
    },
    get port() {
      return actualPort;
    }
  };
}
