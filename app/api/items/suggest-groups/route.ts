import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM = `Du finder sammenhængende opgaver i en dansk opgaveliste.

Returner UDELUKKENDE et JSON-array:
[{"label":"2-4 ord dansk sagsnavn","item_ids":["id1","id2"],"reasoning":"én sætning"}]

Regler:
- Kun grupper med minimum 2 items der tydeligt tilhører samme projekt/sag
- Vær konservativ: hellere 0 forslag end tvivlsomme
- Ignorer items med group_label
- Max 5 grupper
- Returner [] hvis ingen oplagte grupper

Kun JSON-array.`

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
    const text = await complete(SYSTEM, JSON.stringify(input), 1000, 'gpt-4o', 'openai')
    const suggestions = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
