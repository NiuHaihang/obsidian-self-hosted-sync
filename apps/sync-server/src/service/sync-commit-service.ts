import { ERROR_CODES } from "../../../../packages/shared-contracts/types/errors.js";
import { mergeSnapshots, type MergeConflictItem } from "../merge/three-way-merge.js";
import { AppError } from "../api/error.js";
import {
  type ChangeOperation,
  type ContentEncoding,
  type PullResult,
  type SyncRepository,
  type SyncRepositoryTx,
  type TxCapableSyncRepository
} from "../repository/sync-repository.interface.js";
import { SyncAuditService } from "./sync-audit-service.js";
import { decodeTransportContent, encodeSnapshotValueForTransport } from "./content-encoding.js";

export interface PushChangesRequest {
  client_id: string;
  idempotency_key: string;
  base_version: number;
  expected_head: number;
  ops: ChangeOperation[];
}

export interface PushChangesResponse {
  applied: boolean;
  new_head_version: number;
  merge_result: "fast_forward" | "merged" | "conflict";
  conflict_set_id?: string;
}

export interface ResolveRequest {
  expected_head: number;
  resolutions: Array<{
    path: string;
    strategy: "ours" | "theirs" | "manual";
    content_b64?: string;
    content_encoding?: ContentEncoding;
    delete?: boolean;
  }>;
}

function buildSnapshotOps(from: Record<string, string>, to: Record<string, string>): ChangeOperation[] {
  const allPaths = new Set<string>([...Object.keys(from), ...Object.keys(to)]);
  const sortedPaths = [...allPaths].sort((a, b) => a.localeCompare(b));
  const ops: ChangeOperation[] = [];

  for (const path of sortedPaths) {
    const before = path in from ? from[path] : undefined;
    const after = path in to ? to[path] : undefined;

    if (after === undefined && before !== undefined) {
      ops.push({ op_type: "delete", path });
      continue;
    }

    if (after !== undefined && before !== after) {
      const encoded = encodeSnapshotValueForTransport(after);
      ops.push({
        op_type: "upsert",
        path,
        content_b64: encoded.content_b64,
        content_encoding: encoded.content_encoding
      });
    }
  }

  return ops;
}

function applyOps(base: Record<string, string>, ops: ChangeOperation[]): Record<string, string> {
  const next = { ...base };
  for (const op of ops) {
    if (op.op_type === "upsert") {
      next[op.path] = decodeTransportContent(op.content_b64, op.content_encoding);
      continue;
    }

    if (op.op_type === "delete") {
      delete next[op.path];
      continue;
    }

    if (op.op_type === "rename" && op.new_path) {
      const current = next[op.path];
      delete next[op.path];
      if (typeof current === "string") {
        next[op.new_path] = current;
      }
    }
  }

  return next;
}

function mergeResultHasConflict(conflicts: MergeConflictItem[]): boolean {
  return conflicts.length > 0;
}

export class SyncCommitService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly auditService: SyncAuditService
  ) {}

  private async inTransaction<T>(work: (tx: SyncRepositoryTx) => Promise<T>): Promise<T> {
    const candidate = this.repository as SyncRepository & Partial<TxCapableSyncRepository>;
    if (typeof candidate.withTransaction === "function") {
      return candidate.withTransaction(work);
    }

    return work(this.repository as SyncRepositoryTx);
  }

  async push(spaceId: string, payload: PushChangesRequest, requestId: string): Promise<PushChangesResponse> {
    return this.inTransaction(async (tx) => {
      const cached = await tx.getIdempotentResult(spaceId, payload.idempotency_key);
      if (cached) {
        return {
          applied: true,
          new_head_version: cached.newHeadVersion,
          merge_result: cached.mergeResult,
          conflict_set_id: cached.conflictSetId
        };
      }

      const headBefore = await tx.getHeadVersion(spaceId);
      if (payload.expected_head !== headBefore) {
        throw new AppError(
          412,
          ERROR_CODES.EXPECTED_HEAD_MISMATCH,
          "Expected head does not match current server head",
          true,
          { expected_head: payload.expected_head, actual_head: headBefore }
        );
      }

      const baseSnapshot = await tx.getSnapshot(spaceId, payload.base_version);
      if (!baseSnapshot) {
        throw new AppError(
          409,
          ERROR_CODES.VERSION_TOO_OLD,
          "Base version is too old or unavailable",
          false,
          { base_version: payload.base_version }
        );
      }

      const remoteSnapshot = (await tx.getSnapshot(spaceId, headBefore)) ?? {};
      const localSnapshot = applyOps(baseSnapshot, payload.ops);

      const merged = mergeSnapshots(baseSnapshot, localSnapshot, remoteSnapshot, {
        clientId: payload.client_id
      });
      const commitOps = buildSnapshotOps(remoteSnapshot, merged.snapshot);

      let conflictSetId: string | undefined;
      if (mergeResultHasConflict(merged.conflicts)) {
        const conflictSet = await tx.saveConflictSet(spaceId, {
          base_version: payload.base_version,
          head_version: headBefore,
          items: merged.conflicts
        });
        conflictSetId = conflictSet.conflict_set_id;
      }

      const commit = await tx.saveCommit(
        spaceId,
        payload.client_id,
        merged.snapshot,
        commitOps,
        merged.mergeResult,
        payload.idempotency_key,
        conflictSetId
      );

      await this.auditService.log({
        request_id: requestId,
        action: "push_changes",
        space_id: spaceId,
        device_id: payload.client_id,
        base_version: payload.base_version,
        head_before: headBefore,
        head_after: commit.version,
        file_changed: commitOps.length,
        conflict_count: merged.conflicts.length,
        status_code: 200
      });

      return {
        applied: true,
        new_head_version: commit.version,
        merge_result: commit.mergeMode,
        conflict_set_id: conflictSetId
      };
    });
  }

  async pull(spaceId: string, fromVersion: number, limit = 200, cursor?: string): Promise<PullResult> {
    return this.repository.pullChanges(spaceId, fromVersion, limit, cursor);
  }

  async resolveConflicts(
    spaceId: string,
    conflictSetId: string,
    payload: ResolveRequest,
    requestId: string
  ): Promise<{ resolved: boolean; new_head_version: number }> {
    return this.inTransaction(async (tx) => {
      const headBefore = await tx.getHeadVersion(spaceId);
      if (headBefore !== payload.expected_head) {
        throw new AppError(412, ERROR_CODES.EXPECTED_HEAD_MISMATCH, "Expected head does not match", true);
      }

      const conflictSet = await tx.getConflictSet(spaceId, conflictSetId);
      if (!conflictSet) {
        throw new AppError(422, ERROR_CODES.INVALID_CHANGESET, "Conflict set not found");
      }

      const headSnapshot = (await tx.getSnapshot(spaceId, headBefore)) ?? {};
      const current = { ...headSnapshot };
      const resolutionMap = new Map(payload.resolutions.map((item) => [item.path, item]));

      for (const item of conflictSet.items) {
        const resolution = resolutionMap.get(item.path);
        if (!resolution) {
          continue;
        }

        if (resolution.strategy === "theirs") {
          if (item.server_content === null) {
            delete current[item.path];
          } else {
            current[item.path] = item.server_content;
          }
          continue;
        }

        if (resolution.strategy === "ours") {
          if (item.client_content === null) {
            delete current[item.path];
          } else {
            current[item.path] = item.client_content;
          }
          if (item.conflict_path) {
            delete current[item.conflict_path];
          }
          continue;
        }

        if (resolution.strategy === "manual") {
          if (resolution.delete || resolution.content_b64 === undefined || resolution.content_b64 === null) {
            delete current[item.path];
          } else {
            current[item.path] = decodeTransportContent(resolution.content_b64, resolution.content_encoding);
          }
          if (item.conflict_path) {
            delete current[item.conflict_path];
          }
        }
      }

      const resolutionOps = buildSnapshotOps(headSnapshot, current);
      const commit = await tx.saveCommit(spaceId, "resolver", current, resolutionOps, "merged");
      await tx.resolveConflictSet(spaceId, conflictSetId);
      await this.auditService.log({
        request_id: requestId,
        action: "resolve_conflicts",
        space_id: spaceId,
        head_before: headBefore,
        head_after: commit.version,
        status_code: 200,
        conflict_count: conflictSet.items.length
      });

      return {
        resolved: true,
        new_head_version: commit.version
      };
    });
  }
}
