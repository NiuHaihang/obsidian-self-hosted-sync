# Phase 0 Research: Obsidian 自托管合并同步

## 研究范围

- 同步算法与防误删策略（类 Git merge）
- 插件端与服务端技术栈最佳实践
- REST 契约、并发控制与错误码体系
- 离线回放、冲突保留与垃圾回收（GC）策略

## 技术上下文中的不确定项与结论

### 1) 三方合并细则

- Decision: 使用 `base`/`local`/`remote-head` 的三方合并；文本文件支持自动合并，二进制
  文件采用“保留双方副本 + 冲突记录”。
- Rationale: 可最大程度避免覆盖与误删，符合“类似 git merge”的用户期望。
- Alternatives considered:
  - LWW（最后写入胜）：实现简单，但会静默丢内容。
  - 仅目录差异覆盖：离线场景高误删风险。

### 2) 删除语义与墓碑

- Decision: 删除必须是显式操作，写入 tombstone；“文件缺失”不等于删除。删除与并发修改
  冲突时默认保留非删除版本并标记冲突。
- Rationale: 将不可逆误删转化为可恢复冲突，满足核心安全目标。
- Alternatives considered:
  - 删除优先：更易误删真实新增/修改内容。
  - 无墓碑直接物理删除：离线客户端回放时不可恢复。

### 3) 离线客户端回放

- Decision: 客户端维护幂等 `op-log`（`client_id + seq`），重连后执行“先 pull 再 rebase
  本地 pending ops 再 push”。
- Rationale: 对弱网/长离线更稳，支持断点续传与安全重试。
- Alternatives considered:
  - 每次全量重传：网络成本高，冲突定位差。
  - 仅 push 不 pull：容易在旧 base 上反复冲突。

### 4) 服务端框架与契约

- Decision: 服务端选 Fastify + TypeScript + Zod，生成 OpenAPI 契约；并发控制使用
  `base_version + expected_head`。
- Rationale: 高吞吐、强类型、契约一致性好，便于插件端稳定接入。
- Alternatives considered:
  - Express：生态成熟，但类型与性能体验较弱。
  - NestJS：工程化强但初期复杂度偏高。

### 5) 鉴权模型

- Decision: 采用“设备凭据 + 短期 Access JWT + 可轮换 Refresh Token”。
- Rationale: 平衡安全与可用性，支持设备级撤销与审计。
- Alternatives considered:
  - 仅长期 token：泄露风险高。
  - 仅短 JWT：插件体验差（频繁重新授权）。

### 6) 可观测性

- Decision: JSON 结构化日志（含 request_id/client_id/version_span）、Prometheus 指标、
  OpenTelemetry 链路。
- Rationale: 同步问题多为时序与偶发问题，必须可检索可追踪。
- Alternatives considered:
  - 纯文本日志：查询困难，定位效率低。

### 7) GC 参数默认值

- Decision:
  - `tombstone_ttl = 45d`
  - `oplog_retention = 60d`
  - `conflict_retention = 90d`
  - `light_gc_interval = 1h`, `deep_gc_interval = 24h`
- Rationale: 保守策略优先数据安全，覆盖长离线回放窗口。
- Alternatives considered:
  - 激进清理（7d-14d）：节省空间但恢复窗口过短。

## 依赖与集成研究结论

### Obsidian 插件侧

- Decision: 采用“启动全量扫描 + 运行时事件驱动增量收集 + 路径级去抖（debounce + maxWait）”。
- Rationale: 降低 I/O 与网络风暴，避免阻塞编辑体验。
- Alternatives considered:
  - 高频轮询：大 vault 资源开销过高。

### PostgreSQL 建模

- Decision: 使用 `revisions`（历史）+ `file_entry`（当前视图）双模型；核心字段关系型约束，
  扩展信息用 JSONB。
- Rationale: 兼顾查询效率与可追溯性。
- Alternatives considered:
  - 全事件溯源：复杂度高，MVP 周期不友好。

### REST 同步契约

- Decision: 端点覆盖注册、pull、push、冲突查询、冲突解决、健康检查；错误码最小集合：
  `AUTH_FAILED`、`FORBIDDEN`、`MERGE_CONFLICT`、`VERSION_TOO_OLD`、
  `EXPECTED_HEAD_MISMATCH`、`INVALID_CHANGESET`。
- Rationale: 能完整承载“可重试 + 可解释 + 可恢复”的同步流程。
- Alternatives considered:
  - 仅 HTTP 状态码：客户端重试与分流策略不足。

## 结论

技术上下文中的关键不确定项均已收敛，无残留 `NEEDS CLARIFICATION`。可进入
Phase 1 设计与契约固化。
