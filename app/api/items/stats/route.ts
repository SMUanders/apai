import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const [{ data: inbox }, { data: done }, { count: snoozedCount }] = await Promise.all([
    supabase.from('items').select('ai_type').eq('status', 'inbox'),
    supabase.from('items').select('id').eq('status', 'done').gte('updated_at', weekAgo),
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'inbox')
      .gt('snoozed_until', now),
  ])

  const byType: Record<string, number> = {}
  for (const item of inbox ?? []) {
    byType[item.ai_type] = (byType[item.ai_type] ?? 0) + 1
  }

  return NextResponse.json({
    inbox: inbox?.length ?? 0,
    doneThisWeek: done?.length ?? 0,
    snoozedCount: snoozedCount ?? 0,
    byType,
  })
}
