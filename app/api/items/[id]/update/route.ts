import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `Du er APAI's opdateringsassistent.

Du får et eksisterende item og brugerens fritekst-opdatering.
Fortolk opdateringsteksten og returner hvad der skal ændres på itemet.

Returner KUN gyldig JSON:
{
  "ai_type": "task|note|idea|reminder|someday|none" eller null,
  "ai_summary": "ny kort titel max 10 ord" eller null,
  "ai_priority": 1-5 eller null,
  "context_trigger": "work|home|morning|evening|leaving|anytime" eller null,
  "changes": ["kort dansk ændringsbeskrivelse"]
}

Regler:
- null = feltet er uændret
- changes = liste med hvad du ændrer (max 3 punkter, dansk, konkret)
- Fortolk frit: "venter på svar" → waiting/note, "hæv" → højere prioritet, "ikke vigtigt" → priority 1 osv.
- Bevar eksisterende summary hvis den stadig passer — opdatér ellers`

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { update_text, current } = await req.json() as {
    update_text: string
    current: { ai_type: string; ai_summary: string; ai_priority: number; context_trigger: string | null }
  }

  if (!update_text?.trim()) {
    return NextResponse.json({ error: 'Mangler opdateringstekst' }, { status: 400 })
  }

  let parsed: {
    ai_type?: string | null
    ai_summary?: string | null
    ai_priority?: number | null
    context_trigger?: string | null
    changes?: string[]
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Item:\nType: ${current.ai_type}\nTitel: ${current.ai_summary}\nPrioritet: ${current.ai_priority}\nKontekst: ${current.context_trigger ?? 'ingen'}\n\nOpdatering: ${update_text}`,
      }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'AI fejlede' }, { status: 500 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.ai_type != null)       updates.ai_type       = parsed.ai_type
  if (parsed.ai_summary != null)    updates.ai_summary    = parsed.ai_summary
  if (parsed.ai_priority != null)   updates.ai_priority   = parsed.ai_priority
  if (parsed.context_trigger != null) updates.context_trigger = parsed.context_trigger

  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    item: data,
    changes: parsed.changes?.length ? parsed.changes : ['Opdateret'],
  })
}
