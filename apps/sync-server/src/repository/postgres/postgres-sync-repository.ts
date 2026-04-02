import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { MergeConflictItem, MergeResultType } from "../../merge/three-way-merge.js";
import type {
  ChangeOperation,
  CommitResult,
  ConflictSet,
  IdempotentResult,
  PullResult,
  SyncRepositoryTx,
  TxCapableSyncRepository
} from "../sync-repository.interface.js";
import { withPgTransaction } from "./tx-context.js";
import { mapPgError, withPgRetry } from "./error-mapper.js";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SpaceRow extends QueryResultRow {
  id: string;
  current_head_version: number;
}

interface CommitRow extends QueryResultRow {
  id: string;
  version: number;
  created_at: string;
  author_client_id: string;
}

interface OperationRow extends QueryResultRow {
  commit_id: string;
  op_type: "upsert" | "delete" | "rename";
  path: string;
  new_path: string | null;
  content_b64: string | null;
  content_encoding: "utf8" | "binary_base64" | null;
}

class PgSyncRepositoryTx implements SyncRepositoryTx {
  constructor(private readonly client: PoolClient) {}

  private async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const result = await this.client.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      throw mapPgError(error);
    }
  }

  private async oneOrNull<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  private async ensureSpace(spaceId: string): Promise<SpaceRow> {
    const created = await this.query<SpaceRow>(
      `
        insert into sync_space(id, owner_user_id, name, slug, current_head_version)
        values ($1, $2, $3, $4, 0)
        on conflict (slug) do update set slug = excluded.slug
        returning id, current_head_version
      `,
      [randomUUID(), SYSTEM_USER_ID, spaceId, spaceId]
    );
    const space = created[0] as SpaceRow;

    await this.query<QueryResultRow>(
      `
        insert into sync_snapshot(space_id, version, snapshot_json)
        values ($1, 0, '{}'::jsonb)
        on conflict (space_id, version) do nothing
      `,
      [space.id]
    );

    return space;
  }

  private async resolveClientId(spaceUuid: string, clientIdOrFingerprint?: string): Promise<string> {
    const candidate = clientIdOrFingerprint ?? randomUUID();

    if (UUID_LIKE.test(candidate)) {
      const byId = await this.oneOrNull<{ id: string } & QueryResultRow>(
        `select id from client_device where space_id = $1 and id = $2::uuid`,
        [spaceUuid, candidate]
      );
      if (byId?.id) {
        return byId.id;
      }
    }

    const byFingerprint = await this.oneOrNull<{ id: string } & QueryResultRow>(
      `select id from client_device where space_id = $1 and device_fingerprint = $2`,
      [spaceUuid, candidate]
    );
    if (byFingerprint?.id) {
      return byFingerprint.id;
    }

    const createdId = randomUUID();
    await this.query<QueryResultRow>(
      `
        insert into client_device(
          id,
          space_id,
          user_id,
          device_fingerprint,
          client_name,
          last_seen_at,
          status
        )
        values ($1, $2, $3, $4, $5, now(), 'active')
      `,
      [createdId, spaceUuid, SYSTEM_USER_ID, candidate, candidate]
    );
    return createdId;
  }

  async registerClient(spaceId: string, clientId?: string): Promise<string> {
    const space = await this.ensureSpace(spaceId);
    const resolvedClientId = await this.resolveClientId(space.id, clientId);

    await this.query<QueryResultRow>(
      `update client_device set last_seen_at = now() where id = $1::uuid`,
      [resolvedClientId]
    );

    return resolvedClientId;
  }

  async getHeadVersion(spaceId: string): Promise<number> {
    const row = await this.oneOrNull<{ current_head_version: number } & QueryResultRow>(
      `select current_head_version from sync_space where slug = $1`,
      [spaceId]
    );
    return Number(row?.current_head_version ?? 0);
  }

  async getSnapshot(spaceId: string, version: number): Promise<Record<string, string> | null> {
    const row = await this.oneOrNull<{ snapshot_json: Record<string, string> } & QueryResultRow>(
      `
        select ss.snapshot_json
        from sync_snapshot ss
        join sync_space s on s.id = ss.space_id
        where s.slug = $1 and ss.version = $2
      `,
      [spaceId, version]
    );
    return row ? { ...(row.snapshot_json ?? {}) } : null;
  }

  async saveCommit(
    spaceId: string,
    authorClientId: string,
    snapshot: Record<string, string>,
    ops: ChangeOperation[],
    mergeMode: MergeResultType,
    idempotencyKey?: string,
    conflictSetId?: string
  ): Promise<CommitResult> {
    const space = await this.ensureSpace(spaceId);
    const authorId = await this.resolveClientId(space.id, authorClientId);

    const lockRows = await this.query<{ current_head_version: number } & QueryResultRow>(
      `
        select current_head_version
        from sync_space
        where id = $1::uuid
        for update
      `,
      [space.id]
    );
    const parentVersion = Number(lockRows[0]?.current_head_version ?? 0);
    const version = parentVersion + 1;
    const commitId = randomUUID();

    await this.query<QueryResultRow>(
      `
        insert into sync_commit(
          id,
          space_id,
          version,
          parent_version,
          author_device_id,
          merge_mode,
          change_count
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [commitId, space.id, version, parentVersion, authorId, mergeMode, ops.length]
    );

    for (let index = 0; index < ops.length; index += 1) {
      const op = ops[index] as ChangeOperation;
      await this.query<QueryResultRow>(
        `
          insert into file_operation(
            id,
            commit_id,
            op_type,
            path,
            new_path,
            base_version,
            blob_id,
            op_idempotency_key,
            content_b64,
            content_encoding
          )
          values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9)
        `,
        [
          randomUUID(),
          commitId,
          op.op_type,
          op.path,
          op.new_path ?? null,
          parentVersion,
          `${version}:${index}`,
          op.content_b64 ?? null,
          op.content_encoding ?? null
        ]
      );
    }

    await this.query<QueryResultRow>(
      `insert into sync_snapshot(space_id, version, snapshot_json) values ($1, $2, $3::jsonb)`,
      [space.id, version, JSON.stringify(snapshot)]
    );

    await this.query<QueryResultRow>(
      `
        update sync_space
        set current_head_version = $2,
            updated_at = now()
        where id = $1::uuid
      `,
      [space.id, version]
    );

    if (idempotencyKey) {
      await this.query<QueryResultRow>(
        `
          insert into sync_idempotency(
            id,
            space_id,
            client_id,
            idempotency_key,
            request_hash,
            response_payload,
            status
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, 'applied')
          on conflict (space_id, client_id, idempotency_key)
          do update set
            response_payload = excluded.response_payload,
            status = excluded.status,
            updated_at = now()
        `,
        [
          randomUUID(),
          space.id,
          authorId,
          idempotencyKey,
          "",
          JSON.stringify({ newHeadVersion: version, mergeResult: mergeMode, conflictSetId })
        ]
      );
    }

    return { version, mergeMode };
  }

  async pullChanges(spaceId: string, fromVersion: number, limit = 200, cursor?: string): Promise<PullResult> {
    const space = await this.oneOrNull<SpaceRow>(
      `select id, current_head_version from sync_space where slug = $1`,
      [spaceId]
    );

    if (!space) {
      return {
        head_version: 0,
        changes: [],
        next_cursor: null,
        has_more: false
      };
    }

    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const fetchLimit = Math.max(1, limit) + 1;
    const commits = await this.query<CommitRow>(
      `
        select
          c.id,
          c.version,
          c.created_at::text,
          d.device_fingerprint as author_client_id
        from sync_commit c
        join client_device d on d.id = c.author_device_id
        where c.space_id = $1::uuid and c.version > $2
        order by c.version asc
        offset $3
        limit $4
      `,
      [space.id, fromVersion, offset, fetchLimit]
    );

    const hasMore = commits.length > limit;
    const page = hasMore ? commits.slice(0, limit) : commits;
    const commitIds = page.map((item) => item.id);

    const operations = commitIds.length === 0
      ? []
      : await this.query<OperationRow>(
          `
            select
              fo.commit_id,
              fo.op_type,
              fo.path,
              fo.new_path,
              fo.content_b64,
              fo.content_encoding
            from file_operation fo
            where fo.commit_id = any($1::uuid[])
            order by fo.created_at asc, fo.op_idempotency_key asc
          `,
          [commitIds]
        );

    const opsByCommit = new Map<string, ChangeOperation[]>();
    for (const op of operations) {
      const list = opsByCommit.get(op.commit_id) ?? [];
      list.push({
        op_type: op.op_type,
        path: op.path,
        new_path: op.new_path ?? undefined,
        content_b64: op.content_b64 ?? undefined,
        content_encoding: op.content_encoding ?? undefined
      });
      opsByCommit.set(op.commit_id, list);
    }

    return {
      head_version: Number(space.current_head_version),
      changes: page.map((commit) => ({
        version: Number(commit.version),
        author_client_id: commit.author_client_id,
        ts: commit.created_at,
        ops: opsByCommit.get(commit.id) ?? []
      })),
      next_cursor: hasMore ? String(offset + page.length) : null,
      has_more: hasMore
    };
  }

  async saveConflictSet(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): Promise<ConflictSet> {
    const space = await this.ensureSpace(spaceId);
    const conflictSetId = randomUUID();

    await this.query<QueryResultRow>(
      `
        insert into sync_conflict_set(
          conflict_set_id,
          space_id,
          status,
          base_version,
          head_version,
          items_json
        )
        values ($1, $2, 'open', $3, $4, $5::jsonb)
      `,
      [conflictSetId, space.id, payload.base_version, payload.head_version, JSON.stringify(payload.items)]
    );

    return {
      conflict_set_id: conflictSetId,
      status: "open",
      base_version: payload.base_version,
      head_version: payload.head_version,
      items: [...payload.items]
    };
  }

  async getConflictSet(spaceId: string, conflictSetId: string): Promise<ConflictSet | null> {
    const row = await this.oneOrNull<{
      status: "open" | "resolved";
      base_version: number;
      head_version: number;
      items_json: MergeConflictItem[];
    } & QueryResultRow>(
      `
        select cs.status, cs.base_version, cs.head_version, cs.items_json
        from sync_conflict_set cs
        join sync_space s on s.id = cs.space_id
        where s.slug = $1 and cs.conflict_set_id = $2::uuid
      `,
      [spaceId, conflictSetId]
    );

    if (!row) {
      return null;
    }

    return {
      conflict_set_id: conflictSetId,
      status: row.status,
      base_version: Number(row.base_version),
      head_version: Number(row.head_version),
      items: [...(row.items_json ?? [])]
    };
  }

  async resolveConflictSet(spaceId: string, conflictSetId: string): Promise<void> {
    await this.query<QueryResultRow>(
      `
        update sync_conflict_set cs
        set status = 'resolved',
            resolved_at = now()
        from sync_space s
        where s.id = cs.space_id
          and s.slug = $1
          and cs.conflict_set_id = $2::uuid
      `,
      [spaceId, conflictSetId]
    );
  }

  async getIdempotentResult(spaceId: string, key: string): Promise<IdempotentResult | undefined> {
    const row = await this.oneOrNull<{ response_payload: IdempotentResult } & QueryResultRow>(
      `
        select si.response_payload
        from sync_idempotency si
        join sync_space s on s.id = si.space_id
        where s.slug = $1 and si.idempotency_key = $2 and si.status = 'applied'
        order by si.updated_at desc
        limit 1
      `,
      [spaceId, key]
    );

    if (!row?.response_payload) {
      return undefined;
    }

    return {
      newHeadVersion: Number(row.response_payload.newHeadVersion),
      mergeResult: row.response_payload.mergeResult,
      conflictSetId: row.response_payload.conflictSetId
    };
  }

  async commit(): Promise<void> {
    return;
  }

  async rollback(): Promise<void> {
    return;
  }
}

export class PostgresSyncRepository implements TxCapableSyncRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(work: (tx: SyncRepositoryTx) => Promise<T>): Promise<T> {
    return withPgRetry(async () => withPgTransaction(this.pool, async (client) => work(new PgSyncRepositoryTx(client))));
  }

  private async inTx<T>(work: (tx: PgSyncRepositoryTx) => Promise<T>): Promise<T> {
    return withPgRetry(async () => withPgTransaction(this.pool, async (client) => work(new PgSyncRepositoryTx(client))));
  }

  async registerClient(spaceId: string, clientId?: string): Promise<string> {
    return this.inTx((tx) => tx.registerClient(spaceId, clientId));
  }

  async getHeadVersion(spaceId: string): Promise<number> {
    return this.inTx((tx) => tx.getHeadVersion(spaceId));
  }

  async getSnapshot(spaceId: string, version: number): Promise<Record<string, string> | null> {
    return this.inTx((tx) => tx.getSnapshot(spaceId, version));
  }

  async saveCommit(
    spaceId: string,
    authorClientId: string,
    snapshot: Record<string, string>,
    ops: ChangeOperation[],
    mergeMode: MergeResultType,
    idempotencyKey?: string,
    conflictSetId?: string
  ): Promise<CommitResult> {
    return this.inTx((tx) => tx.saveCommit(spaceId, authorClientId, snapshot, ops, mergeMode, idempotencyKey, conflictSetId));
  }

  async pullChanges(spaceId: string, fromVersion: number, limit = 200, cursor?: string): Promise<PullResult> {
    return this.inTx((tx) => tx.pullChanges(spaceId, fromVersion, limit, cursor));
  }

  async saveConflictSet(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): Promise<ConflictSet> {
    return this.inTx((tx) => tx.saveConflictSet(spaceId, payload));
  }

  async getConflictSet(spaceId: string, conflictSetId: string): Promise<ConflictSet | null> {
    return this.inTx((tx) => tx.getConflictSet(spaceId, conflictSetId));
  }

  async resolveConflictSet(spaceId: string, conflictSetId: string): Promise<void> {
    await this.inTx((tx) => tx.resolveConflictSet(spaceId, conflictSetId));
  }

  async getIdempotentResult(spaceId: string, key: string): Promise<IdempotentResult | undefined> {
    return this.inTx((tx) => tx.getIdempotentResult(spaceId, key));
  }
}
