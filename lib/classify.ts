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

const SYSTEM_PROMPT = `Du er en klassificeringsmotor for et personligt hukommelsessystem kaldet APAI.

Brugeren sender rå, ufiltrerede tanker. Din opgave er at klassificere og kortfatte dem.

Returner KUN gyldig JSON — ingen forklaring, ingen markdown.

JSON-format:
{
  "type": "task" | "note" | "idea" | "reminder" | "someday" | "none",
  "summary": "kort omskrivning på dansk (max 10 ord)",
  "context": "hvornår/hvor relevant, fx 'når du kommer hjem' — eller null",
  "context_trigger": "home" | "work" | "leaving" | "morning" | "evening" | "anytime" | null,
  "priority": 1-5,
  "due_at": "ISO 8601 timestamp hvis teksten nævner en konkret dato eller tid — ellers null. Brug referencedatoen til at beregne relative udtryk som 'på lørdag', 'kl 14', 'i morgen tidlig', 'om 3 dage', 'næste uge'. Returner altid UTC.",
  "confident": true/false,
  "area": "smu" | "gca" | "privat" | "familie" | "andet"
}

Typedefinitioner:
- task: kræver handling snart
- reminder: skal huskes på et bestemt tidspunkt/sted
- idea: god idé, ingen handling endnu
- note: information der skal gemmes
- someday: måske en dag, ikke nu
- none: kræver ingen handling

area-regler:
- "smu"     → vedrører Signmeup / SMU (arbejde, kunder, servere, kode, APAI-udvikling)
- "gca"     → vedrører Grand Champion Arcade / GCA (spillemaskiner, lokaler, drift)
- "privat"  → personligt (helbred, bil, hjem, økonomi, fritid, indkøb)
- "familie" → relateret til familiemedlemmer (børn, partner, forældre)
- "andet"   → uklart, neutralt eller blandet — vælg denne ved tvivl

confident:
- true  → klar klassifikation, input var tydeligt
- false → tvetydigt input, usikker type eller prioritet

context_trigger regler:
- "home"     → noget der skal gøres/huskes hjemme
- "work"     → noget der skal gøres/huskes på arbejde
- "leaving"  → noget der skal huskes når man forlader et sted
- "morning"  → relevant om morgenen
- "evening"  → relevant om aftenen / på vej hjem
- "anytime"  → ingen specifik kontekst
- null       → ved ikke / irrelevant

Prioritet:
- 5 = glem det ikke, gør det snart
- 4 = vigtigt men ikke akut
- 3 = neutral
- 2 = kan vente
- 1 = someday/arkiv

Vær kort. Vær præcis. Kun JSON.`

export async function classifyInput(rawInput: string): Promise<Classification> {
  const referenceDate = new Date().toISOString()
  const text = await complete(
    SYSTEM_PROMPT,
    `[Referencedato: ${referenceDate}]\n\n${rawInput}`,
    450
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
