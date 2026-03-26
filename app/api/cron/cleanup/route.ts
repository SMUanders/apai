import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Arkivér done-items ældre end 24 timer
  const { data: archived } = await supabase
    .from('items')
    .update({ status: 'archived' })
    .eq('status', 'done')
    .lt('updated_at', yesterday)
    .select('id')

  // Slet archived-items ældre end 30 dage
  const { data: deleted } = await supabase
    .from('items')
    .delete()
    .eq('status', 'archived')
    .lt('updated_at', thirtyDaysAgo)
    .select('id')

  return NextResponse.json({
    archived: archived?.length ?? 0,
    deleted: deleted?.length ?? 0,
  })
}
