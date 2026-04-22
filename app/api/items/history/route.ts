import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function GET() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .in('status', ['done', 'archived'])
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
