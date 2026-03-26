import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `Du er en prioriteringsassistent. Du får en liste over items med id, raw_input, ai_type, ai_priority og created_at.

Returner KUN gyldig JSON — array af objekter:
[{ "id": "uuid", "ai_priority": 1-5, "ai_type": "task|note|idea|reminder|someday|none" }]

Regler:
- Items der er mere end 7 dage gamle og stadig ikke gjort: sænk prioritet med 1 (de er åbenbart ikke så vigtige)
- Reminders med kontekst der matcher nu: hæv til 5
- Opgaver der ligner noget der burde gøres snart: prioritet 4
- Idéer og someday: max prioritet 2 medmindre de virker ekstraordinære
- Notes: prioritet 1-2
- Vær ikke bange for at ændre ai_type hvis raw_input åbenlyst er forkert klassificeret

Returner alle items — også dem du ikke ændrer.`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_type, ai_priority, created_at')
    .eq('status', 'inbox')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ updated: 0, changes: [] })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(items) }],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()
  const newPriorities: { id: string; ai_priority: number; ai_type: string }[] = JSON.parse(cleaned)

  const changes: { id: string; old_priority: number; new_priority: number }[] = []

  for (const np of newPriorities) {
    const old = items.find((i) => i.id === np.id)
    if (!old) continue
    if (old.ai_priority !== np.ai_priority || old.ai_type !== np.ai_type) {
      await supabase.from('items').update({ ai_priority: np.ai_priority, ai_type: np.ai_type }).eq('id', np.id)
      changes.push({ id: np.id, old_priority: old.ai_priority, new_priority: np.ai_priority })
    }
  }

  return NextResponse.json({ updated: changes.length, changes })
}
