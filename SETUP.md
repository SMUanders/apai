# APAI — Setup guide

## Forudsætninger
- Node.js 18+
- En Supabase-konto (gratis)
- En Anthropic API-nøgle

---

## Trin 1 — Supabase

1. Gå til https://supabase.com og opret et nyt projekt
2. Åbn **SQL Editor** i Supabase
3. Indsæt og kør hele indholdet af `schema.sql`
4. Kopiér dine nøgler fra **Settings → API**:
   - Project URL
   - anon public key

---

## Trin 2 — Miljøvariabler

```bash
cp .env.local.example .env.local
```

Udfyld `.env.local` med dine nøgler.

---

## Trin 3 — Kør lokalt

```bash
npm install
npm run dev
```

Åbn http://localhost:3000

---

## Trin 4 — Deploy til Netlify

```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Log ind og deploy
netlify login
netlify init
netlify deploy --prod
```

Tilføj miljøvariablerne i Netlify → Site settings → Environment variables.

---

## Hvad du har nu

- Capture-felt: skriv en rå tanke, tryk ⌘↵
- AI klassificerer automatisk (type + prioritet + kontekst)
- "Vigtigst nu" viser top 3 med prioritet ≥ 4
- Indbakke viser resten
- Marker færdig eller arkiver med ét klik

## Næste trin (V1.1)

- [ ] Taleinput (Whisper API)
- [ ] Daglig brief (morning/shutdown)
- [ ] Kontekstuel visning ("når du går hjem")
