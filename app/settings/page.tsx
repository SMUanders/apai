'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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
  task: '#E8FF3C', note: '#C8C8C8', idea: '#FF9B3C',
  reminder: '#3CDFFF', someday: '#C4B5FD', none: '#666666',
}

export default function Settings() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const res = await fetch('/api/items/stats')
    const data = await res.json()
    setStats(data)
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
    <main style={{
      background: '#080808',
      minHeight: '100vh',
      fontFamily: "'DM Mono','Courier New',monospace",
      color: '#F0F0F0',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 18px 80px' }}>

        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.4em', color: '#E8FF3C', fontWeight: 700, textTransform: 'uppercase' }}>
            APAI
          </span>
          <Link href="/" style={{ fontSize: 12, color: '#A2A2A2', textDecoration: 'none', letterSpacing: '0.06em' }}>
            ← Tilbage
          </Link>
        </header>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{
            fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase',
            color: '#727272', marginBottom: 16, fontWeight: 400,
          }}>
            Handlinger
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  background: 'none',
                  border: '1px solid #262626',
                  borderRadius: 8,
                  color: loading === key ? '#4A4A4A' : '#A2A2A2',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  padding: '14px 18px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, color 0.15s',
                  touchAction: 'manipulation',
                }}
              >
                {loading === key ? 'Arbejder…' : label}
              </button>
            ))}
          </div>
        </section>

        {stats && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{
              fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase',
              color: '#727272', marginBottom: 20, fontWeight: 400,
            }}>
              Statistik
            </h2>
            <div style={{ display: 'flex', gap: 40, marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#F0F0F0' }}>{stats.inbox}</div>
                <div style={{ fontSize: 12, color: '#727272', marginTop: 4 }}>i indbakken</div>
              </div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#E8FF3C' }}>{stats.doneThisWeek}</div>
                <div style={{ fontSize: 12, color: '#727272', marginTop: 4 }}>gjort denne uge</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: '#A2A2A2', width: 88, letterSpacing: '0.08em' }}>
                    {TYPE_LABELS[type] ?? type}
                  </span>
                  <div style={{ flex: 1, background: '#1C1C1C', borderRadius: 3, height: 7 }}>
                    <div style={{
                      width: `${(count / maxCount) * 100}%`,
                      background: TYPE_COLORS[type] ?? '#555',
                      height: '100%',
                      borderRadius: 3,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#A2A2A2', width: 22, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: '#1C1C1C', border: '1px solid #363636', borderRadius: 8,
            padding: '12px 24px', fontSize: 13, color: '#E8FF3C', zIndex: 100,
            whiteSpace: 'nowrap',
          }}>
            {toast}
          </div>
        )}
      </div>
    </main>
  )
}
