-- Migration v5: group_label for mini-projekter / samlede sager
-- Kør i Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

alter table items add column if not exists due_at timestamptz;
alter table items add column if not exists group_label text;
create index if not exists items_group_label_idx on items(group_label) where group_label is not null;
