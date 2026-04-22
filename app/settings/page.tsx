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

interface ImportResult {
  found: number
  imported: number
  skipped: number
  errors?: string[]
}

type ActionStatus = 'idle' | 'confirm' | 'loading' | 'done' | 'error'

const ACTIONS = [
  {
    key: 'backfill-area',
    label: 'Sæt område på alle items',
    description: 'Gætter område (SMU, GCA, Privat, Familie) på eksisterende items baseret på nøgleord. Kun items uden område opdateres. Ingen AI-kald — hurtigt.',
    confirmText: 'Opdaterer område på items der mangler det. Kan justeres manuelt bagefter. Fortsæt?',
    url: '/api/items/backfill-area',
    formatResult: (d: Record<string, unknown>) =>
      d.updated === 0
        ? `Alle ${d.total} items har allerede et område sat.`
        : `${d.updated} af ${d.total} items fik tildelt et område.`,
  },
  {
    key: 'reprioritize',
    label: 'Re-prioritér indbakken',
    description: 'AI gennemgår alle inbox-items og justerer prioritet (1–5) samt type. Items ældre end 7 dage trækkes ned. Ændrer ikke tekst eller indhold.',
    confirmText: 'AI justerer prioritet på alle items i indbakken. Fortsæt?',
    url: '/api/items/reprioritize',
    formatResult: (d: Record<string, unknown>) =>
      d.updated === 0 ? 'Ingen ændringer — prioriteter ser korrekte ud.' : `${d.updated} items fik justeret prioritet eller type.`,
  },
  {
    key: 'cleanup',
    label: 'Ryd op nu',
    description: 'Arkiverer færdige items der er over 24 timer gamle. Sletter permanent arkiverede items der er over 30 dage gamle.',
    confirmText: 'Gamle arkiverede items slettes permanent. Kan ikke fortrydes. Fortsæt?',
    url: '/api/cron/cleanup',
    formatResult: (d: Record<string, unknown>) => {
      const parts = []
      if ((d.archived as number) > 0) parts.push(`${d.archived} arkiveret`)
      if ((d.deleted as number) > 0) parts.push(`${d.deleted} slettet permanent`)
      return parts.length ? parts.join(', ') + '.' : 'Intet at rydde op.'
    },
  },
  {
    key: 'reclassify',
    label: 'Re-klassificér alle',
    description: 'Kører AI-klassifikation igen på inbox-items der mangler kontekst-markering. Opdaterer type, opsummering, prioritet og evt. dato.',
    confirmText: 'AI re-klassificerer items i indbakken. Eksisterende klassifikationer overskrives. Fortsæt?',
    url: '/api/items/reclassify',
    formatResult: (d: Record<string, unknown>) =>
      d.updated === 0 ? 'Intet at re-klassificere — alle items er allerede klassificerede.' : `${d.updated} items re-klassificeret.`,
  },
]

export default function Settings() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({})
  const [actionResult, setActionResult] = useState<Record<string, string>>({})
  const [todoist, setTodoist] = useState<'idle' | 'loading'>('idle')
  const [todiostResult, setTodoistResult] = useState<ImportResult | null>(null)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const res = await fetch('/api/items/stats')
    const data = await res.json()
    setStats(data)
  }

  function setStatus(key: string, status: ActionStatus) {
    setActionStatus((prev) => ({ ...prev, [key]: status }))
  }

  function setResult(key: string, msg: string) {
    setActionResult((prev) => ({ ...prev, [key]: msg }))
  }

  async function runAction(action: typeof ACTIONS[0]) {
    setStatus(action.key, 'loading')
    setResult(action.key, '')
    try {
      const res = await fetch(action.url, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setResult(action.key, data.error ?? `Fejl (${res.status})`)
        setStatus(action.key, 'error')
      } else {
        setResult(action.key, action.formatResult(data as Record<string, unknown>))
        setStatus(action.key, 'done')
        await loadStats()
      }
    } catch (err) {
      setResult(action.key, `Noget gik galt — prøv igen. (${err instanceof Error ? err.message : 'ukendt'})`)
      setStatus(action.key, 'error')
    }
  }

  async function importTodoist() {
    setTodoist('loading')
    setTodoistResult(null)
    const res = await fetch('/api/items/import/todoist', { method: 'POST' })
    const data = await res.json()
    setTodoist('idle')
    if (!data.error) {
      setTodoistResult(data)
      await loadStats()
    }
  }

  const maxCount = stats ? Math.max(...Object.values(stats.byType), 1) : 1

  const s: Record<string, string | number | undefined> = {
    fontFamily: "'DM Mono','Courier New',monospace",
  }
  void s

  return (
    <main style={{
      background: '#080808', minHeight: '100vh',
      fontFamily: "'DM Mono','Courier New',monospace",
      color: '#F0F0F0', WebkitFontSmoothing: 'antialiased',
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

        {/* Handlinger */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#727272', marginBottom: 16, fontWeight: 400 }}>
            Handlinger
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ACTIONS.map((action) => {
              const status = actionStatus[action.key] ?? 'idle'
              const result = actionResult[action.key]
              return (
                <div key={action.key} style={{
                  border: `1px solid ${status === 'done' ? '#2A3A00' : status === 'error' ? '#3A1400' : '#262626'}`,
                  borderRadius: 10,
                  padding: '16px 18px',
                  background: status === 'done' ? '#0A0D00' : status === 'error' ? '#0D0600' : 'none',
                  transition: 'border-color 0.2s, background 0.2s',
                }}>
                  {/* Label + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500 }}>{action.label}</span>
                    {status === 'done' && <span style={{ fontSize: 11, color: '#6A9200', letterSpacing: '0.08em' }}>✓ Færdig</span>}
                    {status === 'error' && <span style={{ fontSize: 11, color: '#FF6B3C', letterSpacing: '0.08em' }}>⚠ Fejl</span>}
                  </div>

                  {/* Beskrivelse */}
                  <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
                    {action.description}
                  </p>

                  {/* Resultat */}
                  {result && (
                    <p style={{ fontSize: 12, color: status === 'error' ? '#FF6B3C' : '#8AAA00', marginBottom: 12, lineHeight: 1.5 }}>
                      {result}
                    </p>
                  )}

                  {/* Knapper */}
                  {status === 'idle' && (
                    <button
                      onClick={() => setStatus(action.key, 'confirm')}
                      style={btnStyle('#262626', '#A2A2A2')}
                    >
                      Kør nu
                    </button>
                  )}

                  {status === 'confirm' && (
                    <div>
                      <p style={{ fontSize: 12, color: '#A2A2A2', marginBottom: 10, lineHeight: 1.5 }}>
                        {action.confirmText}
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => runAction(action)}
                          style={btnStyle('rgba(232,255,60,0.15)', '#E8FF3C', '1px solid rgba(232,255,60,0.3)')}
                        >
                          Bekræft
                        </button>
                        <button
                          onClick={() => setStatus(action.key, 'idle')}
                          style={btnStyle('#1A1A1A', '#555')}
                        >
                          Annuller
                        </button>
                      </div>
                    </div>
                  )}

                  {status === 'loading' && (
                    <span style={{ fontSize: 12, color: '#4A4A4A', letterSpacing: '0.06em' }}>Arbejder…</span>
                  )}

                  {(status === 'done' || status === 'error') && (
                    <button
                      onClick={() => { setStatus(action.key, 'idle'); setResult(action.key, '') }}
                      style={{ background: 'none', border: 'none', color: '#3A3A3A', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', padding: 0, letterSpacing: '0.06em' }}
                    >
                      Kør igen
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Import */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#727272', marginBottom: 16, fontWeight: 400 }}>
            Import
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link href="/import" style={{
              display: 'block', border: '1px solid #262626', borderRadius: 10,
              color: '#A2A2A2', fontSize: 14, padding: '14px 18px', textDecoration: 'none',
            }}>
              Importer PDF eller liste →
            </Link>

            <div style={{ border: '1px solid #262626', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 14, color: '#F0F0F0', marginBottom: 6 }}>Importer fra Todoist</div>
              <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
                Henter åbne opgaver fra Todoist og importerer dem som nye items. Dubletter springes over.
              </p>
              <button
                onClick={importTodoist}
                disabled={todoist === 'loading'}
                style={btnStyle('#262626', todoist === 'loading' ? '#3A3A3A' : '#A2A2A2')}
              >
                {todoist === 'loading' ? 'Importerer…' : 'Kør import'}
              </button>
              {todiostResult && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#A2A2A2', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <span><b style={{ color: '#F0F0F0' }}>{todiostResult.found}</b> fundet</span>
                  <span><b style={{ color: '#E8FF3C' }}>{todiostResult.imported}</b> importeret</span>
                  <span><b style={{ color: '#555' }}>{todiostResult.skipped}</b> sprunget over</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Statistik */}
        {stats && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#727272', marginBottom: 20, fontWeight: 400 }}>
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
                      height: '100%', borderRadius: 3, transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#A2A2A2', width: 22, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ubrugt importResult til bagudkompatibilitet */}
        {importResult && null}
      </div>
    </main>
  )
}

function btnStyle(bg: string, color: string, border = '1px solid #262626'): React.CSSProperties {
  return {
    background: bg, border, borderRadius: 6, color,
    fontFamily: "'DM Mono','Courier New',monospace",
    fontSize: 12, padding: '8px 14px', cursor: 'pointer',
    touchAction: 'manipulation', letterSpacing: '0.04em',
  }
}
