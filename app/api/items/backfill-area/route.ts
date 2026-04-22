import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

type Area = 'smu' | 'gca' | 'privat' | 'familie' | 'andet'

function guessArea(raw: string, summary: string | null): Area {
  const text = (raw + ' ' + (summary ?? '')).toLowerCase()

  if (/\b(gca|grand.?champion|arcade|flipper|spillemaskine|automat|pinball)\b/.test(text)) return 'gca'

  if (/\b(smu|signmeup|sign.?me.?up|apai|netlify|supabase|deploy|backend|frontend|typescript|next\.?js|api.?key|server|database|kodebase|staging|production|repo|github|pr\b)\b/.test(text)) return 'smu'

  if (/\b(familie|børn|barn|kone|mand|forældre|mor\b|far\b|søster|bror|skole|sfo|barnebarn|svigermor|svigerfar|svigerbørn)\b/.test(text)) return 'familie'

  if (/\b(bil|peugeot|polestar|volvo|motor|dæk|service|værksted|læge|tandlæge|helbred|træning|løb|fitness|indkøb|supermarked|hus|hjem|lejlighed|leje|bank|pension|forsikring|skat|bolig|el|vand|varme|renovation|haven)\b/.test(text)) return 'privat'

  return 'andet'
}

export async function POST() {
  // Hent alle items uden area (eller med 'andet' som default)
  const { data: items, error } = await supabase
    .from('items')
    .select('id, raw_input, ai_summary, area')
    .or('area.is.null,area.eq.andet')
    .in('status', ['inbox', 'backlog'])
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ updated: 0 })

  let updated = 0
  for (const item of items) {
    const guessed = guessArea(item.raw_input, item.ai_summary)
    if (guessed !== 'andet') {
      await supabase.from('items').update({ area: guessed }).eq('id', item.id)
      updated++
    }
  }

  return NextResponse.json({ updated, total: items.length })
}
