import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM_PROMPT = `Du er prioriteringsassistent for APAI. Du får inbox-items med id, raw_input, ai_type, ai_priority og created_at.

Returner UDELUKKENDE et JSON-array — alle items inkl. uændrede:
[{"id":"uuid","ai_priority":1-5,"ai_type":"task|note|idea|reminder|someday|none"}]

PRIORITETSSKALA:
  5 = skal handles i dag — let at glemme, blokerer noget, stærkt kontekstbundet eller tidsnært
  4 = bør handles snart — høj praktisk nytte, reducerer mental støj, relevant i nær fremtid
  3 = normal vigtig ting — relevant men ikke presserende
  2 = kan vente — lavere aktuel relevans, ingen konsekvens hvis det venter
  1 = reference, someday/maybe, ingen reel handling nu

OPVÆGT — disse signaler trækker op:
  + let at glemme (kontekstbundet, tidsbegrænset, stedsrelateret)
  + blokerer andet
  + skal ske snart af praktiske grunde
  + fjerner mental støj hurtigt når det er gjort
  + reminder med specifik konteksttrigger

NEDVÆGT — disse signaler trækker ned:
  - diffust projekt uden konkret næste skridt
  - ren idé uden beslutning
  - ingen tydelig handling
  - bred kategori eller "engang"-tanke

REGLER:
- Alder alene er IKKE grund til at ændre prioritet — nedvægt kun hvis tingen åbenlyst er overstået eller irrelevant
- Idéer og someday: aldrig over prioritet 3
- Notes og referencer: aldrig over prioritet 2
- Ret ai_type kun hvis raw_input åbenlyst er forkert klassificeret
- Tvivl → behold eksisterende prioritet
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
