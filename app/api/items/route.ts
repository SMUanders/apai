import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { classifyInput } from '@/lib/classify'

// GET /api/items — hent alle inbox-items, sorteret efter prioritet
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

// POST /api/items — modtag rå input, klassificér og gem
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { raw_input, force } = body as { raw_input: string; force?: boolean }

  if (!raw_input?.trim()) {
    return NextResponse.json({ error: 'Mangler input' }, { status: 400 })
  }

  // Duplikat-tjek (medmindre brugeren har force-accept)
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
  try {
    classification = await classifyInput(raw_input)
  } catch {
    // Fallback hvis Claude fejler
    classification = {
      type: 'note' as const,
      summary: raw_input.slice(0, 80),
      context: null,
      context_trigger: null,
      priority: 3,
      due_at: null,
    }
  }

  const { data, error } = await supabase
    .from('items')
    .insert({
      raw_input: raw_input.trim(),
      ai_type: classification.type,
      ai_summary: classification.summary,
      ai_context: classification.context,
      ai_priority: classification.priority,
      context_trigger: classification.context_trigger,
      due_at: classification.due_at,
      status: 'inbox',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
