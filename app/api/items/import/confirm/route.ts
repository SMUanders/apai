import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { classifyInput } from '@/lib/classify'

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
  const { lines, source } = await req.json() as { lines: string[]; source: string }

  if (!lines?.length) {
    return NextResponse.json({ error: 'Ingen linjer' }, { status: 400 })
  }
  if (lines.length > 20) {
    return NextResponse.json({ error: 'Max 20 linjer per kald' }, { status: 400 })
  }

  const aiContext = source === 'pdf' ? 'pdf_import' : 'bulk_import'

  // Hent eksisterende inbox til dublet-tjek
  const { data: existing } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary')
    .eq('status', 'inbox')
    .limit(300)

  const pool = existing ?? []

  const imported: Array<{ id: string; ai_summary: string | null }> = []
  const duplicates: Array<{ line: string; similar_to: string; similar_id: string }> = []
  const errors: string[] = []

  for (const line of lines) {
    // Dublet-tjek (konservativt: 0.65 threshold)
    const dup = pool.find((item) => similarity(line, item.raw_input) > 0.65)
    if (dup) {
      duplicates.push({
        line,
        similar_to: dup.ai_summary || dup.raw_input,
        similar_id: dup.id,
      })
      continue
    }

    let classification
    try {
      classification = await classifyInput(line)
    } catch {
      classification = {
        type: 'task' as const,
        summary: line.slice(0, 80),
        context: aiContext,
        context_trigger: null,
        priority: 2,
        due_at: null,
        confident: false,
      }
    }

    const baseInsert = {
      raw_input: line.trim(),
      ai_type: classification.type,
      ai_summary: classification.summary,
      ai_context: aiContext,
      ai_priority: classification.priority,
      context_trigger: classification.context_trigger,
      area: ('area' in classification ? classification.area : null) ?? 'andet',
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

    if (result.error) {
      errors.push(line)
    } else {
      imported.push({ id: result.data.id, ai_summary: result.data.ai_summary })
      // Tilføj til pool for intra-batch dedup
      pool.push({ id: result.data.id, raw_input: line, ai_summary: result.data.ai_summary })
    }
  }

  return NextResponse.json({ imported: imported.length, duplicates, errors })
}
