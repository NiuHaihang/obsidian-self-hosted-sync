create table if not exists sync_idempotency (
  id uuid primary key,
  space_id uuid not null references sync_space(id),
  client_id uuid not null references client_device(id),
  idempotency_key text not null,
  request_hash text not null,
  response_payload jsonb,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, client_id, idempotency_key)
);
