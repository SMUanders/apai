import Anthropic from '@anthropic-ai/sdk'
import { ItemType } from './supabase'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface Classification {
  type: ItemType
  summary: string
  context: string | null
  priority: number
}

const SYSTEM_PROMPT = `Du er en klassificeringsmotor for et personligt hukommelsessystem kaldet APAI.

Brugeren sender rå, ufiltrerede tanker. Din opgave er at klassificere og kortfatte dem.

Returner KUN gyldig JSON — ingen forklaring, ingen markdown.

JSON-format:
{
  "type": "task" | "note" | "idea" | "reminder" | "someday" | "none",
  "summary": "kort omskrivning på dansk (max 10 ord)",
  "context": "hvornår/hvor relevant, fx 'når du kommer hjem' — eller null",
  "priority": 1-5
}

Typedefinitioner:
- task: kræver handling snart
- reminder: skal huskes på et bestemt tidspunkt/sted
- idea: god idé, ingen handling endnu
- note: information der skal gemmes
- someday: måske en dag, ikke nu
- none: kræver ingen handling

Prioritet:
- 5 = glem det ikke, gør det snart
- 4 = vigtigt men ikke akut
- 3 = neutral
- 2 = kan vente
- 1 = someday/arkiv

Vær kort. Vær præcis. Kun JSON.`

export async function classifyInput(rawInput: string): Promise<Classification> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawInput }],
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
    priority: Number(parsed.priority),
  }
}
