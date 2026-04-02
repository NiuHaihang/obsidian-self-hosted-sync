# PostgreSQL 集成排障指南

## 1. 快速定位顺序

1. 看 `readyz` 与 migration status：
   - `curl http://localhost:8787/readyz`
   - `curl http://localhost:8787/v1/admin/migrations/status`
2. 看服务日志中 `error.code`、`pg_code`、`request_id`
3. 对照失败上下文（space/client/base_version/expected_head）
4. 必要时检查 `schema_migrations` 与关键业务表

## 2. 常见问题

### 2.1 `DB_NOT_READY`

- 现象：业务接口返回 503，`readyz` 为 `not_ready`
- 排查：
  - 检查 `POSTGRES_HOST/PORT/USER/PASSWORD/DB`
  - 确认 PostgreSQL 可连接（`pg_isready`）
  - 确认迁移是否已执行

### 2.2 `MIGRATION_PENDING` 或迁移状态 pending > 0

- 现象：服务启动可用但迁移状态未收敛
- 处理：执行 `npm run db:migrate`，确认 `schema_migrations` 版本最新

### 2.3 `EXPECTED_HEAD_MISMATCH`

- 现象：并发 push 失败，返回 412
- 处理：先 pull 最新版本，再基于新 head 重试 push

### 2.4 `40001` / `40P01`（事务重试）

- 现象：高并发下偶发冲突或死锁
- 处理：
  - 检查事务范围是否过大
  - 确认锁顺序一致
  - 允许有限重试（指数退避）

## 3. 最小失败信息包

建议保留以下字段用于复盘：

- `request_id`、`space_id`、`client_id`
- `base_version`、`expected_head`、`head_before`、`head_after`
- `status_code`、`error.code`、`pg_code`
- 关键表快照（`sync_commit`、`conflict_record`、`tombstone`、`sync_audit_log`）

## 4. 回归建议

- PR 阶段：跑 contract + 关键 PG 冒烟
- 主干阶段：跑完整 PG 集成回归
- 夜间：执行 `scripts/ci/nightly-pg-regression.sh` 长跑

## 5. 按一次同步请求追踪全链路（SQL）

先在 `sync_audit_log` 找到目标 `request_id`（建议先按 `slug` 和时间过滤）：

```sql
select
  s.slug as space_slug,
  a.request_id,
  a.action,
  a.status_code,
  a.base_version,
  a.head_before,
  a.head_after,
  a.file_changed,
  a.conflict_count,
  a.created_at
from sync_audit_log a
join sync_space s on s.id = a.space_id
where s.slug = 'mynote'
order by a.created_at desc
limit 20;
```

### 5.1 请求详情（按 request_id）

```sql
select
  s.slug as space_slug,
  a.request_id,
  a.action,
  a.status_code,
  a.base_version,
  a.head_before,
  a.head_after,
  a.file_changed,
  a.conflict_count,
  a.created_at
from sync_audit_log a
join sync_space s on s.id = a.space_id
where a.request_id = '<REQ_ID>';
```

### 5.2 对应 commit（如果 head_after 非空）

```sql
select
  s.slug as space_slug,
  c.id as commit_id,
  c.version,
  c.parent_version,
  c.merge_mode,
  c.change_count,
  d.device_fingerprint as author_client_id,
  c.created_at
from sync_commit c
join sync_space s on s.id = c.space_id
join client_device d on d.id = c.author_device_id
join sync_audit_log a on a.space_id = c.space_id and a.head_after = c.version
where a.request_id = '<REQ_ID>'
order by c.version desc;
```

### 5.3 对应文件操作

```sql
select
  s.slug as space_slug,
  c.version,
  o.op_type,
  o.path,
  o.new_path,
  o.content_encoding,
  o.op_idempotency_key,
  o.created_at
from file_operation o
join sync_commit c on c.id = o.commit_id
join sync_space s on s.id = c.space_id
join sync_audit_log a on a.space_id = c.space_id and a.head_after = c.version
where a.request_id = '<REQ_ID>'
order by o.created_at asc, o.op_idempotency_key asc;
```

### 5.4 对应冲突集（如果有）

```sql
select
  s.slug as space_slug,
  cs.conflict_set_id,
  cs.status,
  cs.base_version,
  cs.head_version,
  jsonb_array_length(cs.items_json) as item_count,
  cs.created_at,
  cs.resolved_at
from sync_conflict_set cs
join sync_space s on s.id = cs.space_id
join sync_audit_log a on a.space_id = cs.space_id
where a.request_id = '<REQ_ID>'
  and cs.base_version = a.base_version
  and cs.head_version = a.head_before
order by cs.created_at desc;
```

冲突项详情（拿到 `conflict_set_id` 后）：

```sql
select
  jsonb_pretty(cs.items_json) as conflict_items
from sync_conflict_set cs
where cs.conflict_set_id = '<CONFLICT_SET_ID>';
```

### 5.5 幂等记录（按 idempotency_key）

```sql
select
  s.slug as space_slug,
  d.device_fingerprint as client_id,
  i.idempotency_key,
  i.status,
  i.response_payload,
  i.created_at,
  i.updated_at
from sync_idempotency i
join sync_space s on s.id = i.space_id
join client_device d on d.id = i.client_id
where s.slug = 'mynote'
  and i.idempotency_key = '<IDEMPOTENCY_KEY>'
order by i.updated_at desc;
```
