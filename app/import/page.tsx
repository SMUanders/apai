'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type Step = 'input' | 'preview' | 'importing' | 'done'
type Mode = 'pdf' | 'text'

interface DuplicateHit {
  line: string
  similar_to: string
  similar_id: string
}

const BATCH_SIZE = 10

export default function ImportPage() {
  const [step, setStep] = useState<Step>('input')
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [selected, setSelected] = useState<boolean[]>([])
  const [source, setSource] = useState<string>('text')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [totalImported, setTotalImported] = useState(0)
  const [allDuplicates, setAllDuplicates] = useState<DuplicateHit[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function analyse() {
    setParseError('')
    setParsing(true)

    try {
      let res: Response
      if (mode === 'pdf' && pdfFile) {
        const fd = new FormData()
        fd.append('file', pdfFile)
        res = await fetch('/api/items/import/parse', { method: 'POST', body: fd })
      } else {
        if (!text.trim()) { setParseError('Indsæt en liste først'); setParsing(false); return }
        res = await fetch('/api/items/import/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      }

      const data = await res.json()
      if (!res.ok || data.error) { setParseError(data.error ?? 'Parsing fejlede'); setParsing(false); return }

      setLines(data.lines)
      setSelected(data.lines.map(() => true))
      setSource(data.source)
      setStep('preview')
    } catch (e) {
      setParseError(`Netværksfejl: ${e}`)
    }
    setParsing(false)
  }

  async function importLines() {
    const chosen = lines.filter((_, i) => selected[i])
    if (!chosen.length) return

    setStep('importing')
    setProgress({ done: 0, total: chosen.length })
    setTotalImported(0)
    setAllDuplicates([])
    setErrors([])

    let imported = 0
    const dupes: DuplicateHit[] = []
    const errs: string[] = []

    for (let i = 0; i < chosen.length; i += BATCH_SIZE) {
      const batch = chosen.slice(i, i + BATCH_SIZE)
      try {
        const res = await fetch('/api/items/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: batch, source }),
        })
        const data = await res.json()
        imported += data.imported ?? 0
        dupes.push(...(data.duplicates ?? []))
        errs.push(...(data.errors ?? []))
      } catch {
        errs.push(...batch)
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, chosen.length), total: chosen.length })
    }

    setTotalImported(imported)
    setAllDuplicates(dupes)
    setErrors(errs)
    setStep('done')
  }

  function toggleAll(val: boolean) {
    setSelected(selected.map(() => val))
  }

  const selectedCount = selected.filter(Boolean).length

  return (
    <main style={{
      background: '#080808', minHeight: '100vh',
      fontFamily: "'DM Mono','Courier New',monospace",
      color: '#F0F0F0', WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 18px 80px' }}>

        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.4em', color: '#E8FF3C', fontWeight: 700, textTransform: 'uppercase' }}>
            APAI · Import
          </span>
          <Link href="/" style={{ fontSize: 12, color: '#A2A2A2', textDecoration: 'none' }}>← Indbakke</Link>
        </header>

        {/* STEP: INPUT */}
        {step === 'input' && (
          <div>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #262626' }}>
              {(['text', 'pdf'] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  background: 'none', border: 'none', borderBottom: mode === m ? '2px solid #E8FF3C' : '2px solid transparent',
                  color: mode === m ? '#F0F0F0' : '#727272', fontFamily: 'inherit', fontSize: 13,
                  padding: '10px 20px 10px 0', cursor: 'pointer', marginBottom: -1, letterSpacing: '0.05em',
                }}>
                  {m === 'text' ? 'Indsæt liste' : 'Upload PDF'}
                </button>
              ))}
            </div>

            {mode === 'text' ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Indsæt opgaver — én per linje:\n\nRing til tandlæge\nKøb fødselsdagsgave til Maja\nSend tilbud til kunde\nBook hotel til konference'}
                style={{
                  width: '100%', minHeight: 220, background: '#111', border: '1px solid #262626',
                  borderRadius: 8, color: '#F0F0F0', fontFamily: 'inherit', fontSize: 14,
                  padding: '14px 16px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  lineHeight: 1.6,
                }}
              />
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '1px dashed #363636', borderRadius: 8, padding: '48px 24px',
                  textAlign: 'center', cursor: 'pointer', background: pdfFile ? '#111' : 'transparent',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ fontSize: 13, color: pdfFile ? '#E8FF3C' : '#727272', marginBottom: 8 }}>
                  {pdfFile ? `📄 ${pdfFile.name}` : '+ Klik for at vælge PDF'}
                </div>
                {pdfFile && (
                  <div style={{ fontSize: 11, color: '#555' }}>
                    {(pdfFile.size / 1024).toFixed(0)} KB
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            {parseError && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#FF6B6B' }}>{parseError}</div>
            )}

            <button
              onClick={analyse}
              disabled={parsing || (mode === 'pdf' && !pdfFile) || (mode === 'text' && !text.trim())}
              style={{
                marginTop: 16, width: '100%', background: parsing ? '#1C1C1C' : '#E8FF3C',
                border: 'none', borderRadius: 8, color: parsing ? '#4A4A4A' : '#080808',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '14px',
                cursor: 'pointer', touchAction: 'manipulation', transition: 'background 0.15s',
              }}
            >
              {parsing ? 'Analyserer…' : 'Analysér'}
            </button>
          </div>
        )}

        {/* STEP: PREVIEW */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#727272' }}>
                {lines.length} linjer fundet · {selectedCount} valgt
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => toggleAll(true)} style={smallBtn}>Vælg alle</button>
                <button onClick={() => toggleAll(false)} style={smallBtn}>Fravælg alle</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
              {lines.map((line, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
                  background: selected[i] ? '#111' : '#0C0C0C',
                  border: `1px solid ${selected[i] ? '#363636' : '#1C1C1C'}`,
                  borderRadius: 6, cursor: 'pointer', transition: 'all 0.1s',
                }}>
                  <input
                    type="checkbox"
                    checked={selected[i]}
                    onChange={(e) => {
                      const next = [...selected]
                      next[i] = e.target.checked
                      setSelected(next)
                    }}
                    style={{ marginTop: 2, accentColor: '#E8FF3C', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: selected[i] ? '#F0F0F0' : '#4A4A4A', lineHeight: 1.5 }}>
                    {line}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('input')} style={{
                flex: 1, background: 'none', border: '1px solid #262626', borderRadius: 8,
                color: '#A2A2A2', fontFamily: 'inherit', fontSize: 13, padding: '12px',
                cursor: 'pointer', touchAction: 'manipulation',
              }}>
                ← Tilbage
              </button>
              <button
                onClick={importLines}
                disabled={selectedCount === 0}
                style={{
                  flex: 2, background: selectedCount ? '#E8FF3C' : '#1C1C1C',
                  border: 'none', borderRadius: 8, color: selectedCount ? '#080808' : '#4A4A4A',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '12px',
                  cursor: selectedCount ? 'pointer' : 'default', touchAction: 'manipulation',
                }}
              >
                Importér {selectedCount} opgave{selectedCount !== 1 ? 'r' : ''}
              </button>
            </div>
          </div>
        )}

        {/* STEP: IMPORTING */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 13, color: '#727272', marginBottom: 16 }}>
              Klassificerer og gemmer…
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#E8FF3C', marginBottom: 8 }}>
              {progress.done} / {progress.total}
            </div>
            <div style={{
              width: '100%', height: 4, background: '#1C1C1C', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', background: '#E8FF3C', borderRadius: 2,
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* STEP: DONE */}
        {step === 'done' && (
          <div>
            <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#E8FF3C' }}>{totalImported}</div>
                <div style={{ fontSize: 12, color: '#727272', marginTop: 4 }}>importeret</div>
              </div>
              {allDuplicates.length > 0 && (
                <div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#F0F0F0' }}>{allDuplicates.length}</div>
                  <div style={{ fontSize: 12, color: '#727272', marginTop: 4 }}>mulige dubletter</div>
                </div>
              )}
              {errors.length > 0 && (
                <div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#FF6B6B' }}>{errors.length}</div>
                  <div style={{ fontSize: 12, color: '#727272', marginTop: 4 }}>fejlede</div>
                </div>
              )}
            </div>

            {allDuplicates.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#727272', marginBottom: 12 }}>
                  Mulige dubletter — ikke importeret
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allDuplicates.map((d, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', background: '#111', border: '1px solid #262626',
                      borderRadius: 6, fontSize: 13,
                    }}>
                      <div style={{ color: '#F0F0F0', marginBottom: 4 }}>{d.line}</div>
                      <div style={{ color: '#555', fontSize: 12 }}>
                        Ligner: <span style={{ color: '#A2A2A2' }}>{d.similar_to}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 10 }}>
                  Disse er ikke gemt. Find dem i indbakken og vurder selv om de er dubletter.
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#FF6B6B', marginBottom: 8 }}>Disse kunne ikke importeres:</div>
                {errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#555', padding: '4px 0' }}>• {e}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/" style={{
                flex: 2, display: 'block', textAlign: 'center', background: '#E8FF3C',
                borderRadius: 8, color: '#080808', fontFamily: 'inherit', fontSize: 14,
                fontWeight: 700, padding: '14px', textDecoration: 'none',
              }}>
                Gå til indbakken
              </Link>
              <button
                onClick={() => { setStep('input'); setLines([]); setSelected([]); setText(''); setPdfFile(null) }}
                style={{
                  flex: 1, background: 'none', border: '1px solid #262626', borderRadius: 8,
                  color: '#A2A2A2', fontFamily: 'inherit', fontSize: 13, padding: '14px',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                Importér mere
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

const smallBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#555', fontFamily: "'DM Mono','Courier New',monospace",
  fontSize: 11, cursor: 'pointer', padding: '2px 0', textDecoration: 'underline',
  touchAction: 'manipulation',
}
