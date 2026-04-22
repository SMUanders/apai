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
    promptInstr: `PÅ VEJ PÅ ARBEJDE: Brugeren er i bilen. Nævn 1–3 ting der er let at glemme og relevante for arbejdsdagen. Prioritér: deadlines i dag, vigtige opfølgninger, ting der kræver tidlig handling. Ignorer private og hjemlige ting. Start direkte — ingen hilsen.`,
  },
  leaving_work: {
    areas: ['smu', 'gca'],
    triggers: ['leaving', 'evening', 'work', 'anytime'],
    promptInstr: `INDEN JEG GÅR HJEM: 1–3 ting der er let at glemme inden man forlader kontoret. Fokus: uafsluttede opfølgninger, ting der kræver afklaring inden i morgen, løfter man gav i dag.`,
  },
  going_home: {
    areas: ['privat', 'familie', 'andet'],
    triggers: ['home', 'evening', 'anytime'],
    promptInstr: `PÅ VEJ HJEM: Brugeren er i bilen. 1–3 ting relevante for hjemmefronten. Fokus: indkøb der mangler, aftaler med familien, noget der kræver handling når man ankommer.`,
  },
  arrived_home: {
    areas: ['privat', 'familie', 'andet'],
    triggers: ['home', 'evening', 'anytime'],
    promptInstr: `KOMMER HJEM: 1–3 konkrete ting at handle på nu — ikke i morgen. Vær meget kort og direkte.`,
  },
  focus: {
    areas: null,
    triggers: null,
    promptInstr: `FOKUS: De 1–3 vigtigste ting der kræver opmærksomhed lige nu. Prioritér: forfaldne datoer, højeste prioritet, ting der blokerer andet. Udelad alt der kan vente.`,
  },
}

interface RawItem {
  ai_type: string
  ai_summary: string | null
  ai_priority: number
  context_trigger: string | null
  area: string | null
  due_at: string | null
}

async function buildBriefInput(type: string, sit: SituationConfig): Promise<{ system: string; userMsg: string; itemCount: number }> {
  const { data: allItems } = await supabase
    .from('items')
    .select('ai_type, ai_summary, ai_priority, context_trigger, area, due_at')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })
    .limit(100)

  const now = new Date()
  let items: RawItem[] = (allItems ?? []) as RawItem[]

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

  const itemList = items
    .map((i) => {
      const parts = [`[prio ${i.ai_priority}]`, i.ai_summary ?? '(uden tekst)']
      if (i.context_trigger && i.context_trigger !== 'anytime') {
        parts.push(`(kontekst: ${i.context_trigger})`)
      }
      if (i.due_at) {
        const diffDays = Math.round((new Date(i.due_at).getTime() - now.getTime()) / 86400000)
        if (diffDays < 0) parts.push(`(FORFALDET ${Math.abs(diffDays)}d siden)`)
        else if (diffDays === 0) parts.push(`(forfald: i dag)`)
        else if (diffDays <= 2) parts.push(`(forfald: om ${diffDays}d)`)
      }
      return '- ' + parts.join(' ')
    })
    .join('\n')

  const system = `Du er APAI — en meget kort personlig assistent.
Du får brugerens indbakke. Skriv en briefing på dansk.
${sit.promptInstr}
Stil: direkte og rolig, ingen bullet points — løbende tekst. Max 50 ord.`

  return { system, userMsg: `Indbakke:\n${itemList || '(tom)'}`, itemCount: items.length }
}

export async function POST(req: NextRequest) {
  const { type } = await req.json() as { type: string }

  const sit = SITUATIONS[type]
  if (!sit) {
    return NextResponse.json({ error: 'Ugyldig type' }, { status: 400 })
  }

  const { system, userMsg, itemCount } = await buildBriefInput(type, sit)

  // Kør begge providers parallelt med identisk input
  const [anthropicResult, openaiResult] = await Promise.all([
    complete(system, userMsg, 130, undefined, 'anthropic').catch((e) => `Fejl: ${e.message}`),
    complete(system, userMsg, 130, undefined, 'openai').catch((e) => `Fejl: ${e.message}`),
  ])

  return NextResponse.json({
    anthropic: anthropicResult,
    openai: openaiResult,
    itemCount,
    models: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o' },
  })
}
