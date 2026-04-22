import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

function wordOverlap(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 2)
  const wa = new Set(normalize(a))
  const wb = new Set(normalize(b))
  if (wa.size === 0 || wb.size === 0) return 0
  const intersection = Array.from(wa).filter((w) => wb.has(w)).length
  return intersection / Math.max(wa.size, wb.size)
}

export async function GET() {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary, ai_type, ai_priority, created_at')
    .eq('status', 'inbox')
    .limit(150)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length < 2) return NextResponse.json({ pairs: [] })

  const pairs: { a: typeof items[0]; b: typeof items[0]; score: number }[] = []

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      const textA = (a.ai_summary || a.raw_input).trim()
      const textB = (b.ai_summary || b.raw_input).trim()
      const score = wordOverlap(textA, textB)
      if (score >= 0.5) {
        pairs.push({ a, b, score })
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score)

  return NextResponse.json({ pairs: pairs.slice(0, 8) })
}
