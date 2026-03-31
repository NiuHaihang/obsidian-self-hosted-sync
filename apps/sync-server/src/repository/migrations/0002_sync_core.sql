CREATE TABLE IF NOT EXISTS file_blob (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  content_hash TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, content_hash)
);

CREATE TABLE IF NOT EXISTS sync_commit (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  version BIGINT NOT NULL,
  parent_version BIGINT,
  author_device_id UUID NOT NULL REFERENCES client_device(id),
  merge_mode TEXT NOT NULL,
  change_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, version)
);

CREATE TABLE IF NOT EXISTS file_entry (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  path TEXT NOT NULL,
  current_blob_id UUID REFERENCES file_blob(id),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  last_change_version BIGINT NOT NULL,
  last_change_device_id UUID NOT NULL REFERENCES client_device(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, path)
);

CREATE TABLE IF NOT EXISTS file_operation (
  id UUID PRIMARY KEY,
  commit_id UUID NOT NULL REFERENCES sync_commit(id),
  op_type TEXT NOT NULL,
  path TEXT NOT NULL,
  new_path TEXT,
  base_version BIGINT NOT NULL,
  blob_id UUID REFERENCES file_blob(id),
  op_idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (commit_id, op_idempotency_key)
);
