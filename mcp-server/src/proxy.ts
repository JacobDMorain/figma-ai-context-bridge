import type { createToolHandlers } from "./tools.js";

interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

type ToolHandlers = ReturnType<typeof createToolHandlers>;

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

async function callBroker(baseUrl: string, name: string, args: unknown): Promise<ToolResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tool/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arguments: args || {} })
    });
  } catch (error) {
    return jsonResult({
      ok: false,
      message: `Figma bridge proxy request failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body || typeof body !== "object" || !("result" in body)) {
    return jsonResult({
      ok: false,
      message: `Figma bridge proxy returned HTTP ${response.status}`,
      error: body
    });
  }

  return (body as { result: ToolResult }).result;
}

export function createProxyToolHandlers(baseUrl: string): ToolHandlers {
  return {
    getConnectionStatus: (args = {}) => callBroker(baseUrl, "get_connection_status", args),
    getDesignSummary: (args = {}) => callBroker(baseUrl, "get_design_summary", args),
    getDesignSelection: (args = {}) => callBroker(baseUrl, "get_design_selection", args),
    getDesignDiff: (args = {}) => callBroker(baseUrl, "get_design_diff", args),
    getDesignTokens: (args = {}) => callBroker(baseUrl, "get_design_tokens", args),
    getComponentDefinitions: (args = {}) => callBroker(baseUrl, "get_component_definitions", args),
    getDesignNode: (args) => callBroker(baseUrl, "get_design_node", args),
    searchNodes: (args = {}) => callBroker(baseUrl, "search_nodes", args)
  };
}
