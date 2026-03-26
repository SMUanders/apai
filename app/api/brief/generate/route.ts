import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const BRIEF_PROMPT: Record<string, string> = {
  morning: `MORNING brief:
- Start med "God morgen."
- Nævn antal items i indbakken
- Fremhæv max 3 vigtige ting for i dag
- Nævn hvis der er noget der har ventet længe
- Slut med én enkel opfordring`,
  midday: `MIDDAY brief:
- Start med hvad der er klaret siden morgen
- Fremhæv hvad der stadig mangler
- Max 2 konkrete næste skridt`,
  shutdown: `SHUTDOWN brief:
- Opsummer hvad der blev gjort i dag
- Nævn hvad der kan lægges fra sig til i morgen
- Slut roligt — "Det kan vente til i morgen."`,
}

export async function POST(req: NextRequest) {
  const { type } = await req.json() as { type: string }

  if (!['morning', 'midday', 'shutdown'].includes(type)) {
    return NextResponse.json({ error: 'Ugyldig type' }, { status: 400 })
  }

  const { data: items } = await supabase
    .from('items')
    .select('raw_input, ai_type, ai_summary, ai_priority, created_at')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })

  const itemList = (items ?? [])
    .map((i) => `- [${i.ai_type}, prio ${i.ai_priority}] ${i.ai_summary || i.raw_input}`)
    .join('\n')

  const systemPrompt = `Du er APAI — en personlig assistent der hjælper brugeren med mental aflastning.

Du får en liste over alle items i brugerens indbakke.
Skriv en kort, rolig briefing på dansk tilpasset tidspunktet.

${BRIEF_PROMPT[type]}

Stil: rolig, kort, menneskelig. Ikke en robot. Ikke bullet points — løbende tekst.
Max 120 ord.`

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Indbakke:\n${itemList || '(tom)'}` }],
  })

  let fullContent = ''

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text
          fullContent += text
          controller.enqueue(new TextEncoder().encode(text))
        }
      }
      controller.close()

      // Gem i Supabase
      await supabase.from('briefs').insert({ type, content: fullContent })
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
