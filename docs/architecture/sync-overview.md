# Sync 架构总览

## 分层

- `apps/obsidian-plugin`: 本地变更采集、同步编排、冲突提示
- `apps/sync-server`: 版本管理、三方合并、冲突管理、审计
- `packages/shared-contracts`: 错误码与 OpenAPI 引用
- `infra/docker`: 部署编排

## 核心流程

1. 客户端注册并获取 token
2. 客户端 pull 获取 head 与增量
3. 客户端基于 base_version 计算本地变更并 push
4. 服务端执行三方合并（base/local/remote-head）
5. 产生冲突时生成 conflict_set 并支持后续 resolution

## 防误删策略

- 删除必须显式 `delete` 操作，不使用“文件缺失即删除”
- delete vs modify 时优先保留非删除内容并记录冲突
- 通过 conflict 文件副本保留双方内容，避免静默丢失

## 内容编码约定

- `ChangeOperation` 的 `upsert` 支持 `content_encoding`：`utf8` 或 `binary_base64`
- 当 `content_encoding=binary_base64` 时，`content_b64` 直接表示二进制字节流
- 未提供 `content_encoding` 时按 `utf8` 兼容旧客户端

## PostgreSQL 热路径与索引

- 写路径（push/resolve）以 `space` 为粒度串行化，事务内提交 commit/conflict/audit
- 读路径（pull）按 `space_id + version` 走增量扫描，避免全表回表
- 关键索引：
  - `sync_commit(space_id, version desc)`
  - `file_entry(space_id, path)`
  - `conflict_record(space_id, conflict_set_id)`
  - `sync_audit_log(space_id, created_at desc)`
  - `tombstone(space_id, expires_at) where purged_at is null`

## 生产可观测性

- `readyz` 必须联动 PostgreSQL 可用性与迁移状态
- 事务重试仅针对 `40001/40P01`，并记录重试次数与等待时长
- 排障最小上下文包含：`request_id/space_id/base_version/expected_head`
