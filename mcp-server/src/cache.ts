import type { CacheEntry, CacheKey, CacheQuery, CacheStatus, ConnectionState, HeartbeatInput } from "./types.js";

interface DesignCacheOptions {
  now?: () => number;
  dataTtlMs?: number;
  heartbeatTtlMs?: number;
}

interface StoredRecord {
  key: CacheKey;
  summary?: CacheEntry<unknown>;
  selection?: CacheEntry<unknown>;
  diff?: CacheEntry<unknown>;
  connection?: ConnectionState;
  lastActivity: number;
}

const DEFAULT_DATA_TTL_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_TTL_MS = 30 * 1000;

export class DesignCache {
  private readonly now: () => number;
  private readonly dataTtlMs: number;
  private readonly heartbeatTtlMs: number;
  private readonly records = new Map<string, StoredRecord>();
  private activeKey: string | null = null;

  constructor(options: DesignCacheOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.dataTtlMs = options.dataTtlMs ?? DEFAULT_DATA_TTL_MS;
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? DEFAULT_HEARTBEAT_TTL_MS;
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
    const connection = record?.connection;
    const lastHeartbeat = connection?.lastHeartbeat ?? null;
    const connected = typeof lastHeartbeat === "number" && this.now() - lastHeartbeat <= this.heartbeatTtlMs;
    const lastPushAt = Math.max(record?.summary?.updatedAt || 0, record?.selection?.updatedAt || 0, record?.diff?.updatedAt || 0) || null;

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
      hasDiff: diff !== null
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

  private keyString(key: CacheKey): string {
    return `${key.fileKey}\u0000${key.pageId}\u0000${key.sessionId}`;
  }

  private hashData(data: unknown): string {
    const serialized = JSON.stringify(data);
    return `${serialized.length}:${serialized}`;
  }
}
