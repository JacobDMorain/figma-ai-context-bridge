import { fileURLToPath } from "node:url";
import { DesignCache } from "./cache.js";
import { createHttpServer } from "./http.js";
import { createMcpServer, connectStdioServer } from "./server.js";
import { createToolHandlers } from "./tools.js";
import { logger } from "./logger.js";

export { DesignCache } from "./cache.js";
export { createHttpServer } from "./http.js";
export { createToolHandlers } from "./tools.js";
export { createMcpServer, connectStdioServer } from "./server.js";

async function main(): Promise<void> {
  const cache = new DesignCache();
  const port = Number(process.env.MCP_HTTP_PORT || "7800");
  const httpServer = createHttpServer({ cache, port });
  const mcpServer = createMcpServer(cache);

  await httpServer.start();
  logger.info(`[figma-design-mcp] HTTP server listening on 127.0.0.1:${httpServer.port}`);
  await connectStdioServer(mcpServer);
}

const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) : "";
if (process.argv[1] && entryPath === process.argv[1]) {
  main().catch((error) => {
    logger.error(`[figma-design-mcp] ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
