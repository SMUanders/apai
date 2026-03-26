import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/items/context?triggers=leaving,home,anytime
export async function GET(req: NextRequest) {
  const triggers = req.nextUrl.searchParams.get('triggers')?.split(',').filter(Boolean) ?? []

  if (triggers.length === 0) return NextResponse.json([])

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'inbox')
    .in('context_trigger', triggers)
    .order('ai_priority', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
