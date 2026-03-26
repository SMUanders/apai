import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type ItemType = 'task' | 'note' | 'idea' | 'reminder' | 'someday' | 'none'
export type ItemStatus = 'inbox' | 'done' | 'archived'

export interface Item {
  id: string
  raw_input: string
  ai_type: ItemType
  ai_summary: string | null
  ai_context: string | null
  ai_priority: number
  status: ItemStatus
  created_at: string
  updated_at: string
}
