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

## Teknisk default

Next.js · TypeScript · Supabase Postgres · Tailwind

## Arbejdsstil

- Svar på dansk
- Vær kort
- Ét skridt ad gangen
- Tag default-valg selv
- Stop kun ved reel blocker
