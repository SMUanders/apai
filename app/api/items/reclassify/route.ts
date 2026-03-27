import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { classifyInput } from '@/lib/classify'

// POST /api/items/reclassify — opdatér items uden context_trigger
export async function POST() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input')
    .eq('status', 'inbox')
    .is('context_trigger', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ updated: 0 })

  let updated = 0
  for (const item of items) {
    try {
      const classification = await classifyInput(item.raw_input)
      await supabase
        .from('items')
        .update({
          ai_type: classification.type,
          ai_summary: classification.summary,
          ai_context: classification.context,
          ai_priority: classification.priority,
          context_trigger: classification.context_trigger,
          due_at: classification.due_at,
        })
        .eq('id', item.id)
      updated++
    } catch { /* fortsæt med næste */ }
  }

  return NextResponse.json({ updated })
}
