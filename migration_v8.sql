-- Migration v8: user_priority_override — brugerens manuelle vigtigmarkering
-- AI må ikke overskrive denne. Toggles via /api/items/[id]/priority { important: true|false }.
-- Kør i Supabase SQL Editor.

alter table items add column if not exists user_priority_override boolean default false;
create index if not exists items_user_priority_override_idx
  on items(user_priority_override)
  where user_priority_override = true;
