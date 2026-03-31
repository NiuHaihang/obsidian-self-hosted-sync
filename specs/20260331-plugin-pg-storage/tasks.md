---
description: "PostgreSQL 存储集成任务清单"
---

# Tasks: PostgreSQL 存储集成方案

**Input**: Design documents from `/specs/20260331-plugin-pg-storage/`  
**Prerequisites**: plan.md（required）, spec.md（required）, research.md, data-model.md, contracts/, quickstart.md

**Tests**: `spec.md` 明确要求 PostgreSQL 集成测试与回归（FR-007），本清单包含测试任务并遵循先测后实现。  
**Organization**: 任务按用户故事分组，确保每个故事可独立实现与独立验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无直接依赖）
- **[Story]**: 任务所属用户故事（US1, US2, US3）
- 每项任务包含明确文件路径

## Path Conventions

- 服务端：`apps/sync-server/`
- 插件端：`apps/obsidian-plugin/`
- 共享契约：`packages/shared-contracts/`
- 基础设施：`infra/docker/`
- 回归测试：`apps/sync-server/tests/`、`tests/e2e/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: PostgreSQL 集成前的共享准备与工程脚手架。

- [x] T001 更新根依赖与脚本（`pg`、迁移命令、PG 测试入口）到 `package.json`
- [x] T002 创建数据库配置模块 `apps/sync-server/src/config/database.ts`
- [x] T003 [P] 创建 PostgreSQL 连接池工厂 `apps/sync-server/src/repository/postgres/pool.ts`
- [x] T004 [P] 创建迁移执行器入口 `apps/sync-server/src/repository/migrations/runner.ts`
- [x] T005 [P] 创建迁移版本记录模型 `apps/sync-server/src/repository/migrations/schema_migrations.sql`
- [x] T006 [P] 创建 PostgreSQL 测试基座（容器启动/连接复用）`apps/sync-server/tests/integration/helpers/pg-test-container.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用且阻塞的底座能力（仓储抽象、事务、迁移、错误映射）。

**⚠️ CRITICAL**: 本阶段完成前，不得开始任何用户故事实现。

- [x] T007 定义仓储接口与事务接口 `apps/sync-server/src/repository/sync-repository.interface.ts`
- [x] T008 实现事务上下文封装 `apps/sync-server/src/repository/postgres/tx-context.ts`
- [x] T009 [P] 增加幂等表迁移 `apps/sync-server/src/repository/migrations/0004_sync_idempotency.sql`
- [x] T010 [P] 补齐 PostgreSQL 索引迁移 `apps/sync-server/src/repository/migrations/0005_pg_indexes.sql`
- [x] T011 实现 PostgreSQL 错误码映射（`40001/40P01/23505` 等）`apps/sync-server/src/repository/postgres/error-mapper.ts`
- [x] T012 [P] 实现仓储基类与 query helper `apps/sync-server/src/repository/postgres/base-repository.ts`
- [x] T013 改造服务启动流程，加入 DB 预检查与 migration status `apps/sync-server/src/api/server.ts`
- [x] T014 改造依赖注入，按配置切换内存仓储/PG 仓储 `apps/sync-server/src/bootstrap/repository-provider.ts`
- [x] T015 实现迁移状态服务（供 `/v1/admin/migrations/status`）`apps/sync-server/src/service/migration-status-service.ts`
- [x] T016 更新共享错误契约与错误枚举 `packages/shared-contracts/types/errors.ts`

**Checkpoint**: Foundation 完成后，US1/US2 可并行推进，US3 在其基础上完成回归收口。

---

## Phase 3: User Story 1 - 服务端切换为 PostgreSQL 持久化存储 (Priority: P1) 🎯 MVP

**Goal**: 用 PostgreSQL 替换内存仓储，确保 push/pull/conflict 与重启恢复的一致性。

**Independent Test**: 在 PostgreSQL 模式执行 push/pull/conflict 后重启服务，`head_version` 与冲突记录保持一致。

### Tests for User Story 1 ⚠️

**NOTE: 先写测试并确认失败，再进入实现。**

- [x] T017 [P] [US1] 新增 PG pull 契约测试 `apps/sync-server/tests/contract/pull-changes.pg.contract.test.ts`
- [x] T018 [P] [US1] 新增 PG push 契约测试 `apps/sync-server/tests/contract/push-changes.pg.contract.test.ts`
- [x] T019 [P] [US1] 新增 PG conflict 契约测试 `apps/sync-server/tests/contract/conflicts.pg.contract.test.ts`
- [x] T020 [P] [US1] 新增重启恢复集成测试 `apps/sync-server/tests/integration/restart-persistence.pg.integration.test.ts`
- [x] T021 [P] [US1] 新增事务回滚一致性测试 `apps/sync-server/tests/integration/transaction-atomicity.pg.integration.test.ts`

### Implementation for User Story 1

- [x] T022 [P] [US1] 实现 PostgresSyncRepository（读路径）`apps/sync-server/src/repository/postgres/postgres-sync-repository.ts`
- [x] T023 [P] [US1] 实现 PostgresSyncRepository（写路径与事务）`apps/sync-server/src/repository/postgres/postgres-sync-write-repository.ts`
- [x] T024 [P] [US1] 实现冲突集持久化仓储 `apps/sync-server/src/repository/postgres/postgres-conflict-repository.ts`
- [x] T025 [P] [US1] 实现幂等键仓储 `apps/sync-server/src/repository/postgres/postgres-idempotency-repository.ts`
- [x] T026 [US1] 改造 `SyncCommitService` 适配仓储接口与事务 `apps/sync-server/src/service/sync-commit-service.ts`
- [x] T027 [US1] 改造冲突解决服务适配 PG 仓储 `apps/sync-server/src/service/conflict-resolution-service.ts`
- [x] T028 [US1] 改造审计服务落库实现 `apps/sync-server/src/service/sync-audit-service.ts`
- [x] T029 [US1] 适配 push 路由错误映射与幂等返回 `apps/sync-server/src/api/routes/push-changes.ts`
- [x] T030 [US1] 适配 pull 路由分页与版本校验 `apps/sync-server/src/api/routes/pull-changes.ts`
- [x] T031 [US1] 适配 conflict 查询/解决路由 `apps/sync-server/src/api/routes/conflicts.ts`

**Checkpoint**: US1 完成后，核心同步流程已切换为 PostgreSQL 并可独立演示。

---

## Phase 4: User Story 2 - 部署配置支持 PostgreSQL 并可验证连通性 (Priority: P2)

**Goal**: Docker 一键部署含 PostgreSQL，readyz 与迁移状态可用于生产可用性验证。

**Independent Test**: 全新环境 compose 启动后，`/readyz` 为 ready，`/v1/admin/migrations/status` 返回无 pending。

### Tests for User Story 2 ⚠️

- [x] T032 [P] [US2] 新增 readyz 数据库依赖集成测试 `apps/sync-server/tests/integration/readyz-db.pg.integration.test.ts`
- [x] T033 [P] [US2] 新增 migration status 接口测试 `apps/sync-server/tests/contract/migration-status.contract.test.ts`
- [x] T034 [P] [US2] 新增 Docker 部署连通 E2E `tests/e2e/pg-docker-bootstrap.e2e.test.ts`

### Implementation for User Story 2

- [x] T035 [US2] 更新 Compose 为 `db + migrate + app` 编排 `infra/docker/docker-compose.yml`
- [x] T036 [P] [US2] 增加 PostgreSQL 生产参数模板（连接池/超时）`infra/docker/.env.example`
- [x] T037 [US2] 新增迁移状态路由 `/v1/admin/migrations/status` `apps/sync-server/src/api/routes/migration-status.ts`
- [x] T038 [US2] 改造 `readyz` 联动数据库状态 `apps/sync-server/src/api/routes/health.ts`
- [x] T039 [US2] 更新部署冒烟脚本（校验 readyz + migration status）`scripts/smoke/docker-health.sh`
- [x] T040 [US2] 更新 quickstart 的生产验证步骤 `specs/20260331-plugin-pg-storage/quickstart.md`

**Checkpoint**: US2 完成后，部署与联通验证路径可复用到生产环境。

---

## Phase 5: User Story 3 - PostgreSQL 集成回归测试与迁移保障 (Priority: P3)

**Goal**: 建立 PostgreSQL 持久化回归门禁，确保后续改动不破坏数据一致性。

**Independent Test**: CI 的 PostgreSQL 模式通过，失败时能输出最小排查信息包。

### Tests for User Story 3 ⚠️

- [x] T041 [P] [US3] 新增 tombstone 可追溯回归测试 `apps/sync-server/tests/integration/tombstone-traceability.pg.integration.test.ts`
- [x] T042 [P] [US3] 新增迁移幂等回归测试 `apps/sync-server/tests/integration/migration-idempotency.pg.integration.test.ts`
- [x] T043 [P] [US3] 新增并发冲突持久化回归测试 `apps/sync-server/tests/integration/conflict-concurrency.pg.integration.test.ts`

### Implementation for User Story 3

- [x] T044 [US3] 增加 CI PostgreSQL 集成任务配置 `.github/workflows/ci.yml`
- [x] T045 [US3] 增加 nightly 100 轮回归脚本 `scripts/ci/nightly-pg-regression.sh`
- [x] T046 [US3] 输出失败排查信息采集器（请求链路/版本/关键表快照）`apps/sync-server/tests/integration/helpers/failure-dump.ts`
- [x] T047 [US3] 更新 PostgreSQL 排障文档 `docs/postgresql-integration-troubleshooting.md`

**Checkpoint**: US3 完成后，PostgreSQL 集成具备持续回归与故障定位能力。

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事优化、文档收敛和最终验证。

- [x] T048 [P] 优化 PG 热路径查询与索引说明 `docs/architecture/sync-overview.md`
- [x] T049 增加事务重试与锁等待观测日志 `apps/sync-server/src/repository/postgres/error-mapper.ts`
- [x] T050 [P] 补充 README 生产环境与 PostgreSQL 验证章节 `README.md`
- [x] T051 运行并记录最终验证（build/test/smoke）`specs/20260331-plugin-pg-storage/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup，且阻塞全部用户故事
- **US1 (Phase 3)**: 依赖 Foundational，MVP 主体
- **US2 (Phase 4)**: 依赖 Foundational，可与 US1 并行推进但建议在 US1 基础上联调验收
- **US3 (Phase 5)**: 依赖 US1 + US2（需要 PG 主实现与部署链路完成）
- **Polish (Final Phase)**: 依赖全部目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 无其他用户故事依赖，Foundation 后可立即开始
- **US2 (P2)**: 与 US1 逻辑相对独立，但验收需使用 US1 的持久化实现
- **US3 (P3)**: 依赖 US1 与 US2 的代码和部署结果

### Within Each User Story

- Tests MUST 先写并先失败
- 仓储/模型先于服务层
- 服务层先于 API 路由
- 当前故事完成独立验收后再进入下一优先级

### Parallel Opportunities

- Setup: T003/T004/T005/T006 可并行
- Foundational: T009/T010/T011/T012 可并行
- US1: T017-T021 可并行，T022-T025 可并行
- US2: T032-T034 可并行，T036 与 T039 可并行
- US3: T041-T043 可并行

---

## Parallel Example: User Story 1

```bash
# 先并行编写 US1 测试（应先失败）
Task: "T017 [US1] pull pg contract test in apps/sync-server/tests/contract/pull-changes.pg.contract.test.ts"
Task: "T018 [US1] push pg contract test in apps/sync-server/tests/contract/push-changes.pg.contract.test.ts"
Task: "T020 [US1] restart persistence test in apps/sync-server/tests/integration/restart-persistence.pg.integration.test.ts"

# 再并行实现仓储层
Task: "T022 [US1] postgres read repository in apps/sync-server/src/repository/postgres/postgres-sync-repository.ts"
Task: "T024 [US1] conflict repository in apps/sync-server/src/repository/postgres/postgres-conflict-repository.ts"
Task: "T025 [US1] idempotency repository in apps/sync-server/src/repository/postgres/postgres-idempotency-repository.ts"
```

## Parallel Example: User Story 2

```bash
# 并行验证与部署改造
Task: "T032 [US2] readyz-db integration test in apps/sync-server/tests/integration/readyz-db.pg.integration.test.ts"
Task: "T034 [US2] pg docker bootstrap e2e in tests/e2e/pg-docker-bootstrap.e2e.test.ts"
Task: "T036 [US2] env template update in infra/docker/.env.example"
```

## Parallel Example: User Story 3

```bash
# 并行执行 PG 回归测试开发
Task: "T041 [US3] tombstone traceability test in apps/sync-server/tests/integration/tombstone-traceability.pg.integration.test.ts"
Task: "T042 [US3] migration idempotency test in apps/sync-server/tests/integration/migration-idempotency.pg.integration.test.ts"
Task: "T043 [US3] conflict concurrency test in apps/sync-server/tests/integration/conflict-concurrency.pg.integration.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 + Phase 2（建立 PG 底座）
2. 完成 Phase 3（US1）
3. **STOP and VALIDATE**：执行重启恢复与 push/pull/conflict 验收
4. 通过后再推进 US2/US3

### Incremental Delivery

1. Setup + Foundational -> PG 基础能力就绪
2. 交付 US1 -> 持久化核心链路可用
3. 交付 US2 -> 部署与生产验证链路可用
4. 交付 US3 -> 回归与 CI 门禁闭环
5. 最后执行 Polish 收口

### Parallel Team Strategy

1. 团队先共建 Phase 1-2
2. Foundation 后分工：
   - 开发 A：US1 仓储与事务
   - 开发 B：US1/US2 API 与部署
   - 开发 C：US3 测试与 CI
3. 合并后做统一回归与文档更新

---

## Notes

- 本清单满足宪法要求：用户故事分组、先测后实现、可追溯到 spec/plan/data-model/contracts
- `[P]` 并行任务执行前需确认不修改同一文件
- 建议每个 checkpoint 后执行一次 `npm run build && npm test`
- 如需范围调整，先更新 `spec.md`/`plan.md` 再调整任务，避免实现偏离
