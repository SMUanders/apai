import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { group_label } = await req.json() as { group_label: string | null }

  const value = group_label?.trim() || null

  let result = await supabase
    .from('items')
    .update({ group_label: value })
    .eq('id', params.id)
    .select()
    .single()

  if (result.error?.message?.includes('group_label')) {
    return NextResponse.json({ error: 'group_label-kolonne mangler — kør migration_v5.sql' }, { status: 500 })
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  return NextResponse.json({ item: result.data })
}
