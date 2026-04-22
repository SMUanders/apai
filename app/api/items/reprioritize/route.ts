import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM_PROMPT = `Du er prioriteringsassistent for APAI. Du får inbox-items med id, raw_input, ai_type, ai_priority og created_at.

Returner UDELUKKENDE et JSON-array — alle items inkl. uændrede:
[{"id":"uuid","ai_priority":1-5,"ai_type":"task|note|idea|reminder|someday|none"}]

PRIORITET — kalibrér præcist:
  5 = kritisk, bør gøres i dag
  4 = vigtigt, bør gøres inden for 2-3 dage
  3 = normal — hverken presserende eller uvæsentlig
  2 = kan vente en uge eller mere
  1 = someday, arkiv, lav information

REGLER:
- Item ældre end 7 dage og ikke gjort → sænk prioritet med 1 (max én gang)
- Reminders med konteksttrigger der matcher nu → prioritet 5
- Idéer og someday: aldrig over prioritet 2 medmindre ekstraordinært
- Notes: aldrig over prioritet 2
- Ret ai_type kun hvis raw_input åbenlyst er forkert klassificeret
- Ændr kun prioritet hvis du er sikker — tvivl → behold eksisterende
- Returner ALLE items, også uændrede

Kun JSON-array.`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_type, ai_priority, created_at')
    .eq('status', 'inbox')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ updated: 0, changes: [] })

  const text = await complete(SYSTEM_PROMPT, JSON.stringify(items), 2000, 'gpt-4o', 'openai')
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
