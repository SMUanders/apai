import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type ItemType = 'task' | 'note' | 'idea' | 'reminder' | 'someday' | 'none'
export type ItemStatus = 'inbox' | 'done' | 'archived' | 'backlog'
export type ContextTrigger = 'home' | 'work' | 'leaving' | 'morning' | 'evening' | 'anytime'
export type AreaType = 'smu' | 'gca' | 'privat' | 'familie' | 'andet'

export interface Item {
  id: string
  raw_input: string
  ai_type: ItemType
  ai_summary: string | null
  ai_context: string | null
  ai_priority: number
  context_trigger: ContextTrigger | null
  due_at: string | null
  snoozed_until?: string | null
  group_label?: string | null
  area?: AreaType | null
  user_priority_override?: boolean
  status: ItemStatus
  created_at: string
  updated_at: string
  confident?: boolean  // kun til stede i API-svar, ikke gemt i DB
}
