# Data Model: PostgreSQL 存储集成方案

## 1. 实体定义

### 1.1 SyncSpace

- id (uuid, PK)
- owner_user_id (uuid)
- name (text)
- slug (text, unique)
- current_head_version (bigint)
- tombstone_ttl_days (int)
- conflict_retention_days (int)
- created_at (timestamptz)
- updated_at (timestamptz)

### 1.2 ClientDevice

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- user_id (uuid)
- device_fingerprint (text, unique per space)
- client_name (text)
- status (enum: active, revoked)
- last_seen_at (timestamptz)
- created_at (timestamptz)

### 1.3 AuthSession

- id (uuid, PK)
- device_id (uuid, FK -> ClientDevice.id)
- access_jti (text, unique)
- refresh_token_hash (text)
- expires_at (timestamptz)
- revoked_at (timestamptz, nullable)
- created_at (timestamptz)

### 1.4 SyncCommit

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- version (bigint, unique within space)
- parent_version (bigint)
- author_device_id (uuid, FK -> ClientDevice.id)
- merge_mode (enum: fast_forward, merged, conflict)
- change_count (int)
- created_at (timestamptz)

### 1.5 FileBlob

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- content_hash (text)
- size_bytes (bigint)
- mime_type (text)
- storage_key (text)
- created_at (timestamptz)

约束：`(space_id, content_hash)` 唯一。

### 1.6 FileEntry

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- path (text)
- current_blob_id (uuid, FK -> FileBlob.id, nullable)
- is_deleted (boolean)
- last_change_version (bigint)
- last_change_device_id (uuid, FK -> ClientDevice.id)
- updated_at (timestamptz)

约束：`(space_id, path)` 唯一。

### 1.7 FileOperation

- id (uuid, PK)
- commit_id (uuid, FK -> SyncCommit.id)
- op_type (enum: upsert, delete, rename)
- path (text)
- new_path (text, nullable)
- base_version (bigint)
- blob_id (uuid, FK -> FileBlob.id, nullable)
- op_idempotency_key (text)
- created_at (timestamptz)

### 1.8 Tombstone

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- path (text)
- delete_version (bigint)
- deleted_by_device_id (uuid, FK -> ClientDevice.id)
- prior_blob_id (uuid, FK -> FileBlob.id, nullable)
- expires_at (timestamptz)
- purged_at (timestamptz, nullable)
- created_at (timestamptz)

### 1.9 ConflictRecord

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- conflict_set_id (uuid)
- path (text)
- conflict_type (enum: content_diverged, delete_vs_modify, rename_conflict, binary_conflict)
- base_version (bigint)
- server_version (bigint)
- client_base_version (bigint)
- server_blob_id (uuid, FK -> FileBlob.id, nullable)
- client_blob_id (uuid, FK -> FileBlob.id, nullable)
- resolution_strategy (enum: unresolved, ours, theirs, manual)
- resolved_at (timestamptz, nullable)
- created_at (timestamptz)

### 1.10 SyncAuditLog

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- device_id (uuid, FK -> ClientDevice.id, nullable)
- request_id (text)
- action (text)
- base_version (bigint, nullable)
- head_before (bigint, nullable)
- head_after (bigint, nullable)
- file_changed (int)
- conflict_count (int)
- status_code (int)
- created_at (timestamptz)

### 1.11 SyncIdempotency

- id (uuid, PK)
- space_id (uuid, FK -> SyncSpace.id)
- client_id (uuid, FK -> ClientDevice.id)
- idempotency_key (text)
- request_hash (text)
- response_payload (jsonb)
- status (enum: processing, completed)
- created_at (timestamptz)
- updated_at (timestamptz)

约束：`(space_id, client_id, idempotency_key)` 唯一。

## 2. 关系图（逻辑）

- SyncSpace 1:N ClientDevice
- ClientDevice 1:N AuthSession
- SyncSpace 1:N SyncCommit
- SyncCommit 1:N FileOperation
- SyncSpace 1:N FileEntry
- SyncSpace 1:N FileBlob
- SyncSpace 1:N Tombstone
- SyncSpace 1:N ConflictRecord
- SyncSpace 1:N SyncAuditLog
- SyncSpace + ClientDevice 1:N SyncIdempotency

## 3. 校验规则

- `base_version` MUST 小于等于当前 `head_version`
- `expected_head` 不匹配时 MUST 拒绝写入
- `delete` 必须显式操作，不允许通过“文件缺失”推导
- `path` 必须为 vault 相对路径，禁止 `..` 路径穿越
- 关键写链路（push/resolve）必须同事务完成

## 4. 状态流转

### 4.1 同步提交状态

1. 客户端发起 push（带 `base_version`/`expected_head`/`idempotency_key`）
2. 服务端校验并执行三方合并
3. 成功：写入 SyncCommit/FileOperation/FileEntry（及必要 Tombstone/ConflictRecord）
4. 记录审计日志并提交事务

### 4.2 冲突状态

- `open`（检测到冲突） -> `resolved`（策略处理后关闭）

### 4.3 墓碑状态

- `active`（逻辑删除） -> `purged`（超过保留期且满足清理条件）
