CREATE TABLE IF NOT EXISTS sync_space (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  current_head_version BIGINT NOT NULL DEFAULT 0,
  tombstone_ttl_days INT NOT NULL DEFAULT 45,
  conflict_retention_days INT NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_device (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES sync_space(id),
  user_id UUID NOT NULL,
  device_fingerprint TEXT NOT NULL,
  client_name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, device_fingerprint)
);

CREATE TABLE IF NOT EXISTS auth_session (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES client_device(id),
  access_jti TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
