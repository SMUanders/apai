import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: inbox }, { data: done }] = await Promise.all([
    supabase.from('items').select('ai_type').eq('status', 'inbox'),
    supabase.from('items').select('id').eq('status', 'done').gte('updated_at', weekAgo),
  ])

  const byType: Record<string, number> = {}
  for (const item of inbox ?? []) {
    byType[item.ai_type] = (byType[item.ai_type] ?? 0) + 1
  }

  return NextResponse.json({
    inbox: inbox?.length ?? 0,
    doneThisWeek: done?.length ?? 0,
    byType,
  })
}
