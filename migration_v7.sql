-- Migration v7: snoozed_until til item-snooze
-- Kør i Supabase SQL Editor

alter table items add column if not exists snoozed_until timestamptz;
create index if not exists items_snoozed_idx on items(snoozed_until) where snoozed_until is not null;
