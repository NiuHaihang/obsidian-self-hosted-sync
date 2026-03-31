---
description: "Obsidian 自托管合并同步任务清单"
---

# Tasks: Obsidian 自托管合并同步

**Input**: 来自 `/specs/20260331-obsidian-sync-merge/` 的设计文档  
**Prerequisites**: plan.md（必需）, spec.md（必需）, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本特性在 `spec.md` 中显式要求关键自动化测试（FR-010），因此包含测试任务，并遵循先测后实现。  
**Organization**: 任务按用户故事分组，保证每个故事可独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无直接依赖）
- **[Story]**: 任务所属用户故事（US1, US2, US3）
- 所有任务均包含明确文件路径

## 路径约定

- 插件端：`apps/obsidian-plugin/`
- 服务端：`apps/sync-server/`
- 共享契约：`packages/shared-contracts/`
- 基础设施：`infra/docker/`
- 端到端测试：`tests/e2e/`

## Phase 1: Setup（共享初始化）

**Purpose**: 初始化仓库结构、构建链路与基础工程配置。

- [x] T001 创建目录骨架：`apps/obsidian-plugin`、`apps/sync-server`、`packages/shared-contracts`、`infra/docker`、`tests/e2e`
- [x] T002 初始化根工作区配置：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`
- [x] T003 [P] 初始化服务端工程脚手架：`apps/sync-server/package.json`、`apps/sync-server/tsconfig.json`
- [x] T004 [P] 初始化插件工程脚手架：`apps/obsidian-plugin/package.json`、`apps/obsidian-plugin/tsconfig.json`
- [x] T005 [P] 初始化共享契约包：`packages/shared-contracts/package.json`、`packages/shared-contracts/types/index.ts`
- [x] T006 [P] 配置质量工具链：`.eslintrc.cjs`、`.prettierrc`、`vitest.workspace.ts`

---

## Phase 2: Foundational（阻塞前置能力）

**Purpose**: 完成所有用户故事共享且阻塞实现的核心基础能力。

**⚠️ CRITICAL**: 在本阶段完成前，不允许进入任何用户故事实现。

- [x] T007 建立迁移框架与数据库连接配置：`apps/sync-server/src/repository/migrations/config.ts`
- [x] T008 创建空间与设备认证相关迁移：`apps/sync-server/src/repository/migrations/0001_space_device_auth.sql`
- [x] T009 [P] 创建文件与版本相关迁移：`apps/sync-server/src/repository/migrations/0002_sync_core.sql`
- [x] T010 [P] 创建冲突与审计相关迁移：`apps/sync-server/src/repository/migrations/0003_conflict_audit.sql`
- [x] T011 实现 Fastify 服务骨架与插件注册：`apps/sync-server/src/api/server.ts`
- [x] T012 实现统一错误模型与错误码映射：`apps/sync-server/src/api/error.ts`、`packages/shared-contracts/types/errors.ts`
- [x] T013 [P] 实现 JWT 鉴权与设备会话中间件：`apps/sync-server/src/auth/jwt.ts`
- [x] T014 [P] 实现对象存储抽象与本地驱动：`apps/sync-server/src/storage/blob-store.ts`、`apps/sync-server/src/storage/local-driver.ts`
- [x] T015 实现 OpenAPI 契约生成接入：`packages/shared-contracts/openapi/generated.ts`、`apps/sync-server/src/api/routes/index.ts`
- [x] T016 [P] 插件侧实现配置持久化与凭据存储接口：`apps/obsidian-plugin/src/storage/settings-store.ts`

**Checkpoint**: Foundation 完成后，US1/US2 可并行推进，US3 在前两者基础上收敛为 MVP。

---

## Phase 3: User Story 1 - 多客户端安全合并同步 (Priority: P1) 🎯 MVP

**Goal**: 在并发同步下实现“类 Git merge”并杜绝误删（尤其 A={abc,def}, B={def,ghk} 场景）。

**Independent Test**: 两个客户端离线分别新增 `abc.md`、`ghk.md` 后同步，最终两端与服务端都保留 `abc.md`、`def.md`、`ghk.md`。

### Tests for User Story 1 ⚠️

**NOTE: 先写测试并确认失败，再进入实现。**

- [x] T017 [P] [US1] 编写 pull 契约测试：`apps/sync-server/tests/contract/pull-changes.contract.test.ts`
- [x] T018 [P] [US1] 编写 push 契约测试（含 `base_version`/`expected_head`）：`apps/sync-server/tests/contract/push-changes.contract.test.ts`
- [x] T019 [P] [US1] 编写冲突查询/解决契约测试：`apps/sync-server/tests/contract/conflicts.contract.test.ts`
- [x] T020 [P] [US1] 编写并发新增防误删集成测试：`apps/sync-server/tests/integration/non-destructive-merge.integration.test.ts`
- [x] T021 [P] [US1] 编写插件 manifest 增量计算集成测试：`apps/obsidian-plugin/tests/integration/manifest-delta.integration.test.ts`

### Implementation for User Story 1

- [x] T022 [P] [US1] 实现三方合并引擎：`apps/sync-server/src/merge/three-way-merge.ts`
- [x] T023 [P] [US1] 实现 tombstone 策略与 GC 判定：`apps/sync-server/src/merge/tombstone-policy.ts`
- [x] T024 [P] [US1] 实现同步核心仓储（FileEntry/FileBlob/SyncCommit）：`apps/sync-server/src/repository/sync-repository.ts`
- [x] T025 [US1] 实现提交服务与幂等处理：`apps/sync-server/src/service/sync-commit-service.ts`（依赖 T022/T023/T024）
- [x] T026 [US1] 实现 `POST /v1/spaces/{spaceId}/changes`：`apps/sync-server/src/api/routes/push-changes.ts`
- [x] T027 [US1] 实现 `GET /v1/spaces/{spaceId}/changes`：`apps/sync-server/src/api/routes/pull-changes.ts`
- [x] T028 [US1] 实现冲突查询与解决路由：`apps/sync-server/src/api/routes/conflicts.ts`
- [x] T029 [P] [US1] 实现插件同步 API 客户端：`apps/obsidian-plugin/src/sync/sync-api-client.ts`
- [x] T030 [US1] 实现插件同步编排器（pull/rebase/push）：`apps/obsidian-plugin/src/sync/sync-orchestrator.ts`
- [x] T031 [US1] 实现冲突文件命名与提示 UI：`apps/obsidian-plugin/src/ui/conflict-notice.ts`
- [x] T032 [US1] 实现同步审计日志服务：`apps/sync-server/src/service/sync-audit-service.ts`

**Checkpoint**: US1 完成后，核心“防误删合并同步”可独立演示并可上线灰度。

---

## Phase 4: User Story 2 - 可 Docker 部署的自托管服务 (Priority: P2)

**Goal**: 用户可在服务器通过 Docker 一键部署并完成插件连接。

**Independent Test**: 全新环境执行 compose 启动后，`/healthz` 和 `/readyz` 正常，插件连接测试通过。

### Tests for User Story 2 ⚠️

- [x] T033 [P] [US2] 编写客户端注册契约测试：`apps/sync-server/tests/contract/register-client.contract.test.ts`
- [x] T034 [P] [US2] 编写健康检查集成测试：`apps/sync-server/tests/integration/health-readiness.integration.test.ts`
- [x] T035 [P] [US2] 编写 Docker 启动与首次连接 E2E：`tests/e2e/docker-bootstrap.e2e.test.ts`

### Implementation for User Story 2

- [x] T036 [US2] 实现设备注册与 token 签发接口：`apps/sync-server/src/api/routes/register-client.ts`
- [x] T037 [US2] 实现 `/healthz` 与 `/readyz` 路由：`apps/sync-server/src/api/routes/health.ts`
- [x] T038 [P] [US2] 编写服务端镜像文件：`infra/docker/sync-server.Dockerfile`
- [x] T039 [P] [US2] 编写部署编排与环境模板：`infra/docker/docker-compose.yml`、`infra/docker/.env.example`
- [x] T040 [US2] 实现插件设置页与连接测试：`apps/obsidian-plugin/src/ui/settings-tab.ts`
- [x] T041 [US2] 补充连接初始化流程（注册客户端与凭据落盘）：`apps/obsidian-plugin/src/sync/register-client.ts`
- [x] T042 [US2] 编写部署冒烟脚本：`scripts/smoke/docker-health.sh`

**Checkpoint**: US2 完成后，系统具备可复制部署能力，用户可自行托管并完成连通性验证。

---

## Phase 5: User Story 3 - 从方案到实现的可交付 MVP (Priority: P3)

**Goal**: 交付可运行 MVP，覆盖关键回归测试、同步 UI 与冲突闭环。

**Independent Test**: 运行 MVP 测试套件后，关键场景（并发新增、并发修改、删除保护）全部通过。

### Tests for User Story 3 ⚠️

- [x] T043 [P] [US3] 编写并发新增不丢失 E2E：`tests/e2e/mvp-non-delete.e2e.test.ts`
- [x] T044 [P] [US3] 编写并发修改冲突可见 E2E：`tests/e2e/mvp-conflict-visible.e2e.test.ts`
- [x] T045 [P] [US3] 编写删除不误伤 E2E：`tests/e2e/mvp-safe-delete.e2e.test.ts`

### Implementation for User Story 3

- [x] T046 [US3] 实现插件手动同步按钮与状态面板：`apps/obsidian-plugin/src/ui/sync-status-view.ts`
- [x] T047 [US3] 实现冲突解决应用服务（ours/theirs/manual）：`apps/sync-server/src/service/conflict-resolution-service.ts`
- [x] T048 [US3] 打通 E2E 夹具与示例数据脚本：`tests/e2e/fixtures/seed-space.ts`
- [x] T049 [US3] 产出 MVP 发布与验收文档：`docs/mvp-release.md`

**Checkpoint**: 全部用户故事完成，MVP 达到可交付状态。

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事优化、文档收口与发布前加固。

- [x] T050 [P] 更新架构与接口总览文档：`docs/architecture/sync-overview.md`
- [x] T051 优化合并热点路径与批处理性能：`apps/sync-server/src/merge/three-way-merge.ts`
- [x] T052 [P] 安全加固（refresh token 轮换与撤销清理）：`apps/sync-server/src/auth/token-rotation-job.ts`
- [x] T053 执行 quickstart 全流程回归并修订步骤：`specs/20260331-obsidian-sync-merge/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 可立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1，且阻塞全部用户故事
- **US1/US2 (Phase 3-4)**: 依赖 Phase 2；可并行推进
- **US3 (Phase 5)**: 依赖 US1 + US2（需要核心同步与部署能力已具备）
- **Polish (Final Phase)**: 依赖目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 核心价值故事，Foundation 后优先实现（MVP 主体）
- **US2 (P2)**: 与 US1 在实现上可并行，但验收建议在 US1 基础能力稳定后完成
- **US3 (P3)**: 作为“方案 + 实现”交付收口，依赖 US1 与 US2 输出

### Within Each User Story

- 测试任务先于实现任务（先失败后实现）
- 数据模型/仓储先于服务层
- 服务层先于 API/UI
- 当前故事验收完成后再推进下一优先级故事

### Parallel Opportunities

- Setup 阶段：T003/T004/T005/T006 可并行
- Foundational 阶段：T009/T010/T013/T014/T016 可并行
- US1 阶段：T017-T021（测试）可并行，T022/T023/T024/T029 可并行
- US2 阶段：T033/T034/T035（测试）可并行，T038/T039 可并行
- US3 阶段：T043/T044/T045（测试）可并行

---

## Parallel Example: User Story 1

```bash
# 并行启动 US1 合约/集成测试（先写先失败）
Task: "T017 [US1] pull contract test in apps/sync-server/tests/contract/pull-changes.contract.test.ts"
Task: "T018 [US1] push contract test in apps/sync-server/tests/contract/push-changes.contract.test.ts"
Task: "T020 [US1] non-destructive merge integration test in apps/sync-server/tests/integration/non-destructive-merge.integration.test.ts"

# 并行实现核心模块
Task: "T022 [US1] three-way merge engine in apps/sync-server/src/merge/three-way-merge.ts"
Task: "T023 [US1] tombstone policy in apps/sync-server/src/merge/tombstone-policy.ts"
Task: "T029 [US1] plugin sync api client in apps/obsidian-plugin/src/sync/sync-api-client.ts"
```

## Parallel Example: User Story 2

```bash
# 并行验证部署与健康能力
Task: "T034 [US2] health-readiness integration test in apps/sync-server/tests/integration/health-readiness.integration.test.ts"
Task: "T035 [US2] docker bootstrap e2e in tests/e2e/docker-bootstrap.e2e.test.ts"

# 并行交付部署资产
Task: "T038 [US2] sync-server Dockerfile in infra/docker/sync-server.Dockerfile"
Task: "T039 [US2] docker-compose and env template in infra/docker/docker-compose.yml"
```

## Parallel Example: User Story 3

```bash
# 并行执行 MVP 关键回归
Task: "T043 [US3] mvp-non-delete e2e in tests/e2e/mvp-non-delete.e2e.test.ts"
Task: "T044 [US3] mvp-conflict-visible e2e in tests/e2e/mvp-conflict-visible.e2e.test.ts"
Task: "T045 [US3] mvp-safe-delete e2e in tests/e2e/mvp-safe-delete.e2e.test.ts"
```

---

## Implementation Strategy

### MVP First（优先 US1）

1. 完成 Phase 1 + Phase 2
2. 完成 Phase 3（US1）
3. **STOP and VALIDATE**：执行 US1 独立验收场景（A/B 并发新增不丢失）
4. 通过后进入 US2 与 US3

### Incremental Delivery

1. Setup + Foundational 完成后形成统一底座
2. 交付 US1（核心防误删同步）
3. 交付 US2（自托管部署与连通）
4. 交付 US3（MVP 测试闭环与发布）
5. 最后执行 Phase N 做跨切面优化

### Parallel Team Strategy

1. 全队先完成 Phase 1-2
2. Foundation 后并行：
   - 开发 A：US1 服务端合并与冲突
   - 开发 B：US1 插件同步编排
   - 开发 C：US2 Docker 与部署连通
3. US1/US2 收敛后合流推进 US3 E2E 与交付

---

## Notes

- `[P]` 任务应确保文件不冲突再并行执行
- 每个用户故事都定义了独立验收标准，可单独演示
- 本清单满足宪法要求：按用户故事分组、先测试后实现、可追溯到 spec/plan/contracts/data-model
- 建议每完成一个 checkpoint 进行一次可运行验证与文档同步
