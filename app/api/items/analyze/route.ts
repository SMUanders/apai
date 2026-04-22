import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM = `Du er en assistent der analyserer en personlig opgaveliste på dansk.

Du får en JSON-liste af items med felterne: id, summary, type, priority.

Din opgave er at finde:

1. DUBLETTER: Items der handler om DET SAMME — selvom de bruger helt forskellige ord.
   Eksempler på dubletter:
   - "Ring til tandlæge" og "Book tandlægeaftale" → handler begge om tandlæge
   - "Hent pakke på posthuset" og "Pakkeboks skal tømmes" → samme handling
   - "Fix login-fejl" og "Login er ødelagt på mobil" → samme problem
   Vær meget konservativ. Foreslå IKKE dublet hvis du er i tvivl.

2. GRUPPER (mini-projekter): Items der naturligt hører til SAMME sag eller tema.
   Grupper skal have et meningsfuldt fælles formål — ikke bare samme ordforråd.
   Ignorer items der allerede har group_label sat.

Returner KUN gyldig JSON uden markdown:
{
  "duplicates": [
    { "a_id": "uuid", "b_id": "uuid", "reason": "én sætning på dansk" }
  ],
  "groups": [
    { "label": "kort sagsnavn 2-5 ord", "item_ids": ["uuid", "uuid"], "reasoning": "én sætning" }
  ]
}

Regler:
- Max 4 dubletpar, max 6 grupper
- Grupper kræver mindst 2 items
- Tomme arrays [] er acceptable svar
- Svar KUN med JSON — ingen forklaring, ingen markdown`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary, ai_type, ai_priority, group_label')
    .eq('status', 'inbox')
    .limit(120)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ duplicates: [], groups: [] })

  const input = items.map((i) => ({
    id: i.id,
    summary: i.ai_summary || i.raw_input,
    type: i.ai_type,
    priority: i.ai_priority,
    ...(i.group_label ? { group_label: i.group_label } : {}),
  }))

  let text: string
  try {
    text = await complete(SYSTEM, JSON.stringify(input), 1500)
  } catch (err) {
    console.error('[analyze] AI kald fejlede:', err)
    return NextResponse.json({ error: 'AI-analyse fejlede — prøv igen' }, { status: 500 })
  }

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
      (g: { item_ids: string[] }) => g.item_ids?.length >= 2
    )

    return NextResponse.json({ duplicates, groups })
  } catch (err) {
    console.error('[analyze] JSON parse fejlede:', err, '\nRå svar:', text)
    return NextResponse.json({ error: 'Kunne ikke parse AI-svar' }, { status: 500 })
  }
}
