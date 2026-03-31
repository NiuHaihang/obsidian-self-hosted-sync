# Phase 0 Research: PostgreSQL 存储集成方案

## 研究目标

- 明确同步服务从内存仓储切换到 PostgreSQL 的可落地架构
- 明确迁移与生产部署验证策略
- 明确 PostgreSQL 集成测试与 CI 门禁策略

## 技术上下文不确定项与结论

### 1) 仓储抽象与事务边界

- Decision: 采用 `SyncRepository` + `SyncRepositoryTx` + `withTransaction()` 的仓储抽象，
  服务层只依赖接口；`push` 与 `resolve_conflicts` 全链路在单事务中提交。
- Rationale: 确保 `commit`、`conflict_record`、`tombstone`、`sync_audit_log` 的原子一致性，
  避免部分成功。
- Alternatives considered:
  - 服务层直接写 SQL（耦合高、测试困难）
  - 事务拆分为多段（易产生不一致）

### 2) 并发控制与锁策略

- Decision: 写路径使用“每个 space 串行锁”策略（`sync_space FOR UPDATE`），读取保持无锁增量拉取；
  对 `40001/40P01` 使用有限重试（2-3 次 + 退避抖动）。
- Rationale: 保证同一空间版本单调一致，并在高并发下控制死锁与序列化失败。
- Alternatives considered:
  - 表级锁（吞吐过低）
  - 仅乐观锁（冲突高时重试风暴）

### 3) 幂等键持久化

- Decision: 新增 `sync_idempotency` 表，唯一键 `(space_id, client_id, idempotency_key)`，
  保存请求哈希与响应摘要。
- Rationale: 解决服务重启后幂等缓存丢失问题，支持网络抖动场景安全重试。
- Alternatives considered:
  - 仅内存 map（重启失效）
  - 客户端自行规避重试（不可靠）

### 4) 迁移工具与幂等迁移

- Decision: 采用 SQL-first 迁移（Flyway 风格版本迁移），并要求迁移可重复执行；高风险变更采用
  expand -> migrate -> contract 三阶段。
- Rationale: 兼顾审计可读性、团队协作与生产可控性。
- Alternatives considered:
  - ORM 自动迁移（生产可控性弱）
  - 单次大迁移（失败窗口大）

### 5) Docker 与生产可用性验证

- Decision: 部署编排采用 `db + migrate(one-shot) + app`；`livez` 只检查进程，`readyz`
  联动 PostgreSQL 轻量探测与连接池状态。
- Rationale: 避免应用在旧 schema 启动，且减少数据库瞬时抖动引发重启风暴。
- Alternatives considered:
  - 迁移嵌入 app 启动（多副本并发迁移风险）
  - 仅 HTTP 存活检查（无法反映数据库不可用）

### 6) PostgreSQL 集成测试策略

- Decision: 采用混合策略：PR 默认跑 Testcontainers 冒烟，主干跑完整 PostgreSQL 集成套件，夜间
  跑 100 轮长回归与迁移升级回归。
- Rationale: 平衡反馈速度与持久化一致性质量门禁。
- Alternatives considered:
  - 全量仅 nightly（风险暴露过晚）
  - 每个 PR 全量长跑（反馈慢）

## 关键实现参数建议

- 连接池：单实例 20-50 连接起步，结合实例数确保低于数据库 `max_connections` 的 80%
- 超时：连接 3-5s，语句 2-15s（分级），`idle_in_transaction_session_timeout` 30-60s
- 清理：保留 tombstone 与 conflict 的策略由业务配置驱动，默认与既有 spec 保持一致

## 结论

所有技术不确定项已收敛，无残留 `NEEDS CLARIFICATION`。可进入 Phase 1 设计与契约输出。
