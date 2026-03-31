create index if not exists idx_sync_commit_space_version_desc
  on sync_commit(space_id, version desc);

create index if not exists idx_file_entry_space_path
  on file_entry(space_id, path);

create index if not exists idx_conflict_record_space_set
  on conflict_record(space_id, conflict_set_id);

create index if not exists idx_conflict_record_status_created
  on conflict_record(space_id, resolution_strategy, created_at desc);

create index if not exists idx_sync_audit_log_space_created
  on sync_audit_log(space_id, created_at desc);

create index if not exists idx_tombstone_space_expires
  on tombstone(space_id, expires_at)
  where purged_at is null;

create index if not exists idx_sync_idempotency_created
  on sync_idempotency(created_at desc);
