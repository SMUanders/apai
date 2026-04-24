import { NextRequest, NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

interface SituationConfig {
  areas: string[] | null
  triggers: string[] | null
  promptInstr: string
}

const SITUATIONS: Record<string, SituationConfig> = {
  leaving_home: {
    areas: ['smu', 'gca'],
    triggers: ['work', 'morning', 'leaving', 'anytime'],
    promptInstr: 'PÅ VEJ PÅ ARBEJDE: vælg ting der er let at glemme og relevante for arbejdsdagen. Prioritér: deadlines i dag, vigtige opfølgninger. Ignorer private og hjemlige ting.',
  },
  leaving_work: {
    areas: ['smu', 'gca'],
    triggers: ['leaving', 'evening', 'work', 'anytime'],
    promptInstr: 'INDEN JEG GÅR HJEM: vælg ting der er let at glemme inden man forlader kontoret. Fokus: opfølgninger, løfter man gav i dag.',
  },
  going_home: {
    areas: ['privat', 'familie', 'andet'],
    triggers: ['home', 'evening', 'anytime'],
    promptInstr: 'PÅ VEJ HJEM: vælg ting relevante for hjemmefronten. Fokus: indkøb, aftaler med familien, noget der kræver handling når man ankommer.',
  },
  arrived_home: {
    areas: ['privat', 'familie', 'andet'],
    triggers: ['home', 'evening', 'anytime'],
    promptInstr: 'KOMMER HJEM: vælg ting at handle på nu — ikke i morgen.',
  },
  focus: {
    areas: null,
    triggers: null,
    promptInstr: 'FOKUS: vælg de vigtigste ting der kræver opmærksomhed lige nu. Prioritér: forfaldne datoer, højeste prioritet.',
  },
}

interface RawItem {
  id: string
  ai_type: string
  ai_summary: string | null
  ai_priority: number
  context_trigger: string | null
  area: string | null
  due_at: string | null
  snoozed_until: string | null
}

const SYSTEM = `Du er APAI's briefing-assistent. Du vælger de mest relevante items fra brugerens indbakke.

Returner KUN dette JSON:
{"points":[{"item_id":"id fra listen","note":"hvad der skal huskes/gøres, max 8 ord"}]}

Regler:
- Brug præcis item_ids fra den givne liste
- 1-3 punkter — kun det vigtigste
- Note: aktiv og konkret, skriv hvad der faktisk skal gøres
- Tom array [] hvis ingen items klart passer
- Kun JSON`

export async function POST(req: NextRequest) {
  const { type } = await req.json() as { type: string }

  const sit = SITUATIONS[type]
  if (!sit) return NextResponse.json({ error: 'Ugyldig type' }, { status: 400 })

  const { data: allItems } = await supabase
    .from('items')
    .select('id, ai_type, ai_summary, ai_priority, context_trigger, area, due_at, snoozed_until')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })
    .limit(100)

  const now = new Date()
  let items: RawItem[] = (allItems ?? []) as RawItem[]

  // Filtrer snoozede + someday fra — someday hører ikke hjemme i aktive briefings
  items = items.filter((i) => (!i.snoozed_until || new Date(i.snoozed_until) < now) && i.ai_type !== 'someday')

  if (type === 'focus') {
    items = items.filter((i) => {
      if (i.ai_priority >= 4) return true
      if (i.due_at && new Date(i.due_at) < now) return true
      return false
    })
  } else {
    const areaMatch = (i: RawItem) => !sit.areas || sit.areas.includes(i.area ?? 'andet')
    const triggerMatch = (i: RawItem) =>
      !sit.triggers ||
      sit.triggers.includes(i.context_trigger ?? 'anytime') ||
      i.ai_priority >= 4
    items = items.filter((i) => areaMatch(i) && triggerMatch(i))
  }

  items = items.slice(0, 15)

  const inputJson = JSON.stringify(
    items.map((i) => ({
      id: i.id,
      s: (i.ai_summary ?? '').slice(0, 60),
      t: i.ai_type,
      p: i.ai_priority,
      ...(i.due_at && new Date(i.due_at) < now ? { overdue: true } : {}),
    }))
  )

  const userMsg = `Situation: ${sit.promptInstr}\n\nItems:\n${inputJson || '[]'}`

  let text: string
  try {
    text = await complete(SYSTEM, userMsg, 300, 'gpt-4o', 'openai')
  } catch (err) {
    console.error('[brief/generate] AI fejl:', err)
    return NextResponse.json({ error: 'AI fejlede' }, { status: 500 })
  }

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleaned)
    const points = (result.points ?? []).filter(
      (p: { item_id: string }) => items.some((i) => i.id === p.item_id)
    )
    supabase.from('briefs').insert({ type, content: text })
    return NextResponse.json({ points })
  } catch (err) {
    console.error('[brief/generate] parse fejl:', text?.slice(0, 200), err)
    return NextResponse.json({ error: 'Ugyldig AI-respons' }, { status: 500 })
  }
}
