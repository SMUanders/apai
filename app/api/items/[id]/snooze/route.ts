import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

function snoozeUntil(option: string): string {
  const now = new Date()
  if (option === 'today') {
    return new Date(now.getTime() + 4 * 3600_000).toISOString()
  }
  // tomorrow / week: næste dag/uge kl. 7:00 UTC = 8-9 dansk tid
  const days = option === 'week' ? 7 : 1
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(7, 0, 0, 0)
  return d.toISOString()
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { option } = await req.json() as { option: string }

  if (!['today', 'tomorrow', 'week'].includes(option)) {
    return NextResponse.json({ error: 'Ugyldig option' }, { status: 400 })
  }

  const snoozed_until = snoozeUntil(option)

  const { data, error } = await supabase
    .from('items')
    .update({ snoozed_until })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
