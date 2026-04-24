# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# APAI

APAI er et personligt AI-drevet mental aflastningssystem — ikke en opgaveapp.

Kerneidé: Brugeren dumper tanker og bekymringer. APAI fanger dem, sorterer dem og sørger for at de rigtige ting vises på det rigtige tidspunkt. Systemet skal signalere: "jeg har den — du behøver ikke holde den i hovedet."

## Mental aflastning — styrende principper

Disse principper er overordnede og skal vejlede alle designbeslutninger:

- **Sikkert gemt**: brugeren skal føle tanken er fanget, ikke bare registreret
- **Ikke nu**: ting skal kunne skubbes ud af fokus uden at forsvinde (snooze, someday)
- **Afventer andre**: waiting-items skal ud af aktivt fokus
- **Kontekstuel visning**: vis kun det relevante i den aktuelle situation
- **Næste handling**: AI gør uklare tanker konkrete og handlingsrettede
- **Saml småting**: relaterede items samles til én sag
- **Skjul støj**: idéer, someday og reference fylder ikke i fokusvisninger
- **Hurtig lukning**: færdig / ikke vigtigt / snooze — én handling
- **AI-opdatering via fri tekst**: brugeren skal ikke redigere mange felter manuelt
- **Systemet siger "jeg har den"**: bekræft, kategorisér, prioritér — stilfærdigt

### Prioriterede mental-aflastningsfunktioner (høj → lav)
1. Snooze / påmind mig senere
2. Waiting / afventer andre
3. Kontekst-visning (situation, tid, sted)
4. AI-opdatering via fri tekst
5. Støjreduktion i fokusvisninger

## Produktregler

- Brugeren vælger ikke kategori ved capture — AI klassificerer
- Input kommer ind råt
- V1 er simpel og robust — ingen overengineering
- Fokus: capture → klassifikation → næste handling → kontekstuel visning

## MVP-objekter

task, project, note, waiting, event

## Fremtidsspor (ikke bygget)

- **Lange captures**: når brugeren dumper en lang tekst med flere tanker, bør AI kunne foreslå opdeling i separate items. Først modent når vi har flere datapunkter på hvordan brugeren faktisk captureer — byg ikke før det.
- **Voice-dump**: automatisk tale → flere separate items efter sæt­ningsanalyse. Afventer Web Speech-integrationen stabiliserer sig; Whisper-routen findes allerede.

## Teknisk default

Next.js · TypeScript · Supabase Postgres · Tailwind

## Arbejdsstil

- Svar på dansk
- Vær kort
- Ét skridt ad gangen
- Tag default-valg selv
- Stop kun ved reel blocker

## Kommandoer

```bash
npm run dev     # Next.js dev på localhost:3000
npm run build   # production build
npm run start   # kør production build
```

Ingen test- eller lint-scripts findes. Typecheck sker implicit via `next build`.

## Arkitektur

Monolitisk Next.js 14 App Router-app med ét Supabase Postgres-bagend og dobbelt AI-provider-lag.

### Datamodel — ét bord, alt i `items`
Al mental belastning lever i en enkelt `items`-tabel (`schema.sql` + migrations v2–v7). Intet separat bord for tasks/notes/ideas — `ai_type` skelner. Kolonner tilføjes altid via nye `migration_vN.sql`-filer der køres manuelt i Supabase SQL Editor (ingen automatiseret migrationsløber). Centrale kolonner: `raw_input`, `ai_type`, `ai_summary`, `ai_context`, `ai_priority` (1-5), `context_trigger`, `status` (inbox/done/archived/backlog), `due_at`, `snoozed_until`, `area` (smu/gca/privat/familie/andet).

Typerne `ItemType`, `ItemStatus`, `ContextTrigger`, `AreaType` er defineret i `lib/supabase.ts` og skal holdes synkrone med SQL-enums og migration-tilføjelser.

### AI-lag — to providere, forskellige jobs
`lib/ai.ts` er et tyndt abstraktionslag over både Anthropic og OpenAI SDK'er. Providere vælges via `AI_PROVIDER` env (default `anthropic`), men specifikke call sites kan tilsidesætte per-kald.

- **Klassifikation** (`lib/classify.ts`): tvunget til `gpt-4o-mini` via OpenAI, uanset `AI_PROVIDER`. Returnerer JSON med type/summary/priority/due_at/area/confident. System-prompten er kilde til sandhed for kalibrering af priority og area — rør den med omtanke.
- **Andre opgaver** (briefs, ask, reprioritering, gruppeforslag osv.): går via `complete()` og følger `AI_PROVIDER`. Anthropic default er `claude-sonnet-4-6`.
- **PDF-input**: `completeWithPDF()` er altid Anthropic (document content type).
- **Streaming**: `completeStream()` understøtter begge providere og giver både en `ReadableStream` og en `fullText` promise.

### Supabase-klienter
To klienter — vælg altid den rigtige:
- `lib/supabase.ts` → browser/anon-klient (RLS-governed; schema.sql åbner aktuelt policies for anon)
- `lib/supabase-server.ts` → `supabaseAdmin` med service role key; kun for `app/api/*` route handlers

API-routes under `app/api/items/**` importerer konsekvent `supabaseAdmin`.

### Auth
Ingen Supabase Auth. `middleware.ts` sammenligner en `apai_auth`-cookie mod `SITE_PASSWORD` env. Login sker via `/login` → `app/api/login/route.ts`. Hvis `SITE_PASSWORD` ikke er sat, er middleware no-op. Alt beskyttes undtagen `/login`, `/api/login` og statiske assets.

### Frontend
- `app/page.tsx` er én stor klient-komponent (~3000 linjer) med alle views: capture, fokus, inbox, briefing cards, snooze, prioritering, kontekstuel filtrering.
- `app/settings/page.tsx` styrer AI-provider-valg, areas og andre præferencer.
- `app/import/page.tsx` bulk-import af tanker.
- Kontekst-override (morning/work/leaving/evening) gemmes i `localStorage` med 2t TTL — se `lib/context.ts`.

### API-overflade
`app/api/items/` eksponerer: GET/POST `/items`, `[id]` (PATCH/DELETE), `[id]/snooze`, `[id]/priority`, `[id]/group`, `[id]/update`, `analyze`, `backfill-area`, `backlog`, `context`, `find-duplicates`, `history`, `import`, `reclassify`, `reprioritize`, `stats`, `suggest-groups`. Øvrige: `/api/brief/{generate,compare}`, `/api/ask`, `/api/transcribe` (Whisper), `/api/cron/cleanup`.

Inbox-query (GET `/api/items`) skjuler snoozed items: `status='inbox' AND (snoozed_until IS NULL OR snoozed_until < now())`, sorteret på priority desc, created_at desc. Capture-flow (POST `/api/items`) laver duplikat-tjek (ord-overlap >0.8 blandt seneste 50 inbox-items) medmindre `force: true` sendes.

### Deploy
Netlify med `@netlify/plugin-nextjs` (`netlify.toml`). Env vars skal sættes i Netlify-UI'et — se `.env.local.example` for listen (Supabase URL/anon key, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_PASSWORD`, valgfri `AI_PROVIDER`/`AI_MODEL`).
