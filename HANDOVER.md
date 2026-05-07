# APAI — handover-notat

Skrevet 2026-05-07. Bruges som second-opinion-grundlag når jeg en dag tager projektet op igen, eventuelt fra bunden.

## Hvad er APAI tænkt som

Et personligt AI-drevet **mental aflastningssystem** — ikke en opgaveapp.

Kerneidé: jeg dumper tanker og bekymringer rå ind. Systemet fanger dem, sorterer dem, og sørger for at det rigtige dukker op på det rigtige tidspunkt. Det skal sige *"jeg har den — du behøver ikke holde den i hovedet"*.

Styrende principper (rangordnet efter vigtighed):

1. **Sikkert gemt** — føles som om tanken er fanget, ikke bare registreret
2. **Ikke nu** — kunne skubbe ting ud af fokus uden at miste dem (snooze, someday)
3. **Afventer andre** — waiting-items skal helt ud af aktivt fokus
4. **Kontekstuel visning** — kun det relevante for situationen lige nu
5. **Næste handling** — AI gør uklare tanker konkrete
6. **Saml småting** — relaterede items klumpes til én sag
7. **Skjul støj** — idéer/someday/reference fylder ikke i fokusvisninger
8. **Hurtig lukning** — færdig / ikke vigtigt / snooze i én klik
9. **AI-opdatering via fri tekst** — ikke mange formularfelter
10. **Stilfærdig bekræftelse** — systemet kvitterer, kategoriserer, prioriterer

## Hvad er bygget (status maj 2026)

Stack: Next.js 14 App Router · TypeScript · Supabase Postgres · Tailwind · deployet på Netlify.

### Datamodel
- **Ét bord, `items`**, ingen separate tabeller for tasks/notes/idéer. AI-felt `ai_type` skelner.
- 309 items i databasen pr. eksport: 182 inbox, 69 done, 58 archived.
- Migrationer kørt manuelt i Supabase SQL Editor — ingen automatisk migrationsløber. v2–v8 ligger som filer i repo'et.
- Centrale kolonner: `raw_input`, `ai_type`, `ai_summary`, `ai_context`, `ai_priority` (1–5), `context_trigger`, `status` (inbox/done/archived/backlog), `due_at`, `snoozed_until`, `area` (smu/gca/privat/familie/andet), `group_label`, `user_priority_override`.
- Sekundær tabel `briefs` (v3) til daglige briefings.

### AI-lag
- `lib/ai.ts` abstraherer Anthropic + OpenAI bag samme `complete()`-funktion. Provider styres via `AI_PROVIDER` env.
- **Klassifikation** (`lib/classify.ts`) er låst til OpenAI `gpt-4o-mini` — billigere/hurtigere, og prompt'en er kalibreret mod den. System-prompten er den vigtigste fil i hele projektet: typeregler, prioritetsskala med hårde lofter, area-mapping, due_at-tidszone-håndtering.
- **Briefs/ask/reprioritering** følger `AI_PROVIDER` (default Anthropic Sonnet).
- **Streaming** og **PDF-input** understøttet (PDF altid via Anthropic).

### Frontend
- `app/page.tsx` er én klient-komponent på **~3950 linjer**. Alle views: capture, fokus, inbox, briefing cards, snooze, prioritering, kontekst-filter, AI-analyse, gruppering. **Det er det sted hvor jeg har bygget mig over.**
- `app/settings/page.tsx` — provider-valg, areas, AI-handlinger.
- `app/import/page.tsx` — bulk-import (PDF, tekstliste, Todoist).

### API-endpoints (under `app/api/`)
- `items/` — CRUD, snooze, priority-toggle, gruppe, manuel update, find-duplicates, suggest-groups, reclassify, reprioritize, backlog, history, stats, analyze, backfill-area, context, import (parse/confirm/todoist)
- `brief/{generate,compare}` — daglige briefings, A/B test mellem Claude og GPT
- `ask/` — fri-tekst-spørgsmål til APAI om egne items
- `transcribe/` — Whisper voice-to-text
- `cron/cleanup/` — scheduled oprydning
- `login/` — password-mur via cookie + middleware

### Auth & deploy
- Ingen Supabase Auth. Simpel `apai_auth`-cookie sammenlignes med `SITE_PASSWORD` env i `middleware.ts`.
- Netlify-deploy via `@netlify/plugin-nextjs`. Env vars sættes i Netlify-UI.

### Features tilføjet over 49 commits
Voice input (Web Speech + Whisper fallback) · PWA · mobile-first redesign · password-beskyttelse · context-aware view (morning/work/leaving/evening med 2t TTL i localStorage) · backlog · daily brief · reprioritering · command palette · settings · due_at + filtre + inline søgning · "Ask APAI" · brief read-aloud · afternoon brief · Todoist envejs-import · PDF-import · bulk-listeimport · provider-abstrakt AI-lag · mini-projekter / gruppering · AI sorterings-panel med dublet-detektion + sag-forslag · area-felt SMU/GCA/Privat/Familie · A/B test af modeller i briefing · situationsbaserede briefs · briefing cards · snooze · manuel type-ændring · skjul someday fra aktive visninger · genaktivér fra historik · skærpet prio-logik · simplere mobile cards · manuel "vigtig"-toggle (`user_priority_override`) · filterbar på mobil · "Overblik nu"-panel.

## Hvad var planlagt men ikke bygget

Fra CLAUDE.md som fremtidsspor:

- **Lange captures** — når jeg dumper en lang tekst med flere tanker, skal AI kunne foreslå opdeling i separate items. Først modent når der er flere datapunkter på hvordan jeg faktisk capturer. Byg ikke før.
- **Voice-dump → flere items** — automatisk sætningsanalyse der splitter tale i separate items. Afventer at Web Speech-integrationen stabiliserer sig; Whisper-routen findes allerede.

Indirekte fra principperne men aldrig konkretiseret:

- **Waiting / afventer andre** som førsteklasses status. Listet som prioritet 2 i mental-aflastningsfunktionerne, men jeg har aldrig bygget en dedikeret waiting-flow. Der er ingen `waiting`-status i `item_status`-enum'en, kun `inbox/done/archived/backlog`. Et waiting-item lever i dag som en almindelig task med snooze.
- **Event** som type. Listed i CLAUDE.md som MVP-objekt sammen med task/project/note/waiting, men `item_type`-enum'en har kun task/note/idea/reminder/someday/none. Aldrig bygget.
- **Project** som entitet. Mini-projekter findes nu kun som `group_label` på items — ikke som selvstændigt objekt med egne attributter.

## Hvad fungerer ikke længere — ærlig vurdering

Jeg har bygget mig over. Konkrete tegn:

- `app/page.tsx` er ~3950 linjer i én komponent. Det er passeret det punkt hvor man kan holde overblikket.
- 49 commits over forholdsvis kort tid hvor mange senere commits modarbejder eller justerer tidligere features (flere "fix"-commits, flere "skærp prio-logik", mobiloplevelse-pendlede frem og tilbage).
- Featurespredning: PWA, voice, PDF-import, Todoist-import, A/B test, command palette, briefs, ask, mini-projekter — alt er bygget før kerneflowet (capture → klassifikation → kontekstuel visning → ro) føltes solidt.
- Jeg ved ikke selv længere helt præcist hvad der er i stykker. Det i sig selv er signalet.

## Hvis jeg skulle starte forfra — anbefaling til mig selv / til en second opinion

**Start meget mindre.** Hold kun fast på det der direkte tjener mental aflastning, lad alt andet vente.

Kerne-MVP der dækker principperne:

1. **Capture** — én rå tekst-input. Stemme er nice, men ikke før tekst-flowet er roligt.
2. **AI-klassifikation** — type + prioritet + summary + område. Det er den hidtidige `lib/classify.ts`-prompt der er det mest værdifulde stykke arbejde i hele projektet — bevar den, eller start derfra.
3. **Tre views, ikke flere**: *Nu* (få vigtige ting til lige nu), *Indbakke* (resten), *Skjult* (snoozed/someday/done — én samlet "ude af syne"-bunke).
4. **Snooze + done + arkivér** som de tre handlinger pr. item. Ikke mere.
5. **Waiting** som førsteklasses status fra dag ét hvis det stadig føles vigtigt.

Lad være med før kernen er rolig:

- Mini-projekter / gruppering
- A/B test af modeller
- Briefs (det er en separat feature, ikke kernen)
- Command palette
- PDF/Todoist-import
- Mange forskellige kontekst-filtre
- Ask APAI

Tekniske valg jeg ville bevare:
- **Ét items-bord** med AI-klassifikation. Det var et godt valg.
- **OpenAI gpt-4o-mini til klassifikation**, Anthropic til længere ting. Pragmatisk og billigt.
- **Supabase Postgres**. Holder fint til personlig brug.
- **Password-cookie i stedet for Supabase Auth**. Personligt værktøj, ikke værd at bygge auth.

Tekniske valg jeg ville lave om:
- **Splitte `app/page.tsx` op fra dag ét**. Maks ~300 linjer pr. komponent.
- **Mindre frontend, mere ren server-state**. Færre localStorage-overrides, færre lokale filtre.
- **Færre migration-filer der køres manuelt**. Enten ordentlig migrationsløber eller hold skemaet helt fastfrosset i V1.
- **Skriv aldrig en feature før det forrige flow føles roligt i en uge.** Det her er jeg dårlig til.

## Nyttige filer/peg ind hvis jeg åbner det igen

- `CLAUDE.md` — principper og arkitektur
- `lib/classify.ts` — AI klassifikations-prompt (det vigtigste artefakt)
- `lib/ai.ts` — provider-abstraktion
- `schema.sql` + `migration_v2.sql`–`migration_v8.sql` — schema-evolution
- `app/api/items/route.ts` — capture-flow (POST) og inbox-query (GET)
- `apai-export.json` / `apai-export.md` — fuld dataeksport pr. 2026-05-07

## Spørgsmål jeg gerne vil stille en second opinion

1. Var det rigtigt at samle alt i ét items-bord, eller skal task/project/event/waiting være separate?
2. Skal AI-klassifikation være forrest, eller skal jeg klassificere ved review (færre AI-kald, mere menneske-kontrol)?
3. Er "kontekstuel visning" (morning/work/leaving/evening) det rigtige niveau af smartness, eller er det overengineering for en personlig app?
4. Hvor stor del af mine 309 items har jeg faktisk taget action på vs. bare ladet ligge? Det er det rigtige succes-mål — ikke antal features.
5. Hvis jeg kun måtte have 3 features, hvilke? (Mit eget gæt: capture + AI-klassifikation + snooze.)
