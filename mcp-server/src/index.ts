import { fileURLToPath } from "node:url";
import { DesignCache } from "./cache.js";
import { createHttpServer } from "./http.js";
import { createMcpServer, connectStdioServer } from "./server.js";
import { createProxyToolHandlers } from "./proxy.js";
import { createToolHandlers } from "./tools.js";
import { logger } from "./logger.js";

export { DesignCache } from "./cache.js";
export { createHttpServer } from "./http.js";
export { createToolHandlers } from "./tools.js";
export { createProxyToolHandlers } from "./proxy.js";
export { createMcpServer, connectStdioServer } from "./server.js";

function isAddressInUse(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "EADDRINUSE";
}

async function getHealthyBridgeBaseUrl(port: number): Promise<string | null> {
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(1000)
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    return body && body.ok === true ? baseUrl : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.MCP_HTTP_PORT || "7800");
  const existingBridgeBaseUrl = await getHealthyBridgeBaseUrl(port);
  if (existingBridgeBaseUrl) {
    logger.info(`[figma-design-mcp] Proxying to existing HTTP bridge at ${existingBridgeBaseUrl}`);
    await connectStdioServer(createMcpServer(new DesignCache(), createProxyToolHandlers(existingBridgeBaseUrl)));
    return;
  }

  const cache = new DesignCache();
  const httpServer = createHttpServer({ cache, port });

  try {
    await httpServer.start();
  } catch (error) {
    if (!isAddressInUse(error)) {
      throw error;
    }

    const bridgeBaseUrl = await getHealthyBridgeBaseUrl(port);
    if (!bridgeBaseUrl) {
      throw new Error(`Port ${port} is already in use, but it does not look like a healthy figma-design bridge.`);
    }

    logger.info(`[figma-design-mcp] Port ${port} is already served by ${bridgeBaseUrl}; starting MCP proxy mode.`);
    await connectStdioServer(createMcpServer(new DesignCache(), createProxyToolHandlers(bridgeBaseUrl)));
    return;
  }

  logger.info(`[figma-design-mcp] HTTP server listening on 127.0.0.1:${httpServer.port}`);
  await connectStdioServer(createMcpServer(cache));
}

const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) : "";
if (process.argv[1] && entryPath === process.argv[1]) {
  main().catch((error) => {
    logger.error(`[figma-design-mcp] ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
