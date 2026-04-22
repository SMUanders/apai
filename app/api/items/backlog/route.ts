import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function GET() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'backlog')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
