import Anthropic from '@anthropic-ai/sdk'
import { ItemType, ContextTrigger } from './supabase'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface Classification {
  type: ItemType
  summary: string
  context: string | null
  context_trigger: ContextTrigger | null
  priority: number
  due_at: string | null
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
  "due_at": "ISO 8601 timestamp hvis teksten nævner en konkret dato eller tid — ellers null. Brug referencedatoen til at beregne relative udtryk som 'på lørdag', 'kl 14', 'i morgen tidlig', 'om 3 dage', 'næste uge'. Hvis kun tidspunkt er nævnt uden dato, brug referencedatoen. Returner altid UTC."
}

Typedefinitioner:
- task: kræver handling snart
- reminder: skal huskes på et bestemt tidspunkt/sted
- idea: god idé, ingen handling endnu
- note: information der skal gemmes
- someday: måske en dag, ikke nu
- none: kræver ingen handling

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

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `[Referencedato: ${referenceDate}]\n\n${rawInput}` }],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  return {
    type: parsed.type as ItemType,
    summary: parsed.summary,
    context: parsed.context || null,
    context_trigger: parsed.context_trigger || null,
    priority: Number(parsed.priority),
    due_at: parsed.due_at || null,
  }
}
