-- Migration v6: area-felt til SMU / GCA / Privat / Familie
-- Kør i Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

alter table items add column if not exists area text default 'andet';
create index if not exists items_area_idx on items(area) where area is not null;
