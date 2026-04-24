import { NextRequest, NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const SYSTEM_PROMPT = `Du opdaterer et eksisterende APAI-item baseret på brugerens instruktion.

Returner UDELUKKENDE JSON:
{
  "ai_type": "task|note|idea|reminder|someday|none" — eller null hvis uændret,
  "ai_summary": "aktiv sætning max 10 ord" — eller null hvis uændret,
  "ai_priority": 1-5 — eller null hvis uændret,
  "context_trigger": "work|home|morning|evening|leaving|anytime" — eller null hvis uændret,
  "changes": ["hvad ændrede du, konkret dansk, max 3 punkter"]
}

Fortolkningsregler:
- "venter på svar fra X" → type: note, summary opdateres
- "hæv" / "mere vigtigt" → +1 prioritet
- "ikke vigtigt" / "kan vente" → prioritet 1-2
- "gjort" / "færdig" → type: none
- Bevar summary hvis den stadig er dækkende — ret ellers

null = uændret. Kun JSON.`

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
    const userMsg = `Item:\nType: ${current.ai_type}\nTitel: ${current.ai_summary}\nPrioritet: ${current.ai_priority}\nKontekst: ${current.context_trigger ?? 'ingen'}\n\nOpdatering: ${update_text}`
    const text = await complete(SYSTEM_PROMPT, userMsg, 300, 'gpt-4o-mini', 'openai')
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'AI fejlede' }, { status: 500 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.ai_type != null)          updates.ai_type       = parsed.ai_type
  if (parsed.ai_summary != null)       updates.ai_summary    = parsed.ai_summary
  if (parsed.context_trigger != null)  updates.context_trigger = parsed.context_trigger
  if (parsed.ai_priority != null) {
    updates.ai_priority = parsed.ai_priority
    // Fri-tekst prioritetsændring er et brugerintent — behandl som manuel override
    updates.user_priority_override = true
  }

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
