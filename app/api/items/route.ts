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

// POST /api/items — modtag rå input, klassificér og gem
export async function POST(req: NextRequest) {
  const { raw_input } = await req.json()

  if (!raw_input?.trim()) {
    return NextResponse.json({ error: 'Mangler input' }, { status: 400 })
  }

  // Klassificér med AI
  const classification = await classifyInput(raw_input)

  // Gem i Supabase
  const { data, error } = await supabase
    .from('items')
    .insert({
      raw_input: raw_input.trim(),
      ai_type: classification.type,
      ai_summary: classification.summary,
      ai_context: classification.context,
      ai_priority: classification.priority,
      status: 'inbox',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
