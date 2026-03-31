---
description: "Implementation plan template for feature development"
---

# Implementation Plan: Obsidian 自托管合并同步

**Feature**: `20260331-obsidian-sync-merge` | **Date**: 2026-03-31 | **Spec**: `/Users/niuhaihang/self-hosted-sync/specs/20260331-obsidian-sync-merge/spec.md`
**Input**: Feature specification from `/specs/20260331-obsidian-sync-merge/spec.md`

## Summary

构建一个 Obsidian 插件和自托管同步服务，支持 Docker 部署，并通过三方合并与显式
墓碑机制避免多客户端版本不一致导致的误删。技术路线采用 TypeScript 全栈：插件端
负责本地变更采集与同步编排，服务端负责版本管理、合并、冲突管理与审计；契约采用
REST + OpenAPI，默认策略以“数据不丢失优先于自动覆盖”。

## Technical Context

**Language/Version**: TypeScript 5.x（插件端与服务端），Node.js 20 LTS（服务端）  
**Primary Dependencies**: Obsidian Plugin API, Fastify, Zod, PostgreSQL driver, Pino, Docker Compose  
**Storage**: PostgreSQL（元数据/版本日志/冲突记录）+ 本地对象存储卷（blob 内容）  
**Testing**: Vitest（单元）、Testcontainers + Vitest（集成）、Playwright/脚本化 E2E（端到端）  
**Target Platform**: Obsidian Desktop（macOS/Windows/Linux）+ Linux Docker 服务器
**Project Type**: Web application（插件客户端 + 后端服务）  
**Performance Goals**: 95% 增量同步请求在 2 秒内完成；并发新增场景误删率 0；冲突可见率 100%  
**Constraints**: 缺失文件不得视为删除；删除必须显式墓碑；离线客户端重连可回放；默认支持 Docker 一键部署  
**Scale/Scope**: 单 vault 2 万文件、单文件 <= 20MB、5-10 活跃客户端、日同步请求 1 万次量级

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Gate 1 - 规格优先与可追溯性**: PASS  
  `spec.md` 已覆盖用户输入并给出 FR/SC/场景，可直接追溯到实现。
- **Gate 2 - 独立增量交付**: PASS  
  按 US1（核心防误删）-> US2（Docker 自托管）-> US3（MVP 完整实现）递进。
- **Gate 3 - 宪法门禁与质量校验**: PASS  
  本计划在 Phase 0 前建立门禁，Phase 1 后复核；无 MUST 级冲突。
- **Gate 4 - 一致性实现与最小改动**: PASS  
  采用通用 TypeScript 技术栈，不引入不必要跨层依赖。
- **Gate 5 - 工具化协作与知识优先**: PASS  
  方案研究已覆盖同步算法、契约与最佳实践，输出到 `research.md`。
- **Gate 6 - 安全与合规约束**: PASS  
  鉴权、密钥管理、审计日志、回滚策略已纳入设计。

## Project Structure

### Documentation (this feature)

```
specs/20260331-obsidian-sync-merge/
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
├── obsidian-plugin/
│   ├── src/
│   │   ├── main.ts
│   │   ├── sync/
│   │   ├── storage/
│   │   └── ui/
│   └── tests/
│       ├── unit/
│       └── integration/
└── sync-server/
    ├── src/
    │   ├── api/
    │   ├── service/
    │   ├── repository/
    │   ├── merge/
    │   └── auth/
    └── tests/
        ├── unit/
        ├── integration/
        └── contract/

packages/
└── shared-contracts/
    ├── openapi/
    └── types/

infra/
└── docker/
    ├── docker-compose.yml
    └── .env.example

tests/
└── e2e/
```

**Structure Decision**: 采用“插件端 + 服务端 + 共享契约 + 基础设施”分层结构，确保
同步算法、API 契约、部署资产与测试可独立演进，并满足 US1~US3 的增量交付路径。

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Research Output (Completed)

- 已生成 `research.md`，覆盖：
  - 三方合并 + tombstone 防误删策略
  - Obsidian 插件与 Node/PostgreSQL 最佳实践
  - REST 契约与并发控制（`base_version` + `expected_head`）
  - 错误码、冲突解决与 GC 建议参数

## Phase 1 Design Output (Completed)

- 已生成 `data-model.md`，定义实体、字段、关系、约束与状态流转。
- 已生成 `contracts/openapi.yaml`，覆盖注册、pull、push、冲突查询/解决、健康检查。
- 已生成 `quickstart.md`，包含 Docker 部署、插件配置与端到端验证步骤。

## Constitution Check (Post-Design Re-check)

- **Re-check Result**: PASS
- 所有 MUST 规则已映射到设计产物：
  - 防误删合并策略 -> `research.md` + `contracts/openapi.yaml`
  - 安全与审计 -> `data-model.md`（auth/session/audit 字段）
  - 可部署与可验证 -> `quickstart.md`（compose + 验证流程）
  - 增量交付 -> plan 分阶段与文档产物齐全
