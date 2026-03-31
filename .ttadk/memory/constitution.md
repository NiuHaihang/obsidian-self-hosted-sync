<!--
Sync Impact Report
- Version change: template placeholder -> 1.0.0
- Modified principles:
  - PRINCIPLE_1_NAME -> I. 规格优先与可追溯性
  - PRINCIPLE_2_NAME -> II. 独立增量交付
  - PRINCIPLE_3_NAME -> III. 宪法门禁与质量校验
  - PRINCIPLE_4_NAME -> IV. 一致性实现与最小改动
  - PRINCIPLE_5_NAME -> V. 工具化协作与知识优先
- Added sections:
  - 安全与合规约束
  - 工作流与交付门槛
- Removed sections:
  - 无
- Templates requiring updates:
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/plan-template.md
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/spec-template.md
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/tasks-template.md
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/plan-template-lite.md
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/spec-template-lite.md
  - ✅ 已校验并对齐: .ttadk/plugins/ttadk/core/resources/templates/tasks-template-lite.md
- Command docs requiring updates:
  - ✅ 已更新: .opencode/commands/adk/erd.md (移除 CLAUDE.md 专属引用)
- Deferred TODOs:
  - 无
-->

# Self-Hosted Sync Constitution

## Core Principles

### I. 规格优先与可追溯性
所有功能工作 MUST 先形成可追溯链路：用户输入、用户故事、功能需求、成功标准、
实施任务。若信息不足，MUST 使用 NEEDS CLARIFICATION 明确标记，禁止隐式假设。
理由：保证交付范围可验证、需求来源可追踪，降低返工与误解。

### II. 独立增量交付
每个用户故事 MUST 可独立实现、独立测试、独立演示，按优先级递进交付（P1 到 Pn）。
新增能力 MUST 不破坏已交付故事的可用性。
理由：确保 MVP 可尽早落地，并支持低风险迭代。

### III. 宪法门禁与质量校验
计划文档 MUST 在调研前完成 Constitution Check，并在方案设计后再次复核。任何对 MUST
规则的偏离 MUST 记录在 Complexity Tracking，包含必要性与被拒绝的更简单替代方案。
理由：将治理要求前置为门禁，避免在实施末期集中暴露结构性问题。

### IV. 一致性实现与最小改动
实现时 MUST 优先复用现有代码模式、命名约定和架构分层；未经充分理由，SHOULD NOT
引入新的框架或跨层依赖。变更 MUST 控制在最小影响面，并同步更新相关文档。
理由：降低维护成本，提升代码可读性与长期演进稳定性。

### V. 工具化协作与知识优先
涉及提交请求时 MUST 使用 `/adk:commit` 流程。遇到陌生概念时 MUST 优先使用
`tiksearch` 查询内部知识，处理飞书文档 MUST 使用 `lark-docs`。所有输出 MUST 与
`.ttadk/config.json` 的 `preferred_language` 保持一致。
理由：统一协作路径与知识来源，减少信息偏差并提升执行效率。

## 安全与合规约束

- 禁止将密钥、令牌、账号口令或其他敏感信息提交到仓库。
- 新增依赖 MUST 说明用途、来源与风险；无法说明时不得引入。
- 涉及外部系统、权限或数据处理的变更 MUST 在规格中明确边界与失败处理策略。
- 对外接口或关键行为发生不兼容变化时 MUST 在计划中给出迁移或回滚方案。

## 工作流与交付门槛

- 标准流程使用 `/adk:specify`、`/adk:plan`、`/adk:tasks`、`/adk:implement`。
- 轻量流程可使用 `/adkl:proposal`，但不得跳过宪法校验、安全约束和验收标准定义。
- `spec.md` MUST 覆盖用户输入的全部有效信息；`plan.md` MUST 包含技术上下文与宪法门禁；
  `tasks.md` MUST 按用户故事分组并支持独立验收。
- 若规格显式要求测试，任务中 MUST 先写测试并验证失败，再进入实现。

## Fixed Rules

- **Commit**: 当用户通过自然语言请求提交代码（例如“帮我提交”或“提交变更”）时，执行
  `/adk:commit` 以暂存变更、生成提交信息并推送到远程仓库。

- **Code Consistency**: 实现功能时，优先参考现有代码库中的模式、编码风格和架构设计。
  遵循既有约定以保持一致性。

- **Knowledge Search**: 遇到不熟悉的概念时，使用 `tiksearch` MCP 查询内部文档与最佳实践；
  处理 Lark/飞书文档时使用 `lark-docs` MCP。

## Governance

- 本宪法优先于日常执行习惯与临时约定；若冲突发生，以本宪法为准。
- 修订流程：提出变更说明（含影响范围与迁移方案） -> 维护者评审通过 -> 同步更新受影响模板
  与命令文档 -> 记录版本与修订日期。
- 版本策略采用语义化版本：MAJOR 用于不兼容治理变更或原则重定义，MINOR 用于新增原则或
  实质性扩展，PATCH 用于澄清性与非语义修订。
- 合规审查要求：在生成计划时执行一次，在方案完成后复核一次，在合并前最终确认一次；任何
  MUST 级违规均视为阻塞项，必须先修复后推进。

**Version**: 1.0.0 | **Ratified**: 2026-03-31 | **Last Amended**: 2026-03-31
