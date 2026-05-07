// Engangs-eksport af alle items fra Supabase.
// Kør: node scripts/export-items.js
// Læser env fra .env.local.

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('Mangler .env.local i projektroden.')
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Mangler NEXT_PUBLIC_SUPABASE_URL eller en nøgle i .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

async function fetchAll() {
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function fmtDate(s) {
  if (!s) return ''
  try { return new Date(s).toISOString().slice(0, 16).replace('T', ' ') } catch { return s }
}

function escapeMd(s) {
  if (!s) return ''
  return String(s).replace(/\r/g, '').trim()
}

function renderMarkdown(items) {
  const byStatus = { inbox: [], backlog: [], done: [], archived: [], andet: [] }
  for (const it of items) {
    const bucket = byStatus[it.status] ? it.status : 'andet'
    byStatus[bucket].push(it)
  }

  const lines = []
  lines.push(`# APAI eksport`)
  lines.push('')
  lines.push(`Eksporteret: ${new Date().toISOString()}`)
  lines.push(`I alt: ${items.length} items`)
  lines.push('')

  const order = ['inbox', 'backlog', 'done', 'archived', 'andet']
  const titles = {
    inbox: 'Inbox (aktive)',
    backlog: 'Backlog',
    done: 'Færdige',
    archived: 'Arkiverede',
    andet: 'Øvrige',
  }

  for (const status of order) {
    const list = byStatus[status]
    if (!list.length) continue
    lines.push(`## ${titles[status]} (${list.length})`)
    lines.push('')

    list.sort((a, b) => (b.ai_priority || 0) - (a.ai_priority || 0))

    for (const it of list) {
      const summary = escapeMd(it.ai_summary) || escapeMd(it.raw_input).split('\n')[0] || '(tomt)'
      lines.push(`### ${summary}`)
      const meta = []
      if (it.ai_type) meta.push(`type: ${it.ai_type}`)
      if (it.ai_priority != null) meta.push(`prio: ${it.ai_priority}`)
      if (it.area) meta.push(`område: ${it.area}`)
      if (it.context_trigger) meta.push(`kontekst: ${it.context_trigger}`)
      if (it.due_at) meta.push(`forfald: ${fmtDate(it.due_at)}`)
      if (it.snoozed_until) meta.push(`snoozed: ${fmtDate(it.snoozed_until)}`)
      if (it.group_label) meta.push(`gruppe: ${it.group_label}`)
      if (meta.length) lines.push(`_${meta.join(' · ')}_`)
      lines.push('')
      if (it.ai_context) {
        lines.push(escapeMd(it.ai_context))
        lines.push('')
      }
      if (it.raw_input && it.raw_input !== it.ai_summary) {
        lines.push('> ' + escapeMd(it.raw_input).split('\n').join('\n> '))
        lines.push('')
      }
      lines.push(`oprettet ${fmtDate(it.created_at)} · id ${it.id}`)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function main() {
  console.log('Henter items fra Supabase…')
  const items = await fetchAll()
  console.log(`Hentet ${items.length} items.`)

  const outDir = path.join(__dirname, '..')
  const jsonPath = path.join(outDir, 'apai-export.json')
  const mdPath = path.join(outDir, 'apai-export.md')

  fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2), 'utf8')
  fs.writeFileSync(mdPath, renderMarkdown(items), 'utf8')

  console.log(`Gemt: ${jsonPath}`)
  console.log(`Gemt: ${mdPath}`)
}

main().catch((err) => {
  console.error('Fejl:', err)
  process.exit(1)
})
