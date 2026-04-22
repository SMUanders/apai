import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { classifyInput } from '@/lib/classify'

interface TodoistTask {
  id: string
  content: string
  description: string
  priority: number // Todoist: 4=urgent 3=high 2=medium 1=normal
  due: { date: string; datetime?: string } | null
  deadline: { date: string; datetime?: string } | null
  project_id: string
  labels: string[]
  checked: boolean
}

interface TodoistResponse {
  results: TodoistTask[]
  next_cursor: string | null
}

function todoistPriority(p: number): number {
  // Todoist 4→APAI 5, 3→4, 2→3, 1→2
  return p + 1
}

async function fetchAllTasks(token: string): Promise<TodoistTask[]> {
  const tasks: TodoistTask[] = []
  let cursor: string | null = null

  do {
    const url = new URL('https://api.todoist.com/api/v1/tasks')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Todoist API fejl: ${res.status} ${text}`)
    }

    const data: TodoistResponse = await res.json()
    tasks.push(...data.results.filter((t) => !t.checked))
    cursor = data.next_cursor
  } while (cursor)

  return tasks
}

export async function POST() {
  const token = process.env.TODOIST_API_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'TODOIST_API_TOKEN ikke sat i miljøvariable' },
      { status: 400 }
    )
  }

  let tasks: TodoistTask[]
  try {
    tasks = await fetchAllTasks(token)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  const found = tasks.length

  // Byg dedup-sæt: hvilke Todoist-IDs er allerede importeret
  const { data: existing } = await supabase
    .from('items')
    .select('ai_context')
    .like('ai_context', 'todoist:%')

  const importedIds = new Set(
    (existing ?? [])
      .map((r: { ai_context: string | null }) => r.ai_context?.replace('todoist:', '') ?? '')
      .filter(Boolean)
  )

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const task of tasks) {
    if (importedIds.has(task.id)) {
      skipped++
      continue
    }

    const raw = task.description?.trim()
      ? `${task.content}\n\n${task.description.trim()}`
      : task.content

    const dueDate = task.due?.datetime ?? task.due?.date ?? task.deadline?.date ?? null

    let classification
    try {
      classification = await classifyInput(raw)
    } catch {
      classification = {
        type: 'task' as const,
        summary: task.content.slice(0, 80),
        context: `todoist:${task.id}`,
        context_trigger: null,
        priority: todoistPriority(task.priority),
        due_at: dueDate,
        confident: false,
      }
    }

    const baseInsert = {
      raw_input: raw.trim(),
      ai_type: classification.type,
      ai_summary: classification.summary,
      ai_context: `todoist:${task.id}`,
      ai_priority: classification.priority,
      context_trigger: classification.context_trigger,
      status: 'inbox',
    }

    let result = await supabase
      .from('items')
      .insert({ ...baseInsert, due_at: classification.due_at ?? dueDate })
      .select()
      .single()

    if (result.error?.message?.includes('due_at')) {
      result = await supabase.from('items').insert(baseInsert).select().single()
    }

    if (result.error) {
      errors.push(`${task.id}: ${result.error.message}`)
    } else {
      imported++
    }
  }

  return NextResponse.json({ found, imported, skipped, errors })
}
