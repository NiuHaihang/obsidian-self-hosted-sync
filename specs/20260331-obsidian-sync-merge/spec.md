# Feature Specification: Obsidian 自托管合并同步

**Feature**: `20260331-obsidian-sync-merge`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "我需要开发一个obsidian的插件，目的是用来做自托管同步，可以使用docker部署在服务器上，要求多客户端同步时不会产生因为不同客户端的版本不一致导致的文件被删掉的情况，比如A客户端有abc、def文件，B客户端有def、ghk文件，但是同步的时候不允许把abc和ghk删除，只保留了def这种情况发生。不同客户端的文件同步应该类似git的merge操作。帮我想一个方案并实现。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 多客户端安全合并同步 (Priority: P1)

作为 Obsidian 用户，我希望在多个客户端（例如笔记本和台式机）同时使用同一个 vault 时，
同步不会因为客户端版本不一致而误删文件。系统需要像 Git merge 一样对变更进行合并，
确保不同客户端新增的文件都能被保留。

**Why this priority**: 这是该插件的核心价值；若不能防止误删，功能即不可用。

**Technical Implementation**:

- 客户端侧实现 Obsidian 插件，维护本地 `manifest`（路径、内容哈希、修改时间、逻辑删除标记、
  最后同步版本 `base_version`）。
- 服务端实现自托管同步服务，维护仓库快照与变更日志：
  - `commit` 表示一次提交（包含父版本）。
  - `file_index` 记录每个路径在当前版本的文件哈希与删除墓碑。
  - `blob` 存储文件内容（按哈希去重）。
- 同步协议采用三方合并（`base` / `local` / `remote-head`）：
  1. 客户端基于上次同步版本计算本地 delta（新增、修改、删除）。
  2. 服务端在 `base` 与 `remote-head` 间计算远端 delta。
  3. 针对每个路径执行合并规则：
     - 仅一侧新增 -> 直接保留新增。
     - 双侧新增且内容相同 -> 合并为单文件。
     - 双侧新增或修改且内容不同 -> 生成冲突文件（如 `name.conflict.<client>.md`）并保留两份。
     - 一侧删除、一侧修改或新增 -> 优先保留非删除版本，并记录冲突事件，不执行物理删除。
     - 双侧删除 -> 记录墓碑，可在保留期后清理。
- 删除安全策略：
  - 缺失文件不等于删除；只有显式删除操作才写入墓碑。
  - 物理删除延迟执行（软删除），避免因离线客户端或旧版本清单导致误删。
- 覆盖用户示例：
  - A 客户端文件 `{abc, def}`，B 客户端文件 `{def, ghk}`，同步后结果 MUST 至少包含
    `{abc, def, ghk}`，不得出现仅保留 `def` 的情况。

**Independent Test**: 启动两个客户端，在未互相拉取的情况下分别新增 `abc.md` 和 `ghk.md`，
随后双向同步，最终两个客户端和服务端均可见两份新增文件。

**Acceptance Scenarios**:

1. **Given** 客户端 A 有 `abc.md`、`def.md`，客户端 B 有 `def.md`、`ghk.md`，
   **When** 两端先后执行同步，**Then** 最终仓库保留 `abc.md`、`def.md`、`ghk.md`，不发生误删。
2. **Given** 同一文件在两端被并发修改，**When** 执行同步，**Then** 系统保留至少一个可用版本并产出
   冲突标记，用户可手工消解。

---

### User Story 2 - 可 Docker 部署的自托管服务 (Priority: P2)

作为有服务器资源的用户，我希望使用 Docker 快速部署同步服务，以便在自己的环境中运行。

**Why this priority**: 自托管是用户明确要求，决定了方案能否落地。

**Technical Implementation**:

- 提供 `docker-compose.yml`，默认包含：
  - `sync-server`：提供 REST API（认证、拉取、推送、冲突查询、健康检查）。
  - `db`：存储元数据与版本日志（默认 PostgreSQL）。
  - `object-store`：存储文件内容（默认本地 volume，可扩展 MinIO）。
- 提供 `.env.example`，至少含：服务端口、JWT 密钥、数据库连接、对象存储路径、
  冲突保留策略与墓碑保留期。
- 提供一键部署说明：`docker compose up -d` 后可通过 `/health` 验证服务可用。
- 插件端配置页面支持填写服务器地址、访问令牌、客户端 ID，并可执行连接测试。

**Independent Test**: 在全新服务器执行 Docker 部署命令，30 分钟内完成服务可用性验证，并可被
单个 Obsidian 客户端成功连接。

**Acceptance Scenarios**:

1. **Given** 用户拥有 Docker 环境，**When** 按文档启动 compose，**Then** 同步服务可健康运行，
   插件可成功认证并完成一次上传与下载。

---

### User Story 3 - 从方案到实现的可交付 MVP (Priority: P3)

作为需求提出者，我希望不仅有方案，还能有可运行的首版实现，覆盖插件端、服务端和关键测试，
以验证该同步机制可用。

**Why this priority**: 用户明确提出“帮我想一个方案并实现”，需要可执行交付而非仅概念设计。

**Technical Implementation**:

- 交付边界（MVP）：
  - Obsidian 插件：文件扫描、变更检测、手动同步按钮、冲突提示。
  - 服务端：版本提交、三方合并、冲突记录、软删除墓碑。
  - 部署资产：Dockerfile、docker-compose、环境变量模板、快速启动文档。
  - 质量保障：至少覆盖“并发新增不丢失”“并发修改可检测冲突”“删除不误伤”的自动化测试。
- 推荐技术实现（可在计划阶段细化）：
  - 插件：TypeScript + Obsidian Plugin API。
  - 服务端：TypeScript（Node.js）+ PostgreSQL。
  - 合并：文本文件优先行级合并；二进制文件采用“保留双方副本 + 冲突标记”。
  - 传输编码：`upsert` 支持 `content_encoding`（`utf8`/`binary_base64`），避免附件按 UTF-8 误解码。
- 审计与可观测性：记录每次同步会话 ID、客户端 ID、版本跨度、冲突数量与文件统计，支持排障。

**Independent Test**: 通过自动化测试与手工回归，验证 MVP 在双客户端并发场景下可稳定同步，
且不存在因版本不一致导致的误删。

**Acceptance Scenarios**:

1. **Given** 完整部署的 MVP，**When** 执行端到端同步测试集，**Then** 所有关键场景通过，且日志中
   无“非显式删除导致文件丢失”的事件。

---

### Edge Cases

- 客户端离线数天后恢复同步，期间远端已多次提交。
- 同一路径在一端被重命名、另一端被修改。
- 大文件或二进制附件（图片、PDF）在双端被不同方式更新。
- 客户端本地索引损坏或 `base_version` 失效。
- 网络中断发生在上传中途，导致一次同步仅部分成功。
- 客户端时间戳不一致（时钟漂移）导致修改时间不可直接信任。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 提供一个 Obsidian 插件，使用户可以将本地 vault 与自托管服务进行双向同步。
- **FR-002**: 系统 MUST 支持 Docker 部署在用户服务器环境中，并提供可直接执行的部署配置与说明。
- **FR-003**: 系统 MUST 在多客户端并发同步时采用类似 Git merge 的三方合并机制，而非简单覆盖。
- **FR-004**: 系统 MUST 防止因客户端版本不一致导致的误删；缺失文件 MUST NOT 被默认判定为删除。
- **FR-005**: 系统 MUST 对删除操作采用显式墓碑机制，并支持延迟物理删除策略。
- **FR-006**: 当客户端 A 为 `{abc, def}`、客户端 B 为 `{def, ghk}` 时，系统同步结果 MUST 保留
  `abc` 与 `ghk`，不得仅剩 `def`。
- **FR-007**: 系统 MUST 在同一路径并发修改且无法自动合并时保留双方内容，并生成冲突标记供用户处理。
- **FR-008**: 用户 MUST 能在插件内配置服务地址与凭据，并执行连接测试与手动同步。
- **FR-009**: 系统 MUST 记录同步审计日志（客户端、版本、文件变更统计、冲突信息），用于问题追踪。
- **FR-010**: 系统 MUST 交付可运行 MVP（插件 + 服务端 + Docker 部署 + 关键测试）。

### Key Entities *(include if feature involves data)*

- **ClientManifest**: 客户端清单，记录文件路径、哈希、逻辑删除标记、最后同步版本。
- **SyncCommit**: 一次同步提交，包含提交 ID、父版本、提交客户端、时间与变更摘要。
- **FileBlob**: 文件内容对象，按内容哈希去重存储。
- **FileEntry**: 某版本下路径对应的状态（有效内容或墓碑）。
- **ConflictRecord**: 冲突记录，包含路径、冲突类型、双方版本引用、解决状态。
- **Tombstone**: 显式删除标记，带创建时间、来源客户端与清理条件。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在双客户端并发新增场景下（含 `A={abc,def}`、`B={def,ghk}`），100% 同步后文件保留完整，
  无“新增文件被误删”情况。
- **SC-002**: 在 100 轮并发同步回归测试中，误删事件数为 0，且每轮都能完成可恢复同步。
- **SC-003**: 新用户按照部署文档可在 30 分钟内完成 Docker 部署并让至少 1 个客户端成功同步。
- **SC-004**: 对并发编辑冲突场景，100% 能给出可见冲突结果（冲突文件或冲突记录），用户可继续编辑，
  不出现 vault 不可用。
