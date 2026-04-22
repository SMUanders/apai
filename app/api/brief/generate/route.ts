import { NextRequest, NextResponse } from 'next/server'
import { completeStream } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const BRIEF_PROMPT: Record<string, string> = {
  morning: `MORGEN: Start med "God morgen." Nævn de 2-3 vigtigste ting for i dag. Slut med én kort opfordring.`,
  midday: `MIDDAG: Nævn kort hvad der stadig mangler. Max 2 næste skridt.`,
  afternoon: `EFTERMIDDAG: Hvad er vigtigst at nå inden dagen slutter? Vær konkret og kort.`,
  shutdown: `SHUTDOWN: Hvad blev gjort i dag? Hvad kan vente til i morgen? Slut roligt.`,
}

export async function POST(req: NextRequest) {
  const { type } = await req.json() as { type: string }

  if (!Object.keys(BRIEF_PROMPT).includes(type)) {
    return NextResponse.json({ error: 'Ugyldig type' }, { status: 400 })
  }

  const { data: items } = await supabase
    .from('items')
    .select('ai_type, ai_summary, ai_priority, created_at')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })
    .limit(20)

  const itemList = (items ?? [])
    .map((i) => `- [${i.ai_type}, prio ${i.ai_priority}] ${i.ai_summary}`)
    .join('\n')

  const system = `Du er APAI — en personlig assistent.
Du får brugerens indbakke. Skriv en meget kort briefing på dansk.
${BRIEF_PROMPT[type]}
Stil: rolig, menneskelig, ingen bullet points — løbende tekst. Max 60 ord.`

  const { stream, fullText } = completeStream(system, `Indbakke:\n${itemList || '(tom)'}`, 150)

  // Gem til DB når streaming er færdig
  fullText.then((content) => supabase.from('briefs').insert({ type, content }))

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
