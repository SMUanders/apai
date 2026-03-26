create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  content text not null,
  created_at timestamptz default now()
);
