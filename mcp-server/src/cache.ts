import type { CacheEntry, CacheKey, CacheQuery, CacheStatus, ConnectionState, HeartbeatInput, NodeDetailRequest, NodeDetailScope } from "./types.js";

interface DesignCacheOptions {
  now?: () => number;
  dataTtlMs?: number;
  heartbeatTtlMs?: number;
  requestTtlMs?: number;
}

interface StoredRecord {
  key: CacheKey;
  summary?: CacheEntry<unknown>;
  selection?: CacheEntry<unknown>;
  diff?: CacheEntry<unknown>;
  nodeDetails: Map<string, CacheEntry<unknown>>;
  detailRequests: Map<string, NodeDetailRequest>;
  connection?: ConnectionState;
  lastActivity: number;
}

const DEFAULT_DATA_TTL_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_TTL_MS = 30 * 1000;
const DEFAULT_REQUEST_TTL_MS = 30 * 1000;

export class DesignCache {
  private readonly now: () => number;
  private readonly dataTtlMs: number;
  private readonly heartbeatTtlMs: number;
  private readonly requestTtlMs: number;
  private readonly records = new Map<string, StoredRecord>();
  private activeKey: string | null = null;
  private requestCounter = 0;

  constructor(options: DesignCacheOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.dataTtlMs = options.dataTtlMs ?? DEFAULT_DATA_TTL_MS;
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? DEFAULT_HEARTBEAT_TTL_MS;
    this.requestTtlMs = options.requestTtlMs ?? DEFAULT_REQUEST_TTL_MS;
  }

  putSummary(key: CacheKey, data: unknown): void {
    this.writeData(key, "summary", data);
  }

  putSelection(key: CacheKey, data: unknown): void {
    this.writeData(key, "selection", data);
  }

  putDiff(key: CacheKey, data: unknown): void {
    this.writeData(key, "diff", data);
  }

  putNodeDetail(key: CacheKey, nodeId: string, data: unknown): void {
    const record = this.ensureRecord(key);
    const timestamp = this.now();
    record.nodeDetails.set(nodeId, {
      data,
      updatedAt: timestamp,
      selectionHash: this.hashData(data),
      sessionId: key.sessionId
    });
    record.lastActivity = timestamp;
    this.activeKey = this.keyString(key);
  }

  getSummary(query?: CacheQuery): unknown | null {
    const record = this.findRecord(query);
    return this.readEntry(record?.summary);
  }

  getSelection(query?: CacheQuery): unknown | null {
    const record = this.findRecord(query);
    return this.readEntry(record?.selection);
  }

  getDiff(query?: CacheQuery): unknown | null {
    const record = this.findRecord(query);
    return this.readEntry(record?.diff);
  }

  getNodeDetail(query: CacheQuery | undefined, nodeId: string): unknown | null {
    const record = this.findRecord(query);
    return this.readEntry(record?.nodeDetails.get(nodeId));
  }

  createNodeDetailRequest(key: CacheKey, nodeId: string, scope: NodeDetailScope = "subtree"): NodeDetailRequest {
    const record = this.ensureRecord(key);
    this.cleanupRequests(record);
    const existing = Array.from(record.detailRequests.values()).find((request) => {
      return request.status === "pending" && request.nodeId === nodeId && request.scope === scope;
    });
    if (existing) {
      return existing;
    }

    const timestamp = this.now();
    this.requestCounter += 1;
    const request: NodeDetailRequest = {
      requestId: `detail-${timestamp}-${this.requestCounter}`,
      type: "node-detail",
      nodeId,
      scope,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    record.detailRequests.set(request.requestId, request);
    record.lastActivity = timestamp;
    this.activeKey = this.keyString(key);
    return request;
  }

  getPendingDetailRequests(query?: CacheQuery): NodeDetailRequest[] {
    const record = this.findRecord(query);
    if (!record) {
      return [];
    }
    this.cleanupRequests(record);
    return Array.from(record.detailRequests.values())
      .filter((request) => request.status === "pending")
      .map((request) => ({ ...request }));
  }

  getNodeDetailRequest(query: CacheQuery | undefined, requestId: string): NodeDetailRequest | null {
    const record = this.findRecord(query);
    if (!record) {
      return null;
    }
    this.cleanupRequests(record);
    const request = record.detailRequests.get(requestId);
    return request ? { ...request } : null;
  }

  fulfillNodeDetailRequest(key: CacheKey, requestId: string, nodeId: string, data: unknown): void {
    const record = this.ensureRecord(key);
    this.putNodeDetail(key, nodeId, data);
    const timestamp = this.now();
    const request = record.detailRequests.get(requestId) || {
      requestId,
      type: "node-detail" as const,
      nodeId,
      scope: "subtree" as const,
      status: "pending" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    record.detailRequests.set(requestId, {
      ...request,
      nodeId,
      status: "fulfilled",
      updatedAt: timestamp
    });
    record.lastActivity = timestamp;
  }

  failNodeDetailRequest(key: CacheKey, requestId: string, nodeId: string, error: string): void {
    const record = this.ensureRecord(key);
    const timestamp = this.now();
    const request = record.detailRequests.get(requestId) || {
      requestId,
      type: "node-detail" as const,
      nodeId,
      scope: "subtree" as const,
      status: "pending" as const,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    record.detailRequests.set(requestId, {
      ...request,
      nodeId,
      status: "error",
      error,
      updatedAt: timestamp
    });
    record.lastActivity = timestamp;
    this.activeKey = this.keyString(key);
  }

  heartbeat(input: HeartbeatInput): void {
    const record = this.ensureRecord(input);
    const timestamp = this.now();
    record.connection = {
      lastHeartbeat: timestamp,
      pluginVersion: input.pluginVersion || "",
      fileKey: input.fileKey,
      pageId: input.pageId,
      sessionId: input.sessionId
    };
    record.lastActivity = timestamp;
    this.activeKey = this.keyString(input);
  }

  getStatus(query?: CacheQuery): CacheStatus {
    const record = this.findRecord(query);
    const summary = this.readEntry(record?.summary);
    const selection = this.readEntry(record?.selection);
    const diff = this.readEntry(record?.diff);
    if (record) {
      this.cleanupRequests(record);
    }
    const hasNodeDetails = record ? Array.from(record.nodeDetails.values()).some((entry) => this.readEntry(entry) !== null) : false;
    const pendingDetailCount = record ? Array.from(record.detailRequests.values()).filter((request) => request.status === "pending").length : 0;
    const connection = record?.connection;
    const lastHeartbeat = connection?.lastHeartbeat ?? null;
    const connected = typeof lastHeartbeat === "number" && this.now() - lastHeartbeat <= this.heartbeatTtlMs;
    const latestNodeDetailAt = record ? Math.max(0, ...Array.from(record.nodeDetails.values()).map((entry) => entry.updatedAt)) : 0;
    const lastPushAt = Math.max(record?.summary?.updatedAt || 0, record?.selection?.updatedAt || 0, record?.diff?.updatedAt || 0, latestNodeDetailAt) || null;

    return {
      connected,
      lastHeartbeat,
      lastPushAt,
      activeFileKey: record?.key.fileKey ?? null,
      activePageId: record?.key.pageId ?? null,
      activeSessionId: record?.key.sessionId ?? null,
      pluginVersion: connection?.pluginVersion || null,
      hasSummary: summary !== null,
      hasSelection: selection !== null,
      hasDiff: diff !== null,
      hasNodeDetails,
      pendingDetailCount
    };
  }

  private writeData(key: CacheKey, field: "summary" | "selection" | "diff", data: unknown): void {
    const record = this.ensureRecord(key);
    const timestamp = this.now();
    record[field] = {
      data,
      updatedAt: timestamp,
      selectionHash: this.hashData(data),
      sessionId: key.sessionId
    };
    record.lastActivity = timestamp;
    this.activeKey = this.keyString(key);
  }

  private ensureRecord(key: CacheKey): StoredRecord {
    const id = this.keyString(key);
    let record = this.records.get(id);
    if (!record) {
      record = {
        key: {
          fileKey: key.fileKey,
          pageId: key.pageId,
          sessionId: key.sessionId
        },
        nodeDetails: new Map(),
        detailRequests: new Map(),
        lastActivity: this.now()
      };
      this.records.set(id, record);
    }
    return record;
  }

  private findRecord(query?: CacheQuery): StoredRecord | undefined {
    if (query?.fileKey || query?.pageId || query?.sessionId) {
      const matches = Array.from(this.records.values()).filter((record) => {
        if (query.fileKey && record.key.fileKey !== query.fileKey) {
          return false;
        }
        if (query.pageId && record.key.pageId !== query.pageId) {
          return false;
        }
        if (query.sessionId && record.key.sessionId !== query.sessionId) {
          return false;
        }
        return true;
      });
      return matches.sort((a, b) => b.lastActivity - a.lastActivity)[0];
    }

    if (this.activeKey) {
      return this.records.get(this.activeKey);
    }

    return Array.from(this.records.values()).sort((a, b) => b.lastActivity - a.lastActivity)[0];
  }

  private readEntry(entry?: CacheEntry<unknown>): unknown | null {
    if (!entry) {
      return null;
    }
    if (this.now() - entry.updatedAt > this.dataTtlMs) {
      return null;
    }
    return entry.data;
  }

  private cleanupRequests(record: StoredRecord): void {
    const timestamp = this.now();
    for (const request of record.detailRequests.values()) {
      if (timestamp - request.updatedAt > this.requestTtlMs) {
        record.detailRequests.delete(request.requestId);
      }
    }
  }

  private keyString(key: CacheKey): string {
    return `${key.fileKey}\u0000${key.pageId}\u0000${key.sessionId}`;
  }

  private hashData(data: unknown): string {
    const serialized = JSON.stringify(data);
    return `${serialized.length}:${serialized}`;
  }
}
