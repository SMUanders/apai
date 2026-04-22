-- APAI V1 Schema
-- Kør dette i Supabase SQL Editor

create extension if not exists "pgcrypto";

create type item_type as enum ('task', 'note', 'idea', 'reminder', 'someday', 'none');
create type item_status as enum ('inbox', 'done', 'archived', 'backlog');
create type context_trigger as enum ('home', 'work', 'leaving', 'morning', 'evening', 'anytime');

create table items (
  id uuid primary key default gen_random_uuid(),
  raw_input text not null,
  ai_type item_type default 'none',
  ai_summary text,
  ai_context text,
  context_trigger context_trigger,
  ai_priority int default 3 check (ai_priority between 1 and 5),
  status item_status default 'inbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table items enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table items to anon, authenticated;

drop policy if exists "items_select_all" on items;
drop policy if exists "items_insert_all" on items;
drop policy if exists "items_update_all" on items;

create policy "items_select_all"
  on items for select
  to anon, authenticated
  using (true);

create policy "items_insert_all"
  on items for insert
  to anon, authenticated
  with check (true);

create policy "items_update_all"
  on items for update
  to anon, authenticated
  using (true)
  with check (true);

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
