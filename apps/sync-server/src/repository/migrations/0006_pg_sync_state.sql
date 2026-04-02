alter table if exists file_operation
  add column if not exists content_b64 text,
  add column if not exists content_encoding text;

create table if not exists sync_snapshot (
  space_id uuid not null references sync_space(id),
  version bigint not null,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (space_id, version)
);

create table if not exists sync_conflict_set (
  conflict_set_id uuid primary key,
  space_id uuid not null references sync_space(id),
  status text not null,
  base_version bigint not null,
  head_version bigint not null,
  items_json jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_sync_conflict_set_space_created
  on sync_conflict_set(space_id, created_at desc);
