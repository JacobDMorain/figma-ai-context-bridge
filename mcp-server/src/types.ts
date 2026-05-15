export interface CacheKey {
  fileKey: string;
  pageId: string;
  sessionId: string;
}

export interface CacheQuery {
  fileKey?: string;
  pageId?: string;
  sessionId?: string;
}

export interface HeartbeatInput extends CacheKey {
  pluginVersion?: string;
}

export interface CacheEntry<T> {
  data: T;
  updatedAt: number;
  selectionHash: string;
  sessionId: string;
}

export interface ConnectionState {
  lastHeartbeat: number;
  pluginVersion: string;
  fileKey: string | null;
  pageId: string | null;
  sessionId: string;
}

export interface CacheStatus {
  connected: boolean;
  lastHeartbeat: number | null;
  lastPushAt: number | null;
  activeFileKey: string | null;
  activePageId: string | null;
  activeSessionId: string | null;
  pluginVersion: string | null;
  hasSummary: boolean;
  hasSelection: boolean;
  hasDiff: boolean;
  hasNodeDetails: boolean;
  pendingDetailCount: number;
}

export type NodeDetailScope = "subtree";

export interface NodeDetailRequest {
  requestId: string;
  type: "node-detail";
  nodeId: string;
  scope: NodeDetailScope;
  status: "pending" | "fulfilled" | "error";
  createdAt: number;
  updatedAt: number;
  error?: string;
}
