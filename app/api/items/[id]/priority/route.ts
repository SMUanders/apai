import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { priority } = await req.json() as { priority: number }
  const clamped = Math.max(1, Math.min(5, Math.round(priority)))

  const { data, error } = await supabase
    .from('items')
    .update({ ai_priority: clamped })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
