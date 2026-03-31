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
