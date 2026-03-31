# Feature Specification: PostgreSQL 存储集成方案

**Feature**: `20260331-plugin-pg-storage`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "这个插件需要集成用PostgreSQL作为存储的实现方案"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 服务端切换为 PostgreSQL 持久化存储 (Priority: P1)

作为插件使用者和系统维护者，我希望同步服务端不再依赖内存仓储，而是使用 PostgreSQL
持久化存储同步元数据和版本记录，从而在服务重启后仍能保持完整同步状态。

**Why this priority**: 这是“集成 PostgreSQL 作为存储实现方案”的核心诉求，没有该能力就不满足需求本身。

**Technical Implementation**:

- 将当前服务端仓储抽象从 `InMemorySyncRepository` 扩展为仓储接口（Repository Interface），
  并新增 PostgreSQL 实现（`PostgresSyncRepository`）。
- 使用 PostgreSQL 存储关键实体：`sync_space`、`client_device`、`auth_session`、`sync_commit`、
  `file_entry`、`file_blob`、`file_operation`、`tombstone`、`conflict_record`、`sync_audit_log`。
- 使用迁移文件确保 schema 可重复部署，支持幂等创建与版本演进。
- 所有 push/pull/conflict 逻辑保持 API 兼容，仅替换持久化层，不改变客户端交互协议。
- 关键事务场景（push 合并 + conflict 写入 + audit 写入）必须在单事务内提交，避免部分成功。

**Independent Test**: 在 PostgreSQL 模式下执行一次完整 push/pull/conflict 流程，重启服务后再次
查询同一 space 的 head 与变更历史，应与重启前一致。

**Acceptance Scenarios**:

1. **Given** 服务端启用 PostgreSQL 配置并完成迁移，**When** 客户端执行 push 后服务重启，
   **Then** 再次 pull 可读取到重启前已提交的版本和文件状态。
2. **Given** 同一文件发生并发修改冲突，**When** 服务端写入冲突记录，**Then** 冲突集与审计日志在
   PostgreSQL 中可查询且重启后不丢失。

---

### User Story 2 - 部署配置支持 PostgreSQL 并可验证连通性 (Priority: P2)

作为部署人员，我希望通过 Docker Compose 一键启动含 PostgreSQL 的服务，并能快速验证数据库连通、
迁移执行和服务可用性。

**Why this priority**: 仅有代码层实现不足以落地，必须有可执行的部署与验证路径。

**Technical Implementation**:

- 在 `infra/docker/docker-compose.yml` 明确 PostgreSQL 服务参数（镜像、账号、密码、数据库名、卷）。
- 在 `.env.example` 中补齐 PostgreSQL 连接串配置，服务端统一从环境变量读取。
- 服务端启动前执行数据库连接探测与迁移检查；失败时阻止服务对外提供同步 API。
- 更新健康检查语义：`/readyz` 在 PostgreSQL 不可用时返回非 ready 状态。
- 增加部署验证脚本，覆盖：数据库可连通、迁移成功、基础 API 可调用。

**Independent Test**: 在全新环境执行 compose 启动后，运行 smoke 脚本并通过 `/readyz`、
`register-client`、`push`、`pull` 验证链路。

**Acceptance Scenarios**:

1. **Given** 新服务器只安装 Docker，**When** 按文档启动 compose，**Then** PostgreSQL 与同步服务均可用，
   且 `/readyz` 返回 ready。

---

### User Story 3 - PostgreSQL 集成回归测试与迁移保障 (Priority: P3)

作为开发团队，我希望新增 PostgreSQL 集成测试与回归策略，保证后续修改不会破坏持久化行为。

**Why this priority**: 数据存储一旦错误会带来严重数据风险，需要测试门禁与可回归机制。

**Technical Implementation**:

- 新增 PostgreSQL 集成测试（建议 Testcontainers 或独立测试数据库）覆盖：
  - push/pull 持久化正确性
  - 并发冲突持久化正确性
  - tombstone 与冲突记录可追溯性
- 为迁移脚本增加验证流程：新建库迁移、重复执行迁移、升级迁移回归。
- 在 CI 中增加“PostgreSQL 模式”测试任务，确保每次变更都验证持久化链路。
- 输出故障排查指南，明确数据库连接、迁移失败、锁冲突等常见问题定位方法。

**Independent Test**: 执行 PostgreSQL 集成测试套件，所有核心用例通过，且失败时可定位到具体
迁移或仓储行为。

**Acceptance Scenarios**:

1. **Given** 开发者修改同步仓储逻辑，**When** 运行 CI 集成测试，**Then** PostgreSQL 回归用例全部通过，
   若失败可输出明确失败原因。

---

### Edge Cases

- PostgreSQL 暂时不可用（网络抖动/重启）时，服务端应拒绝写入并返回可识别错误。
- 迁移执行到一半失败，系统应保持可恢复状态并避免脏 schema。
- 同步高并发下发生事务冲突或死锁，需要重试策略和审计记录。
- 服务重启后连接池恢复期间，`/readyz` 与业务请求状态需一致。
- 数据库版本升级（例如 15 -> 16）后，索引与查询计划变化导致性能回退。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 提供 PostgreSQL 仓储实现并用于同步核心数据持久化。
- **FR-002**: 系统 MUST 保持现有同步 API 行为兼容，不因存储切换改变客户端协议。
- **FR-003**: 系统 MUST 提供可重复执行的数据库迁移机制，并支持新环境一键初始化。
- **FR-004**: 系统 MUST 在关键写入链路使用事务，避免部分写入导致状态不一致。
- **FR-005**: 系统 MUST 在服务重启后保留同步版本、冲突记录和审计日志。
- **FR-006**: 系统 MUST 在 Docker 部署配置中包含 PostgreSQL，并提供环境变量模板。
- **FR-007**: 系统 MUST 提供 PostgreSQL 集成测试，覆盖 push/pull/conflict/tombstone 关键路径。
- **FR-008**: 系统 MUST 在 PostgreSQL 不可用时返回明确错误并使 readiness 检查不通过。
- **FR-009**: 系统 MUST 输出 PostgreSQL 集成与排障文档，便于运维和开发落地。

### Key Entities *(include if feature involves data)*

- **PostgresSyncRepository**: PostgreSQL 仓储实现，承载同步读写与事务管理。
- **MigrationRecord**: 迁移版本记录，确保 schema 演进可追踪、可重复执行。
- **ConnectionPoolConfig**: 数据库连接池配置（最大连接数、超时、重试策略）。
- **PersistentSyncCommit**: 持久化后的同步提交记录，包含版本与提交来源。
- **PersistentConflictSet**: 持久化冲突集，用于冲突查询和后续解决。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在 PostgreSQL 模式下执行 100 轮 push/pull 回归后，数据一致性错误为 0。
- **SC-002**: 服务重启后，历史同步版本与冲突记录可恢复率达到 100%。
- **SC-003**: 新环境从零部署到完成 PostgreSQL 集成验证在 30 分钟内可完成。
- **SC-004**: CI 中 PostgreSQL 集成测试通过率保持 100%，并在失败时输出可定位错误信息。
