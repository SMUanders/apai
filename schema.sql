-- APAI V1 Schema
-- Kør dette i Supabase SQL Editor

create extension if not exists "pgcrypto";

create type item_type as enum ('task', 'note', 'idea', 'reminder', 'someday', 'none');
create type item_status as enum ('inbox', 'done', 'archived');

create table items (
  id uuid primary key default gen_random_uuid(),
  raw_input text not null,
  ai_type item_type default 'none',
  ai_summary text,
  ai_context text,
  ai_priority int default 3 check (ai_priority between 1 and 5),
  status item_status default 'inbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-opdater updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

-- Index til hurtig hentning af inbox
create index items_status_priority_idx on items(status, ai_priority desc, created_at desc);
