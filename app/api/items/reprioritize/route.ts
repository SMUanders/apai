import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM_PROMPT = `Du er prioriteringsassistent for APAI. Du får inbox-items med id, s (kort tekst), ai_type og ai_priority.

Returner KUN items der skal ændres — tom array [] hvis ingen ændringer:
[{"id":"uuid","ai_priority":1-5,"ai_type":"task|note|idea|reminder|someday|none"}]

PRIORITETSSKALA:
  5 = skal handles i dag — let at glemme, blokerer noget, stærkt kontekstbundet eller tidsnært
  4 = bør handles snart — høj praktisk nytte, reducerer mental støj, relevant i nær fremtid
  3 = normal vigtig ting — relevant men ikke presserende
  2 = kan vente — lavere aktuel relevans, ingen konsekvens hvis det venter
  1 = reference, someday/maybe, ingen reel handling nu

OPVÆGT: let at glemme · blokerer andet · tidsnært · fjerner mental støj hurtigt · specifik konteksttrigger
NEDVÆGT: diffust projekt · ren idé · ingen konkret næste skridt · "engang"-tanke

REGLER:
- Alder alene er IKKE grund til at ændre prioritet
- Idéer og someday: aldrig over prioritet 3
- Notes og referencer: aldrig over prioritet 2
- Ret ai_type kun hvis åbenlyst forkert
- Tvivl → udelad item fra output (behold eksisterende)

Output: kun JSON-array, ingen tekst, ingen markdown.`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_type, ai_priority')
    .eq('status', 'inbox')
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ updated: 0, changes: [] })

  // Byg kompakt input: truncate tekst, send kun det nødvendige
  const input = items.map((i) => ({
    id: i.id,
    s: (i.raw_input ?? '').slice(0, 80),
    ai_type: i.ai_type,
    ai_priority: i.ai_priority,
  }))

  console.log(`[reprioritize] ${items.length} items sendt til AI`)

  let text: string
  try {
    text = await complete(SYSTEM_PROMPT, JSON.stringify(input), 3000, 'gpt-4o', 'openai')
  } catch (err) {
    console.error('[reprioritize] AI-kald fejlede:', err)
    return NextResponse.json({ error: 'AI-kald fejlede — prøv igen' }, { status: 500 })
  }

  console.log('[reprioritize] rå AI-output:', text.slice(0, 500))

  const cleaned = text.replace(/```json|```/g, '').trim()

  if (!cleaned || cleaned === '[]') {
    return NextResponse.json({ updated: 0, changes: [] })
  }

  let newPriorities: { id: string; ai_priority: number; ai_type: string }[]
  try {
    newPriorities = JSON.parse(cleaned)
    if (!Array.isArray(newPriorities)) throw new Error('Ikke et array')
  } catch (parseErr) {
    console.error('[reprioritize] JSON parse fejl. Rå output:', text.slice(0, 800), parseErr)
    return NextResponse.json(
      { error: 'AI returnerede ugyldigt format — prøv igen' },
      { status: 500 }
    )
  }

  const itemMap = new Map(items.map((i) => [i.id, i]))
  const changes: { id: string; old_priority: number; new_priority: number }[] = []

  for (const np of newPriorities) {
    const old = itemMap.get(np.id)
    if (!old) continue
    if (old.ai_priority !== np.ai_priority || old.ai_type !== np.ai_type) {
      const { error: updateErr } = await supabase
        .from('items')
        .update({ ai_priority: np.ai_priority, ai_type: np.ai_type })
        .eq('id', np.id)
      if (!updateErr) {
        changes.push({ id: np.id, old_priority: old.ai_priority, new_priority: np.ai_priority })
      }
    }
  }

  console.log(`[reprioritize] ${changes.length} items opdateret`)
  return NextResponse.json({ updated: changes.length, changes })
}
