import { complete } from './ai'
import { ItemType, ContextTrigger, AreaType } from './supabase'

export interface Classification {
  type: ItemType
  summary: string
  context: string | null
  context_trigger: ContextTrigger | null
  priority: number
  due_at: string | null
  confident: boolean
  area: AreaType
}

const SYSTEM_PROMPT = `Du er klassificeringsmotor for APAI, et personligt hukommelsessystem.
Input er rå danske tanker. Returner UDELUKKENDE et JSON-objekt — ingen tekst, ingen markdown.

{
  "type": "task" | "note" | "idea" | "reminder" | "someday" | "none",
  "summary": "aktiv sætning på dansk, max 10 ord — skriv hvad der skal gøres/huskes",
  "context": "kontekstsætning fx 'når du er hjemme' — eller null",
  "context_trigger": "home" | "work" | "leaving" | "morning" | "evening" | "anytime" | null,
  "priority": 1-5,
  "due_at": "ISO 8601 UTC — eller null. Regler: konverter lokal tid til UTC via offset i referencetidspunktet. Ingen tid nævnt → T00:00:00Z. 'næste uge' → mandag T00:00:00Z. 'på onsdag' → kommende onsdag. Vagt tidsprog som 'snart'/'når jeg' → null.",
  "confident": true | false,
  "area": "smu" | "gca" | "privat" | "familie" | "andet"
}

TYPE — vælg det skarpeste match:
  task      = kræver en konkret handling inden for dage
  reminder  = skal huskes på bestemt tid eller sted
  idea      = mulig fremtidig handling, ingen beslutning endnu
  note      = information der skal gemmes, ingen handling
  someday   = måske en dag — ikke akut, ikke besluttet
  none      = registrering, kvittering, ingen handling nødvendig

PRIORITY — kalibrer præcist:
  5 = kritisk, glem ikke, bør gøres i dag eller er forfaldet
  4 = vigtigt, bør gøres inden for 2-3 dage
  3 = normal — hverken presserende eller uvæsentlig
  2 = kan let vente en uge eller mere
  1 = someday, arkiv, lav information

AREA:
  smu     → Signmeup / SMU: arbejde, kunder, kode, servere, APAI-udvikling
  gca     → Grand Champion Arcade: spillemaskiner, lokaler, drift
  privat  → personligt: helbred, bil, hjem, økonomi, fritid, indkøb
  familie → familiemedlemmer: børn, partner, forældre, skole
  andet   → uklart, blandet eller neutrale noter — brug ved tvivl

CONTEXT_TRIGGER — kun sæt hvis tydeligt:
  home, work, leaving, morning, evening, anytime, null

confident = false hvis input er tvetydigt, type er svær at afgøre, eller prioritet er usikker.

Returner kun JSON-objektet.`

function copenhagenRef(now: Date): string {
  const localStr = now.toLocaleDateString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    hour: '2-digit', minute: '2-digit',
  })
  const offsetPart =
    new Intl.DateTimeFormat('en', { timeZone: 'Europe/Copenhagen', timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2'
  return `${localStr} kl. ${timeStr} (${offsetPart})`
}

export async function classifyInput(rawInput: string): Promise<Classification> {
  const ref = copenhagenRef(new Date())
  const text = await complete(
    SYSTEM_PROMPT,
    `[Referencetidspunkt: ${ref}]\n\n${rawInput}`,
    450,
    'gpt-4o-mini',
    'openai'
  )

  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  return {
    type: parsed.type as ItemType,
    summary: parsed.summary,
    context: parsed.context || null,
    context_trigger: parsed.context_trigger || null,
    priority: Number(parsed.priority),
    due_at: parsed.due_at || null,
    confident: parsed.confident !== false,
    area: (parsed.area as AreaType) || 'andet',
  }
}
