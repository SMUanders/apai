import { NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM = `Du finder items der hører til præcis samme sag i en dansk opgaveliste.

Returner KUN JSON-array — [] hvis ingen sikre fund:
[{"label":"konkret sagsnavn 2-4 ord","item_ids":["id1","id2"],"reasoning":"én sætning"}]

EN SAG kræver at items deler ÉT af disse:
  - samme konkrete objekt (bestemt bil, maskine, dokument, kontrakt)
  - samme navngiven person eller virksomhed
  - samme afgrænsede projekt med et navn
  - samme fysiske sted der kræver opsøgning
  - samme specifikke ærinde der naturligt løses på én gang

FORESLÅ ALDRIG sag blot fordi items:
  - begge er praktiske, private eller administrative
  - begge handler om "arbejde", "hjem" eller "bil" generelt
  - emnemæssigt minder om hinanden uden fælles konkret handling
  - er løst beslægtede temaer

TEST: "Ville en normal person spontant lægge disse i samme navngivne mappe?" Nej → returner ikke forslaget.

SAGSNAVN — konkret og menneskelig:
  Godt: "Polestar service", "Kontrakt med Mads", "Sommerhus april"
  Dårligt: "Praktiske opgaver", "Arbejdsrelateret", "Bil og transport"

Ignorer items med group_label. Max 3 forslag. Tvivl → udelad. Kun JSON-array.`

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
