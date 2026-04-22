import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const OAI_MODEL = 'gpt-4o-mini'
const MAX_ITEMS = 25
const MAX_TOKENS = 600

const SYSTEM = `Analysér en dansk opgaveliste. Returner UDELUKKENDE dette JSON-objekt:
{"duplicates":[{"a_id":"id","b_id":"id","reason":"én dansk sætning"}],"groups":[{"label":"konkret sagsnavn 2-4 ord","item_ids":["id","id"],"reasoning":"én dansk sætning"}]}

DUBLETTER — kun hvis identisk handling med andre ord:
- Samme konkrete ærinde, blot formuleret forskelligt
- Aldrig: samme emne men forskellig handling
- Max 3 par

GRUPPER — kun når items deler ÉT konkret fællestræk:
  Tilladt: samme navngiven person/virksomhed · samme specifikke objekt · samme afgrænsede projekt · samme sted der kræves opsøgt
  Forbudt: begge praktiske · begge private · begge arbejdsrelaterede · løst samme tema
  Test: "Ville en normal person spontant lægge disse i samme navngivne mappe?" Nej → foreslå ikke.
  Sagsnavn: konkret ("Polestar service", "Kontrakt med Mads") — ikke generisk ("Praktiske opgaver")
  Ignorer items med group_label. Max 3 grupper. Tvivl → udelad.

Returner {"duplicates":[],"groups":[]} hvis ingen sikre fund. Kun JSON.`

export async function POST() {
  const t0 = Date.now()

  // Hent kun relevante inbox-items, sorteret efter prioritet
  const { data: allItems, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary, ai_type, ai_priority, group_label')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })
    .limit(80) // overfetch for at have mulighed for at filtrere

  const tDb = Date.now()

  if (error) {
    console.error('[analyze] DB fejl:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!allItems?.length) return NextResponse.json({ duplicates: [], groups: [] })

  // Kun ungrouped items — AI skal ikke foreslå grupper for items der allerede er grupperet
  const items = allItems
    .filter((i) => i.ai_type !== 'none' && !i.group_label)
    .slice(0, MAX_ITEMS)

  const input = items.map((i) => ({
    id: i.id,
    s: (i.ai_summary || i.raw_input).slice(0, 120),
    t: i.ai_type,
  }))

  const tBuild = Date.now()
  console.log(`[analyze] DB: ${tDb - t0}ms | build: ${tBuild - tDb}ms | items: ${items.length}`)

  let text: string
  try {
    text = await complete(SYSTEM, JSON.stringify(input), MAX_TOKENS, OAI_MODEL, 'openai')
  } catch (err) {
    const tAi = Date.now()
    console.error(`[analyze] AI fejlede efter ${tAi - tBuild}ms:`, err)
    return NextResponse.json({ error: 'AI-analyse fejlede — prøv igen' }, { status: 500 })
  }

  const tAi = Date.now()
  console.log(`[analyze] AI: ${tAi - tBuild}ms | total: ${tAi - t0}ms`)

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleaned)

    const itemMap = new Map(items.map((i) => [i.id, i]))
    const duplicates = (result.duplicates ?? [])
      .filter((d: { a_id: string; b_id: string }) => itemMap.has(d.a_id) && itemMap.has(d.b_id))
      .map((d: { a_id: string; b_id: string; reason: string }) => ({
        a: itemMap.get(d.a_id),
        b: itemMap.get(d.b_id),
        reason: d.reason,
        score: 1,
      }))

    const groups = (result.groups ?? []).filter(
      (g: { item_ids: string[] }) => Array.isArray(g.item_ids) && g.item_ids.length >= 2
    )

    console.log(`[analyze] fundet: ${duplicates.length} dubletter, ${groups.length} grupper`)
    return NextResponse.json({ duplicates, groups })
  } catch (err) {
    console.error('[analyze] JSON parse fejlede. Rå svar:', text.slice(0, 300), err)
    return NextResponse.json({ error: 'Kunne ikke parse AI-svar — prøv igen' }, { status: 500 })
  }
}
