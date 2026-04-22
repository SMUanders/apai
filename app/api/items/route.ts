import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { classifyInput } from '@/lib/classify'

export async function GET() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'inbox')
    .order('ai_priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

function similarity(a: string, b: string): number {
  const an = a.toLowerCase().trim()
  const bn = b.toLowerCase().trim()
  if (an === bn) return 1
  const wordsA = new Set(an.split(/\s+/))
  const wordsB = bn.split(/\s+/)
  const overlap = wordsB.filter((w) => wordsA.has(w)).length
  return overlap / Math.max(wordsA.size, wordsB.length)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { raw_input, force } = body as { raw_input: string; force?: boolean }

  if (!raw_input?.trim()) {
    return NextResponse.json({ error: 'Mangler input' }, { status: 400 })
  }

  // Duplikat-tjek
  if (!force) {
    const { data: recent } = await supabase
      .from('items')
      .select('*')
      .eq('status', 'inbox')
      .order('created_at', { ascending: false })
      .limit(50)

    if (recent) {
      const dup = recent.find((item) => similarity(raw_input, item.raw_input) > 0.8)
      if (dup) {
        return NextResponse.json({ duplicate: true, existing_item: dup }, { status: 200 })
      }
    }
  }

  // Klassificér med AI
  let classification
  let classifyFailed = false

  try {
    classification = await classifyInput(raw_input)
  } catch {
    classifyFailed = true
    classification = {
      type: 'none' as const,
      summary: raw_input.slice(0, 80),
      context: '__review__',   // markør: skal gennemses
      context_trigger: null,
      priority: 2,
      due_at: null,
      confident: false,
    }
  }

  const confident = !classifyFailed && (classification.confident !== false)

  const baseInsert = {
    raw_input: raw_input.trim(),
    ai_type: classification.type,
    ai_summary: classification.summary,
    ai_context: classification.context,
    ai_priority: classification.priority,
    context_trigger: classification.context_trigger,
    area: classification.area ?? 'andet',
    status: 'inbox',
  }

  let result = await supabase
    .from('items')
    .insert({ ...baseInsert, due_at: classification.due_at })
    .select()
    .single()

  if (result.error?.message?.includes('due_at')) {
    result = await supabase.from('items').insert(baseInsert).select().single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  // Returner item + confident-flag (ikke gemt i DB, bruges kun til UI-feedback)
  return NextResponse.json({ ...result.data, confident }, { status: 201 })
}
