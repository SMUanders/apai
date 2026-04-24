import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

type Body = {
  priority?: number
  important?: boolean
  manual?: boolean
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as Body

  const updates: Record<string, unknown> = {}

  if (typeof body.important === 'boolean') {
    // 1-taps toggle: sæt/ryd manuelt override
    if (body.important) {
      updates.ai_priority = 5
      updates.user_priority_override = true
    } else {
      updates.ai_priority = 3
      updates.user_priority_override = false
    }
  } else if (typeof body.priority === 'number') {
    // Direkte priority-ændring (stepper). Manuelt = sæt override med.
    const clamped = Math.max(1, Math.min(5, Math.round(body.priority)))
    updates.ai_priority = clamped
    if (body.manual !== false) {
      updates.user_priority_override = true
    }
  } else {
    return NextResponse.json({ error: 'Mangler priority eller important' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
