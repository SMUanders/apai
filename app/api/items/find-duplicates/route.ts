import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

const STOPWORDS = new Set([
  'og', 'at', 'er', 'en', 'et', 'til', 'af', 'det', 'den', 'de', 'med', 'på', 'for',
  'om', 'som', 'har', 'fra', 'jeg', 'du', 'han', 'hun', 'vi', 'man', 'ikke', 'men',
  'kan', 'vil', 'skal', 'der', 'her', 'når', 'hvis', 'også', 'eller', 'får', 'sig',
  'sin', 'sit', 'bare', 'lige', 'nu', 'så', 'ind', 'ud', 'op', 'ned', 'the', 'and',
  'that', 'this', 'with', 'for', 'are', 'was', 'have', 'been',
])

// Types that can be duplicates of each other
const COMPATIBLE: Record<string, string[]> = {
  task: ['task', 'reminder'],
  reminder: ['task', 'reminder'],
  note: ['note'],
  idea: ['idea'],
  someday: ['someday'],
  none: ['none', 'task', 'reminder'],
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\wæøåÆØÅ\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  )
}

function wordOverlap(a: string, b: string): number {
  const wa = tokenize(a)
  const wb = tokenize(b)
  if (wa.size === 0 || wb.size === 0) return 0
  const intersection = Array.from(wa).filter((w) => wb.has(w)).length
  // Jaccard
  return intersection / (wa.size + wb.size - intersection)
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

      // Skip incompatible types
      if (!COMPATIBLE[a.ai_type]?.includes(b.ai_type)) continue

      const textA = (a.ai_summary || a.raw_input).trim()
      const textB = (b.ai_summary || b.raw_input).trim()
      const score = wordOverlap(textA, textB)

      // Stricter threshold + Jaccard is harder to hit than overlap ratio
      if (score >= 0.45) {
        pairs.push({ a, b, score })
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score)

  return NextResponse.json({ pairs: pairs.slice(0, 6) })
}
