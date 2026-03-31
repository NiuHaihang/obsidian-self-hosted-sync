---
description: "Implementation plan template for feature development"
---

# Implementation Plan: PostgreSQL 存储集成方案

**Feature**: `20260331-plugin-pg-storage` | **Date**: 2026-03-31 | **Spec**: `/Users/niuhaihang/self-hosted-sync/specs/20260331-plugin-pg-storage/spec.md`
**Input**: Feature specification from `/specs/20260331-plugin-pg-storage/spec.md`

## Summary

将同步服务的存储后端从内存实现升级为 PostgreSQL 持久化实现，保持现有同步 API 协议兼容。
技术方案采用“仓储接口 + 事务上下文”抽象，核心写路径（push/conflict/audit）单事务提交，
并补齐迁移治理、部署验证、集成测试与 CI 门禁，确保重启后数据可恢复、并发下状态一致。

## Technical Context

**Language/Version**: TypeScript 5.x（Node.js 20 LTS）  
**Primary Dependencies**: Fastify, PostgreSQL driver (`pg`), JSON Web Token, Docker Compose, Vitest, Testcontainers  
**Storage**: PostgreSQL（核心元数据与版本日志）+ 对象存储（blob 内容）  
**Testing**: Vitest（contract/integration），PostgreSQL 集成测试（Testcontainers），E2E 回归  
**Target Platform**: Linux Docker 服务器（生产）+ 本地开发环境（macOS/Linux）
**Project Type**: Web application（后端服务 + 插件客户端）  
**Performance Goals**: 100 轮 push/pull 回归一致性错误为 0；服务重启后恢复率 100%；部署验证 <= 30 分钟  
**Constraints**: 保持 API 协议兼容；关键写链路必须事务一致；PostgreSQL 不可用时 readiness 必须失败  
**Scale/Scope**: 单 vault 万级文件、5-10 活跃客户端、日请求万级，优先保证一致性和可恢复性

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Gate 1 - 规格优先与可追溯性**: PASS  
  `spec.md` 已覆盖用户输入并明确 US1~US3、FR、SC，可追溯到本计划。
- **Gate 2 - 独立增量交付**: PASS  
  按 P1（PG 持久化）-> P2（部署验证）-> P3（回归门禁）分阶段交付。
- **Gate 3 - 宪法门禁与质量校验**: PASS  
  已在计划阶段定义门禁，且在设计产物完成后将执行复核。
- **Gate 4 - 一致性实现与最小改动**: PASS  
  仅替换存储层实现，保持 API 协议兼容，不引入不必要框架迁移。
- **Gate 5 - 工具化协作与知识优先**: PASS  
  关键技术不确定项已通过 Phase 0 研究收敛。
- **Gate 6 - 安全与合规约束**: PASS  
  涉及认证、连接、迁移失败、回滚与审计的治理策略已纳入。

## Project Structure

### Documentation (this feature)

```
specs/20260331-plugin-pg-storage/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```
apps/
├── sync-server/
│   ├── src/
│   │   ├── api/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── merge/
│   │   └── auth/
│   └── tests/
│       ├── contract/
│       ├── integration/
│       └── unit/
└── obsidian-plugin/
    ├── src/
    └── tests/

infra/
└── docker/
    ├── docker-compose.yml
    ├── .env.example
    └── sync-server.Dockerfile

packages/
└── shared-contracts/

tests/
└── e2e/
```

**Structure Decision**: 采用“后端服务 + 插件客户端 + 共享契约 + Docker 基础设施”分层，
在不破坏现有 API 的前提下完成 PostgreSQL 持久化替换与验证。

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Research Output (Completed)

- 已生成 `research.md`，覆盖并收敛以下不确定项：
  - 仓储抽象与事务边界
  - 并发控制、幂等键、索引与锁策略
  - 迁移工具与生产验证流程
  - PostgreSQL 集成测试与 CI 分层门禁

## Phase 1 Design Output (Completed)

- 已生成 `data-model.md`：定义持久化实体、关系、校验规则、状态流转。
- 已生成 `contracts/openapi.yaml`：定义健康检查、迁移状态、注册、push/pull、冲突处理契约。
- 已生成 `quickstart.md`：提供 PostgreSQL 部署、联通、重启恢复与回归验证步骤。

## Constitution Check (Post-Design Re-check)

- **Re-check Result**: PASS
- 门禁映射结果：
  - 可追溯性：spec -> plan -> research/data-model/contracts 已闭环
  - 独立交付：US1/US2/US3 可分阶段验收
  - 安全合规：readiness 联动数据库，迁移与失败处理路径明确
  - 一致性：存储替换不改协议，最小影响面落地
