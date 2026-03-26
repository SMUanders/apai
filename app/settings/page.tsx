'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Stats {
  inbox: number
  doneThisWeek: number
  byType: Record<string, number>
}

const TYPE_LABELS: Record<string, string> = {
  task: 'Opgaver', note: 'Noter', idea: 'Idéer',
  reminder: 'Påmindelser', someday: 'Engang', none: 'Ingen handling',
}
const TYPE_COLORS: Record<string, string> = {
  task: '#E8FF3C', note: '#B8B8B8', idea: '#FF9B3C',
  reminder: '#3CDFFF', someday: '#C4B5FD', none: '#555555',
}

export default function Settings() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: inbox }, { data: done }] = await Promise.all([
      supabase.from('items').select('ai_type').eq('status', 'inbox'),
      supabase.from('items').select('id').eq('status', 'done').gte('updated_at', weekAgo),
    ])
    const byType: Record<string, number> = {}
    for (const item of inbox ?? []) {
      byType[item.ai_type] = (byType[item.ai_type] ?? 0) + 1
    }
    setStats({ inbox: inbox?.length ?? 0, doneThisWeek: done?.length ?? 0, byType })
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function run(key: string, url: string, method = 'POST') {
    setLoading(key)
    const res = await fetch(url, { method })
    const data = await res.json()
    setLoading(null)
    if (data.updated !== undefined) showToast(`${data.updated} opdateret`)
    else if (data.archived !== undefined) showToast(`${data.archived} arkiveret, ${data.deleted} slettet`)
    else if (data.changes !== undefined) showToast(`${data.changes.length} items justeret`)
    await loadStats()
  }

  const maxCount = stats ? Math.max(...Object.values(stats.byType), 1) : 1

  return (
    <main style={{ background: '#0E0E0E', minHeight: '100vh', fontFamily: "'DM Mono','Courier New',monospace", color: '#E8E8E8' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 80px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 40 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.35em', color: '#E8FF3C', fontWeight: 700 }}>APAI</span>
          <Link href="/" style={{ fontSize: 11, color: '#444', textDecoration: 'none', letterSpacing: '0.05em' }}>← Tilbage</Link>
        </header>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#444', marginBottom: 16 }}>Handlinger</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'reprioritize', label: 'Re-prioritér indbakken', url: '/api/items/reprioritize' },
              { key: 'cleanup', label: 'Ryd op nu', url: '/api/cron/cleanup' },
              { key: 'reclassify', label: 'Re-klassificér alle', url: '/api/items/reclassify' },
            ].map(({ key, label, url }) => (
              <button
                key={key}
                onClick={() => run(key, url)}
                disabled={loading === key}
                style={{
                  background: 'none', border: '1px solid #222', borderRadius: 6,
                  color: loading === key ? '#333' : '#888', fontFamily: 'inherit',
                  fontSize: 13, padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s',
                }}
              >
                {loading === key ? 'Arbejder…' : label}
              </button>
            ))}
          </div>
        </section>

        {stats && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#444', marginBottom: 16 }}>Statistik</h2>
            <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#E8E8E8' }}>{stats.inbox}</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>i indbakken</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#E8FF3C' }}>{stats.doneThisWeek}</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>gjort denne uge</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: '#444', width: 80, letterSpacing: '0.1em' }}>{TYPE_LABELS[type] ?? type}</span>
                  <div style={{ flex: 1, background: '#141414', borderRadius: 2, height: 6 }}>
                    <div style={{ width: `${(count / maxCount) * 100}%`, background: TYPE_COLORS[type] ?? '#555', height: '100%', borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#555', width: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 6,
            padding: '10px 20px', fontSize: 13, color: '#E8FF3C',
          }}>
            {toast}
          </div>
        )}
      </div>
    </main>
  )
}
