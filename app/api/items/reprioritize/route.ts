import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM_PROMPT = `Du er prioriteringsassistent for APAI. Du får inbox-items med id, s (kort tekst), ai_type, ai_priority og evt. due.

Returner KUN items der skal ændres — tom array [] hvis ingen ændringer:
[{"id":"uuid","ai_priority":1-5,"ai_type":"task|note|idea|reminder|someday|none"}]

PRIORITETSSKALA — 3 er standard. 4 og 5 er undtagelser:
  5 = skal ske i dag/i morgen · deadline inden for 24-48 timer · blokerer noget vigtigt · eksplicit hast
  4 = konkret deadline inden for 7 dage · kalender- eller aftalebundet
  3 = STANDARD — almindelig ting der skal gøres når der er tid · ingen deadline · ingen særlig hast
  2 = kan roligt vente
  1 = ren reference / someday — ingen reel handling

HÅRDE LOFTER:
  - type=task UDEN due → max 3
  - type=note → max 2
  - type=idea → max 3
  - type=someday → max 1
  - type=none → 1
  - Almindelige hverdagsopgaver (ringe, købe, svare, tjekke, booke) uden tidsmarkør = 3, ikke højere

REGLER:
- Alder alene er IKKE grund til at ændre prioritet
- Ret ai_type kun hvis åbenlyst forkert
- Tvivl mellem 3 og 4 → vælg 3. Tvivl i øvrigt → udelad item (behold eksisterende)

Output: kun JSON-array, ingen tekst, ingen markdown.`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_type, ai_priority, due_at, user_priority_override')
    .eq('status', 'inbox')
    .or('user_priority_override.is.null,user_priority_override.eq.false')
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ updated: 0, changes: [] })

  // Byg kompakt input: truncate tekst, send kun det nødvendige
  const input = items.map((i) => ({
    id: i.id,
    s: (i.raw_input ?? '').slice(0, 80),
    ai_type: i.ai_type,
    ai_priority: i.ai_priority,
    due: i.due_at ? i.due_at.slice(0, 10) : null,
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
