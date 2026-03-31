# Data Model: Obsidian 自托管合并同步

## 1. 实体清单

### 1.1 User

- id (uuid)
- email (string, unique)
- display_name (string)
- status (enum: active, disabled)
- created_at (timestamp)
- updated_at (timestamp)

### 1.2 SyncSpace (Vault 映射)

- id (uuid)
- owner_user_id (uuid, fk -> User.id)
- name (string)
- slug (string, unique)
- current_head_version (bigint)
- tombstone_ttl_days (int, default 45)
- conflict_retention_days (int, default 90)
- created_at (timestamp)
- updated_at (timestamp)

### 1.3 ClientDevice

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- user_id (uuid, fk -> User.id)
- device_fingerprint (string, unique per space)
- client_name (string)
- last_seen_at (timestamp)
- status (enum: active, revoked)
- created_at (timestamp)

### 1.4 AuthSession

- id (uuid)
- device_id (uuid, fk -> ClientDevice.id)
- access_jti (string, unique)
- refresh_token_hash (string)
- expires_at (timestamp)
- revoked_at (timestamp, nullable)
- created_at (timestamp)

### 1.5 FileBlob

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- content_hash (string, sha256)
- size_bytes (bigint)
- mime_type (string)
- storage_key (string)
- created_at (timestamp)

约束：`(space_id, content_hash)` 唯一。

### 1.6 FileEntry

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- path (string)
- current_blob_id (uuid, fk -> FileBlob.id, nullable)
- is_deleted (boolean)
- last_change_version (bigint)
- last_change_device_id (uuid, fk -> ClientDevice.id)
- updated_at (timestamp)

约束：`(space_id, path)` 唯一。

### 1.7 SyncCommit

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- version (bigint, monotonic)
- parent_version (bigint, nullable for genesis)
- author_device_id (uuid, fk -> ClientDevice.id)
- merge_mode (enum: fast_forward, merged, conflict_partial)
- change_count (int)
- created_at (timestamp)

约束：`(space_id, version)` 唯一。

### 1.8 FileOperation

- id (uuid)
- commit_id (uuid, fk -> SyncCommit.id)
- op_type (enum: upsert, delete, rename)
- path (string)
- new_path (string, nullable for rename)
- base_version (bigint)
- blob_id (uuid, fk -> FileBlob.id, nullable)
- content_encoding (enum: utf8, binary_base64, default utf8)
- op_idempotency_key (string)
- created_at (timestamp)

约束：`(commit_id, op_idempotency_key)` 唯一。

### 1.9 Tombstone

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- path (string)
- delete_version (bigint)
- deleted_by_device_id (uuid, fk -> ClientDevice.id)
- prior_blob_id (uuid, fk -> FileBlob.id, nullable)
- expires_at (timestamp)
- purged_at (timestamp, nullable)
- created_at (timestamp)

### 1.10 ConflictRecord

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- conflict_set_id (uuid)
- path (string)
- conflict_type (enum: content_diverged, delete_vs_modify, rename_conflict, binary_conflict)
- base_version (bigint)
- server_version (bigint)
- client_base_version (bigint)
- server_blob_id (uuid, fk -> FileBlob.id, nullable)
- client_blob_id (uuid, fk -> FileBlob.id, nullable)
- resolution_strategy (enum: ours, theirs, manual, unresolved)
- resolved_at (timestamp, nullable)
- created_at (timestamp)

### 1.11 SyncAuditLog

- id (uuid)
- space_id (uuid, fk -> SyncSpace.id)
- device_id (uuid, fk -> ClientDevice.id, nullable)
- request_id (string)
- action (string)
- base_version (bigint, nullable)
- head_before (bigint, nullable)
- head_after (bigint, nullable)
- file_changed (int)
- conflict_count (int)
- status_code (int)
- created_at (timestamp)

## 2. 实体关系

- User 1:N SyncSpace
- SyncSpace 1:N ClientDevice
- ClientDevice 1:N AuthSession
- SyncSpace 1:N SyncCommit
- SyncCommit 1:N FileOperation
- SyncSpace 1:N FileEntry
- SyncSpace 1:N FileBlob
- SyncSpace 1:N Tombstone
- SyncSpace 1:N ConflictRecord
- SyncSpace 1:N SyncAuditLog

## 3. 校验规则

- `path` 必须是 vault 内相对路径，禁止 `..` 路径穿越。
- `base_version` 不能大于当前 `head_version`。
- 删除操作必须显式 `op_type=delete`，不能通过缺失文件推导。
- `expected_head` 不匹配时拒绝直接写入，返回并发错误。
- 二进制文件冲突禁止自动内容合并，必须保留双方副本或人工选择。
- `upsert` 可选 `content_encoding`，未提供按 `utf8` 处理；二进制附件应使用 `binary_base64`。
- `op_idempotency_key` 在同一提交上下文必须唯一，支持安全重试。

## 4. 状态流转

### 4.1 同步会话

1. device 注册并建立 AuthSession
2. pull(from_version) 获取增量与 head
3. 本地计算 delta 并 push(base_version, expected_head)
4. 服务端执行 merge：
   - fast_forward/merged -> 生成新 commit
   - 冲突 -> 生成 ConflictRecord，返回 conflict_set_id
5. 客户端处理冲突后提交 resolution

### 4.2 文件状态

- Active -> Modified（upsert）
- Active -> Tombstoned（delete）
- Tombstoned -> Purged（满足 TTL 且满足清理条件）
- Active/Tombstoned -> Conflict（并发操作不可自动合并）
- Conflict -> Active（冲突解决后）
