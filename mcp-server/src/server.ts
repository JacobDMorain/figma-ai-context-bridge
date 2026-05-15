import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { DesignCache } from "./cache.js";
import { createToolHandlers } from "./tools.js";

const QueryShape = {
  fileKey: z.string().optional(),
  pageId: z.string().optional(),
  sessionId: z.string().optional()
};

function jsonResource(uri: string, text: string) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text
      }
    ]
  };
}

export function createMcpServer(cache: DesignCache): McpServer {
  const server = new McpServer({
    name: "figma-design",
    version: "0.1.0"
  });
  const tools = createToolHandlers(cache);

  server.registerTool("get_connection_status", {
    title: "Get Figma MCP connection status",
    description: "Returns plugin connection freshness and cache availability.",
    inputSchema: QueryShape
  }, async (args) => tools.getConnectionStatus(args));

  server.registerTool("get_design_summary", {
    title: "Get Figma design summary",
    description: "Returns the latest AI summary payload pushed by the Figma plugin.",
    inputSchema: QueryShape
  }, async (args) => tools.getDesignSummary(args));

  server.registerTool("get_design_selection", {
    title: "Get Figma design selection",
    description: "Returns the latest AI detail selection payload pushed by the Figma plugin.",
    inputSchema: {
      ...QueryShape,
      format: z.enum(["full", "compact"]).optional()
    }
  }, async (args) => tools.getDesignSelection(args));

  server.registerTool("get_design_diff", {
    title: "Get Figma design diff",
    description: "Returns the latest AI diff payload pushed by the Figma plugin.",
    inputSchema: {
      ...QueryShape,
      format: z.enum(["full", "compact"]).optional()
    }
  }, async (args) => tools.getDesignDiff(args));

  server.registerTool("get_design_tokens", {
    title: "Get Figma design tokens",
    description: "Returns design tokens from the latest AI detail payload, falling back to summary.",
    inputSchema: {
      ...QueryShape,
      category: z.enum(["all", "colors", "typography", "spacing"]).optional()
    }
  }, async (args) => tools.getDesignTokens(args));

  server.registerTool("get_component_definitions", {
    title: "Get Figma component definitions",
    description: "Returns component definitions from the latest pushed AI design payload.",
    inputSchema: {
      ...QueryShape,
      componentId: z.string().optional()
    }
  }, async (args) => tools.getComponentDefinitions(args));

  server.registerTool("get_design_node", {
    title: "Get Figma design node",
    description: "Finds a node by id in the latest pushed AI detail or summary payload.",
    inputSchema: {
      ...QueryShape,
      nodeId: z.string(),
      includeChildren: z.boolean().optional(),
      source: z.enum(["auto", "selection", "summary"]).optional()
    }
  }, async (args) => tools.getDesignNode(args));

  server.registerTool("search_nodes", {
    title: "Search Figma design nodes",
    description: "Searches nodes by id, name, type, component id, text, or conservative AI hints.",
    inputSchema: {
      ...QueryShape,
      query: z.string().optional(),
      type: z.string().optional(),
      limit: z.number().optional(),
      includeHidden: z.boolean().optional()
    }
  }, async (args) => tools.searchNodes(args));

  server.registerResource("figma-status", "figma://status", {
    title: "Figma MCP connection status",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getConnectionStatus()).content[0].text));

  server.registerResource("figma-summary", "figma://summary", {
    title: "Latest Figma design summary",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getDesignSummary()).content[0].text));

  server.registerResource("figma-selection", "figma://selection", {
    title: "Latest Figma design selection detail",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getDesignSelection()).content[0].text));

  server.registerResource("figma-diff", "figma://diff", {
    title: "Latest Figma design diff",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getDesignDiff()).content[0].text));

  server.registerResource("figma-tokens", "figma://tokens", {
    title: "Latest Figma design tokens",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getDesignTokens()).content[0].text));

  server.registerResource("figma-components", "figma://components", {
    title: "Latest Figma component definitions",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, (await tools.getComponentDefinitions()).content[0].text));

  server.registerPrompt("implement-design", {
    title: "Implement Figma design",
    description: "Guides an agent through using the Figma MCP tools to implement the current design selection.",
    argsSchema: {
      framework: z.string().optional(),
      styling: z.string().optional(),
      target: z.string().optional()
    }
  }, async ({ framework, styling, target }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Implement the current Figma selection using the figma-design MCP server.",
            "First call get_connection_status and confirm the data is fresh.",
            "Then read get_design_summary, use search_nodes/get_design_node for details, and use get_design_tokens plus get_component_definitions before writing code.",
            `Framework: ${framework || "use the existing project framework"}.`,
            `Styling: ${styling || "use the existing project styling system"}.`,
            `Target: ${target || "current implementation task"}.`
          ].join("\n")
        }
      }
    ]
  }));

  server.registerPrompt("review-design", {
    title: "Review Figma design implementation",
    description: "Guides an agent through reviewing implementation fidelity against the current Figma selection.",
    argsSchema: {
      focus: z.string().optional()
    }
  }, async ({ focus }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Review the implementation against the current Figma selection.",
            "Call get_connection_status, get_design_summary, and then get_design_selection or get_design_node for the relevant areas.",
            "Check layout, spacing, typography, colors, component reuse, interactions, and any missing assets.",
            `Focus: ${focus || "visual fidelity and production readiness"}.`
          ].join("\n")
        }
      }
    ]
  }));

  server.registerPrompt("extract-design-system", {
    title: "Extract Figma design system",
    description: "Guides an agent through extracting design tokens and component definitions from Figma MCP data.",
    argsSchema: {
      format: z.enum(["css", "tailwind", "json"]).optional()
    }
  }, async ({ format }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Extract a reusable design system from the current Figma MCP data.",
            "Call get_design_tokens and get_component_definitions, then inspect key nodes with search_nodes/get_design_node as needed.",
            `Output format: ${format || "json"}.`
          ].join("\n")
        }
      }
    ]
  }));

  return server;
}

export async function connectStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
