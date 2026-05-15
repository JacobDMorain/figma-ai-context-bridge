import type { DesignCache } from "./cache.js";
import type { CacheKey, CacheQuery, NodeDetailScope } from "./types.js";

const EMPTY_MESSAGE = "Open Export Panel in Figma and push a selection first.";

interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

interface FormatQuery extends CacheQuery {
  format?: "full" | "compact";
}

interface TokenQuery extends CacheQuery {
  category?: "all" | "colors" | "typography" | "spacing";
}

interface ComponentQuery extends CacheQuery {
  componentId?: string;
}

interface NodeQuery extends CacheQuery {
  nodeId: string;
  includeChildren?: boolean;
  source?: "auto" | "selection" | "summary";
  detail?: "auto" | "summary-only";
  scope?: NodeDetailScope;
  waitMs?: number;
}

interface SearchQuery extends CacheQuery {
  query?: string;
  type?: string;
  limit?: number;
  includeHidden?: boolean;
}

interface DesignPayload {
  metadata?: unknown;
  designTokens?: Record<string, unknown>;
  componentDefinitions?: Record<string, unknown>;
  nodes?: unknown[];
}

interface FlattenedNode {
  node: Record<string, unknown>;
  path: string[];
  pathString: string;
  depth: number;
  parentId?: string;
}

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

function emptyResult(): ToolResult {
  return jsonResult({
    ok: false,
    message: EMPTY_MESSAGE
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asPayload(value: unknown): DesignPayload | null {
  return isRecord(value) ? value as DesignPayload : null;
}

function compactSelection(payload: unknown): unknown {
  const source = asPayload(payload);
  if (!source || !Array.isArray(source.nodes)) {
    return payload;
  }

  return {
    metadata: source.metadata,
    nodes: source.nodes.map(compactNode)
  };
}

function compactDiff(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  return {
    metadata: payload.metadata,
    changed: Array.isArray(payload.changed) ? payload.changed.map(compactNode) : [],
    removed: Array.isArray(payload.removed) ? payload.removed : [],
    unchangedCount: typeof payload.unchangedCount === "number" ? payload.unchangedCount : 0
  };
}

function compactNode(node: unknown): Record<string, unknown> | unknown {
  if (!isRecord(node)) {
    return node;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const result: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
    componentId: node.componentId,
    childCount: children.length
  };
  if (children.length) {
    result.children = children.map(compactNode);
  }
  return result;
}

function cloneNodeWithoutDescendants(node: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    if (key !== "children") {
      result[key] = node[key];
    }
  }
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length) {
    result.children = children.map(compactNode);
  }
  return result;
}

function getNodeName(node: Record<string, unknown>): string {
  return typeof node.name === "string" && node.name ? node.name : String(node.id || "Unnamed");
}

function getNodeId(node: Record<string, unknown>): string | null {
  return typeof node.id === "string" ? node.id : null;
}

function flattenNodes(nodes: unknown[], path: string[] = [], depth = 0, parentId?: string): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    const currentPath = path.concat(getNodeName(node));
    const id = getNodeId(node) || undefined;
    result.push({
      node,
      path: currentPath,
      pathString: currentPath.join(" / "),
      depth,
      parentId
    });
    if (Array.isArray(node.children)) {
      result.push(...flattenNodes(node.children, currentPath, depth + 1, id));
    }
  }
  return result;
}

function getPreferredPayload(cache: DesignCache, query: CacheQuery): { data: unknown | null; source: "selection" | "summary" } {
  const selection = cache.getSelection(query);
  if (selection !== null) {
    return { data: selection, source: "selection" };
  }
  return { data: cache.getSummary(query), source: "summary" };
}

function getPayloadBySource(cache: DesignCache, query: NodeQuery): { data: unknown | null; source: "selection" | "summary" } {
  if (query.source === "selection") {
    return { data: cache.getSelection(query), source: "selection" };
  }
  if (query.source === "summary") {
    return { data: cache.getSummary(query), source: "summary" };
  }
  return getPreferredPayload(cache, query);
}

function getTextPreview(node: Record<string, unknown>): string | undefined {
  const text = isRecord(node.text) ? node.text : null;
  const characters = text && typeof text.characters === "string" ? text.characters : undefined;
  if (!characters) {
    return undefined;
  }
  return characters.length > 80 ? `${characters.slice(0, 77)}...` : characters;
}

function isHidden(node: Record<string, unknown>): boolean {
  if (node.visible === false) {
    return true;
  }
  return isRecord(node.figma) && node.figma.visible === false;
}

function matchesSearch(item: FlattenedNode, queryText: string, type?: string): boolean {
  const node = item.node;
  if (type && String(node.type || "").toLowerCase() !== type.toLowerCase()) {
    return false;
  }
  if (!queryText) {
    return true;
  }
  const text = getTextPreview(node) || "";
  const hints = isRecord(node.hints) ? node.hints : {};
  const haystack = [
    node.id,
    node.name,
    node.type,
    node.componentId,
    text,
    hints.htmlTag
  ].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return haystack.includes(queryText.toLowerCase());
}

function searchResult(item: FlattenedNode): Record<string, unknown> {
  const node = item.node;
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    path: item.path,
    pathString: item.pathString,
    depth: item.depth,
    parentId: item.parentId,
    componentId: node.componentId,
    childCount: children.length,
    textPreview: getTextPreview(node)
  };
}

function queryToKey(status: ReturnType<DesignCache["getStatus"]>): CacheKey | null {
  if (!status.activeFileKey || !status.activePageId || !status.activeSessionId) {
    return null;
  }
  return {
    fileKey: status.activeFileKey,
    pageId: status.activePageId,
    sessionId: status.activeSessionId
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNodeInPayload(payload: unknown, nodeId: string): FlattenedNode | null {
  const designPayload = asPayload(payload);
  if (!designPayload || !Array.isArray(designPayload.nodes)) {
    return null;
  }
  return flattenNodes(designPayload.nodes).find((item) => item.node.id === nodeId) || null;
}

export function createToolHandlers(cache: DesignCache) {
  return {
    async getConnectionStatus(query: CacheQuery = {}): Promise<ToolResult> {
      return jsonResult(cache.getStatus(query));
    },

    async getDesignSummary(query: CacheQuery = {}): Promise<ToolResult> {
      const data = cache.getSummary(query);
      if (data === null) {
        return emptyResult();
      }

      return jsonResult({
        ok: true,
        data
      });
    },

    async getDesignSelection(query: FormatQuery = {}): Promise<ToolResult> {
      const data = cache.getSelection(query);
      if (data === null) {
        return emptyResult();
      }

      return jsonResult({
        ok: true,
        data: query.format === "compact" ? compactSelection(data) : data
      });
    },

    async getDesignDiff(query: FormatQuery = {}): Promise<ToolResult> {
      const data = cache.getDiff(query);
      if (data === null) {
        return emptyResult();
      }

      return jsonResult({
        ok: true,
        data: query.format === "compact" ? compactDiff(data) : data
      });
    },

    async getDesignTokens(query: TokenQuery = {}): Promise<ToolResult> {
      const { data, source } = getPreferredPayload(cache, query);
      const payload = asPayload(data);
      if (!payload) {
        return emptyResult();
      }
      const tokens = payload.designTokens || {};
      const category = query.category || "all";
      return jsonResult({
        ok: true,
        source,
        data: category === "all" ? tokens : tokens[category] || {}
      });
    },

    async getComponentDefinitions(query: ComponentQuery = {}): Promise<ToolResult> {
      const { data, source } = getPreferredPayload(cache, query);
      const payload = asPayload(data);
      if (!payload) {
        return emptyResult();
      }
      const definitions = payload.componentDefinitions || {};
      return jsonResult({
        ok: true,
        source,
        data: query.componentId ? definitions[query.componentId] || null : definitions
      });
    },

    async getDesignNode(query: NodeQuery): Promise<ToolResult> {
      if (query.source !== "summary" && query.detail !== "summary-only") {
        const selectionMatch = findNodeInPayload(cache.getSelection(query), query.nodeId);
        if (selectionMatch) {
          return jsonResult({
            ok: true,
            source: "selection",
            path: selectionMatch.path,
            pathString: selectionMatch.pathString,
            data: query.includeChildren ? selectionMatch.node : cloneNodeWithoutDescendants(selectionMatch.node)
          });
        }

        const detailMatch = findNodeInPayload(cache.getNodeDetail(query, query.nodeId), query.nodeId);
        if (detailMatch) {
          return jsonResult({
            ok: true,
            source: "node-detail",
            path: detailMatch.path,
            pathString: detailMatch.pathString,
            data: query.includeChildren ? detailMatch.node : cloneNodeWithoutDescendants(detailMatch.node)
          });
        }
      }

      const summaryMatch = findNodeInPayload(cache.getSummary(query), query.nodeId);
      if (!summaryMatch) {
        return jsonResult({
          ok: false,
          message: `Node not found: ${query.nodeId}`
        });
      }

      if (query.detail === "summary-only" || query.source === "summary") {
        return jsonResult({
          ok: true,
          source: "summary",
          path: summaryMatch.path,
          pathString: summaryMatch.pathString,
          data: query.includeChildren ? summaryMatch.node : cloneNodeWithoutDescendants(summaryMatch.node)
        });
      }

      const status = cache.getStatus(query);
      const key = queryToKey(status);
      if (!status.connected || !key) {
        return jsonResult({
          ok: true,
          source: "summary",
          path: summaryMatch.path,
          pathString: summaryMatch.pathString,
          data: query.includeChildren ? summaryMatch.node : cloneNodeWithoutDescendants(summaryMatch.node)
        });
      }

      const scope = query.scope || "subtree";
      const request = cache.createNodeDetailRequest(key, query.nodeId, scope);
      const waitMs = Math.min(Math.max(typeof query.waitMs === "number" ? query.waitMs : 10000, 0), 15000);
      const deadline = Date.now() + waitMs;

      while (Date.now() <= deadline) {
        const detailMatch = findNodeInPayload(cache.getNodeDetail(key, query.nodeId), query.nodeId);
        if (detailMatch) {
          return jsonResult({
            ok: true,
            source: "node-detail",
            path: detailMatch.path,
            pathString: detailMatch.pathString,
            data: query.includeChildren ? detailMatch.node : cloneNodeWithoutDescendants(detailMatch.node)
          });
        }

        const currentRequest = cache.getNodeDetailRequest(key, request.requestId);
        if (currentRequest?.status === "error") {
          return jsonResult({
            ok: false,
            status: "error",
            requestId: request.requestId,
            message: currentRequest.error || `Node detail failed: ${query.nodeId}`
          });
        }

        if (waitMs === 0) {
          break;
        }
        await sleep(Math.min(50, Math.max(1, deadline - Date.now())));
      }

      return jsonResult({
        ok: false,
        status: "pending",
        requestId: request.requestId,
        nodeId: query.nodeId,
        scope,
        message: "Node detail request is pending. Keep the Figma export panel open and call get_design_node again."
      });
    },

    async searchNodes(query: SearchQuery = {}): Promise<ToolResult> {
      const { data, source } = getPreferredPayload(cache, query);
      const payload = asPayload(data);
      if (!payload || !Array.isArray(payload.nodes)) {
        return emptyResult();
      }
      const queryText = query.query || "";
      const limit = Math.min(Math.max(Math.floor(query.limit || 20), 1), 100);
      const results = flattenNodes(payload.nodes)
        .filter((item) => query.includeHidden || !isHidden(item.node))
        .filter((item) => matchesSearch(item, queryText, query.type))
        .slice(0, limit)
        .map(searchResult);

      return jsonResult({
        ok: true,
        source,
        count: results.length,
        results
      });
    }
  };
}
