CREATE TABLE IF NOT EXISTS tombstone (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  path TEXT NOT NULL,
  delete_version BIGINT NOT NULL,
  deleted_by_device_id UUID NOT NULL REFERENCES client_device(id),
  prior_blob_id UUID REFERENCES file_blob(id),
  expires_at TIMESTAMPTZ NOT NULL,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conflict_record (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  conflict_set_id UUID NOT NULL,
  path TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  base_version BIGINT NOT NULL,
  server_version BIGINT NOT NULL,
  client_base_version BIGINT NOT NULL,
  server_blob_id UUID REFERENCES file_blob(id),
  client_blob_id UUID REFERENCES file_blob(id),
  resolution_strategy TEXT NOT NULL DEFAULT 'unresolved',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_audit_log (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  device_id UUID REFERENCES client_device(id),
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  base_version BIGINT,
  head_before BIGINT,
  head_after BIGINT,
  file_changed INT NOT NULL DEFAULT 0,
  conflict_count INT NOT NULL DEFAULT 0,
  status_code INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
