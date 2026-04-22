import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM = `Du er en assistent der finder sammenhængende opgaver i en opgaveliste.

Du får en liste af items. Find items der naturligt hører til samme sag, projekt eller tema.

Returner KUN gyldig JSON — array af forslag:
[{
  "label": "kort sagsnavn (2-5 ord, dansk)",
  "item_ids": ["id1", "id2"],
  "reasoning": "én sætning på dansk"
}]

Regler:
- Foreslå kun grupper med mindst 2 items
- Vær konservativ — hellere færre grupper end mange
- Ignorer items der allerede har group_label
- Max 6 grupper
- Returner tom array [] hvis ingen oplagte grupper`

export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary, ai_type, group_label')
    .eq('status', 'inbox')
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ suggestions: [] })

  const ungrouped = items.filter((i) => !i.group_label)
  if (ungrouped.length < 2) return NextResponse.json({ suggestions: [] })

  const input = ungrouped
    .map((i) => ({ id: i.id, summary: i.ai_summary || i.raw_input, type: i.ai_type }))

  try {
    const text = await complete(SYSTEM, JSON.stringify(input), 1000)
    const suggestions = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
