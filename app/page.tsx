'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Item } from '@/lib/supabase'
import {
  ContextTrigger,
  CONTEXT_META,
  detectCurrentContext,
  getRelevantTriggers,
  getContextOverride,
  setContextOverride,
  clearContextOverride,
} from '@/lib/context'

const TYPE_LABELS: Record<string, string> = {
  task: 'Opgave',
  note: 'Note',
  idea: 'Idé',
  reminder: 'Påmindelse',
  someday: 'Engang',
  none: 'Ingen handling',
}

const TYPE_COLORS: Record<string, string> = {
  task: '#E8FF3C',
  note: '#C8C8C8',
  idea: '#FF9B3C',
  reminder: '#3CDFFF',
  someday: '#C4B5FD',
  none: '#666666',
}

const PRIORITY_DOT = (p: number) => {
  if (p >= 5) return '●●●'
  if (p >= 4) return '●●○'
  if (p >= 3) return '●○○'
  return '○○○'
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [contextItems, setContextItems] = useState<Item[]>([])
  const [currentContext, setCurrentContext] = useState<ContextTrigger>('anytime')
  const [bannerOpen, setBannerOpen] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<number | null>(null)
  const [backlogItems, setBacklogItems] = useState<Item[]>([])
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefType, setBriefType] = useState<string | null>(null)
  const [briefTime, setBriefTime] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [duplicate, setDuplicate] = useState<{ existing: Item; pending: string } | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [cmdResults, setCmdResults] = useState<Item[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    fetchItems()
    fetchBacklog()
    if (window.innerWidth > 768) {
      textareaRef.current?.focus()
    }
    const override = getContextOverride()
    const ctx = override ?? detectCurrentContext()
    setCurrentContext(ctx)
    fetchContextItems(ctx)
  }, [])

  async function fetchItems() {
    setLoading(true)
    const res = await fetch('/api/items')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchContextItems(ctx: ContextTrigger) {
    const triggers = getRelevantTriggers(ctx)
    if (ctx === 'anytime') { setContextItems([]); return }
    const res = await fetch(`/api/items/context?triggers=${triggers.join(',')}`)
    const data = await res.json()
    setContextItems(Array.isArray(data) ? data : [])
  }

  function handleContextSelect(ctx: ContextTrigger) {
    if (ctx === currentContext) {
      clearContextOverride()
      const auto = detectCurrentContext()
      setCurrentContext(auto)
      fetchContextItems(auto)
    } else {
      setContextOverride(ctx)
      setCurrentContext(ctx)
      fetchContextItems(ctx)
    }
    setBannerOpen(false)
  }

  async function handleReclassify() {
    setReclassifying(true)
    setReclassifyResult(null)
    const res = await fetch('/api/items/reclassify', { method: 'POST' })
    const data = await res.json()
    setReclassifyResult(data.updated ?? 0)
    setReclassifying(false)
    fetchItems()
    fetchContextItems(currentContext)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function generateBrief(type: string) {
    setBriefLoading(true)
    setBriefText('')
    setBriefType(type)
    setBriefTime(null)
    const res = await fetch('/api/brief/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    if (!res.body) { setBriefLoading(false); return }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      setBriefText(text)
    }
    setBriefLoading(false)
    setBriefTime(new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }))
  }

  const searchItems = useCallback(async (q: string) => {
    if (!q.trim()) { setCmdResults([]); return }
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase
      .from('items')
      .select('*')
      .ilike('raw_input', `%${q}%`)
      .limit(8)
    setCmdResults(data ?? [])
  }, [])

  async function handleSubmit(e?: React.FormEvent, force = false) {
    e?.preventDefault()
    if (!input.trim() || classifying) return

    setClassifying(true)
    const rawInput = input.trim()
    const optimisticId = 'temp-' + Date.now()
    const optimistic: Item = {
      id: optimisticId,
      raw_input: rawInput,
      ai_type: 'none',
      ai_summary: '...',
      ai_context: null,
      ai_priority: 3,
      context_trigger: null,
      status: 'inbox',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems((prev) => [optimistic, ...prev])
    setInput('')

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input: rawInput, force }),
    })

    if (!res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== optimisticId))
      setInput(rawInput)
      showToast('Kunne ikke gemme — prøv igen')
      setClassifying(false)
      return
    }

    const data = await res.json()

    if (data.duplicate) {
      setItems((prev) => prev.filter((i) => i.id !== optimisticId))
      setInput(rawInput)
      setDuplicate({ existing: data.existing_item, pending: rawInput })
      setClassifying(false)
      return
    }

    setItems((prev) => prev.map((i) => (i.id === optimisticId ? data : i)))
    setClassifying(false)
  }

  async function fetchBacklog() {
    const res = await fetch('/api/items/backlog')
    const data = await res.json()
    setBacklogItems(Array.isArray(data) ? data : [])
  }

  async function markDone(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setBacklogItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
  }

  async function archive(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setBacklogItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
  }

  async function moveToBacklog(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'backlog' }),
    })
    const updated = await res.json()
    setBacklogItems((prev) => [updated, ...prev])
  }

  async function moveToInbox(id: string) {
    setBacklogItems((prev) => prev.filter((i) => i.id !== id))
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inbox' }),
    })
    const updated = await res.json()
    setItems((prev) => [updated, ...prev])
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    mediaRecorderRef.current?.stop()
    setRecording(false)
    setInterimText('')
  }

  async function startRecording() {
    type SREvent = { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }
    type SR = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: SREvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }
    const w = window as Window & { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition

    if (SpeechRecognitionCtor) {
      const recognition = new SpeechRecognitionCtor()
      recognition.lang = 'da-DK'
      recognition.continuous = false
      recognition.interimResults = true
      recognitionRef.current = recognition
      setRecording(true)

      recognition.onresult = (e: SREvent) => {
        let interim = ''
        let final = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final += t
          else interim += t
        }
        setInterimText(interim)
        if (final) {
          setInput((prev) => (prev ? prev + ' ' + final : final))
          setInterimText('')
        }
      }
      recognition.onerror = () => { setRecording(false); setInterimText('') }
      recognition.onend = () => { setRecording(false); setInterimText('') }
      recognition.start()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const form = new FormData()
        form.append('file', blob, 'audio.webm')
        setInterimText('Transskriberer…')
        const res = await fetch('/api/transcribe', { method: 'POST', body: form })
        const data = await res.json()
        if (data.text) setInput((prev) => (prev ? prev + ' ' + data.text : data.text))
        setInterimText('')
        setRecording(false)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      setRecording(false)
    }
  }

  function handleMicPress() {
    if (recording) stopRecording()
    else startRecording()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
    if (e.key === 'Escape') setInput('')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
        setCmdQuery('')
        setCmdResults([])
      }
      if (e.key === 'Escape') setCmdOpen(false)
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (cmdOpen) setTimeout(() => cmdInputRef.current?.focus(), 50)
  }, [cmdOpen])

  useEffect(() => {
    searchItems(cmdQuery)
  }, [cmdQuery, searchItems])

  const top3 = items.filter((i) => i.ai_priority >= 4).slice(0, 3)
  const rest = items.filter((i) => !top3.find((t) => t.id === i.id))

  return (
    <main className="apai-root">
      {/* Header */}
      <header className="apai-header">
        <span className="apai-logo">APAI</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="apai-count">{items.length} i indbakken</span>
          <Link href="/settings" className="header-settings-link" title="Indstillinger">⚙</Link>
        </div>
      </header>

      {/* Capture */}
      <section className="capture-section">
        <div className="capture-box">
          <textarea
            ref={textareaRef}
            className="capture-input"
            placeholder="Hvad er i din hjerne lige nu…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={classifying}
          />
          <button
            className={`mic-btn ${recording ? 'recording' : ''}`}
            onPointerDown={handleMicPress}
            aria-label={recording ? 'Stop optagelse' : 'Optag tale'}
          >
            {recording ? '⏹' : '🎙'}
          </button>
        </div>
        {(recording || interimText) && (
          <div className="listening-bar">
            <span className="listening-dot" />
            <span className="listening-text">
              {interimText || 'Lytter…'}
            </span>
          </div>
        )}
        <div className="capture-footer">
          <span className="capture-hint">⌘↵ sender</span>
          <button
            className="capture-btn"
            onClick={() => handleSubmit()}
            disabled={!input.trim() || classifying}
          >
            {classifying ? 'Klassificerer…' : 'Dump det'}
          </button>
        </div>
      </section>

      {/* Top 3 */}
      {top3.length > 0 && (
        <section className="priority-section">
          <h2 className="section-label">Vigtigst nu</h2>
          <div className="item-list">
            {top3.map((item) => (
              <ItemCard key={item.id} item={item} onDone={markDone} onArchive={archive} onBacklog={moveToBacklog} />
            ))}
          </div>
        </section>
      )}

      {/* Resten */}
      {rest.length > 0 && (
        <section className="inbox-section">
          <h2 className="section-label">Indbakke</h2>
          <div className="item-list">
            {rest.map((item) => (
              <ItemCard key={item.id} item={item} onDone={markDone} onArchive={archive} onBacklog={moveToBacklog} />
            ))}
          </div>
        </section>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          Alt er styr.<br />Dump din næste tanke herover.
        </div>
      )}

      {/* Backlog */}
      {backlogItems.length > 0 && (
        <section className="backlog-section">
          <button className="backlog-toggle" onClick={() => setBacklogOpen((o) => !o)}>
            <span>Backlog</span>
            <span className="backlog-count">{backlogItems.length} {backlogOpen ? '▲' : '▼'}</span>
          </button>
          {backlogOpen && (
            <div className="item-list" style={{ marginTop: 8 }}>
              {backlogItems.map((item) => (
                <ItemCard key={item.id} item={item} onDone={markDone} onArchive={archive} onBacklog={moveToInbox} isBacklog />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Brief */}
      <section className="brief-section">
        <h2 className="section-label" style={{ marginBottom: 10 }}>Daglig brief</h2>
        <div className="brief-btns">
          {[['morning','🌅','Morgen'],['midday','☀️','Middag'],['afternoon','🕓','Eftermiddag'],['shutdown','🌙','Shutdown']].map(([t,icon,label]) => (
            <button key={t} className={`brief-btn ${briefType === t ? 'active' : ''}`} onClick={() => generateBrief(t)} disabled={briefLoading}>
              {icon} {label}
            </button>
          ))}
        </div>
        {(briefLoading || briefText) && (
          <div className="brief-box">
            <p className="brief-text">
              {briefText}
              {briefLoading && <span className="brief-cursor">▌</span>}
            </p>
            {briefTime && <span className="brief-timestamp">Genereret {briefTime}</span>}
          </div>
        )}
      </section>

      {/* Kontekst-vælger (desktop only — mobile via bottom dock) */}
      <div className="context-picker">
        {(['morning', 'work', 'leaving', 'evening'] as ContextTrigger[]).map((ctx) => (
          <button
            key={ctx}
            className={`context-pick-btn ${currentContext === ctx ? 'active' : ''}`}
            onClick={() => handleContextSelect(ctx)}
            title={CONTEXT_META[ctx].label ?? ctx}
          >
            {CONTEXT_META[ctx].icon}
          </button>
        ))}
      </div>

      {/* Reklassificér */}
      <div className="reclassify-row">
        <button className="reclassify-btn" onClick={handleReclassify} disabled={reclassifying}>
          {reclassifying ? 'Opdaterer…' : 'Opdatér klassificering'}
        </button>
        {reclassifyResult !== null && (
          <span className="reclassify-result">{reclassifyResult} opdateret</span>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Duplikat-advarsel */}
      {duplicate && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-title">Det her ligner noget du allerede har gemt</p>
            <div className="modal-existing">
              {duplicate.existing.ai_summary || duplicate.existing.raw_input}
            </div>
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => { setDuplicate(null); setInput(duplicate.pending); setTimeout(() => handleSubmit(undefined, true), 0) }}>
                Gem alligevel
              </button>
              <button className="modal-btn secondary" onClick={() => setDuplicate(null)}>
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command palette */}
      {cmdOpen && (
        <div className="modal-overlay" onClick={() => setCmdOpen(false)}>
          <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
            <input
              ref={cmdInputRef}
              className="cmd-input"
              placeholder="Søg i alle items…"
              value={cmdQuery}
              onChange={(e) => setCmdQuery(e.target.value)}
            />
            <div className="cmd-results">
              {cmdResults.length === 0 && cmdQuery && (
                <div className="cmd-empty">Ingen resultater</div>
              )}
              {cmdResults.map((item) => (
                <div key={item.id} className="cmd-item">
                  <span className="cmd-item-summary">{item.ai_summary || item.raw_input}</span>
                  <span className="cmd-item-meta">{item.ai_type} · prio {item.ai_priority}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom dock — mobile only */}
      <nav className="bottom-dock">
        <div className="dock-context">
          {(['morning', 'work', 'leaving', 'evening'] as ContextTrigger[]).map((ctx) => (
            <button
              key={ctx}
              className={`dock-ctx-btn ${currentContext === ctx ? 'active' : ''}`}
              onClick={() => handleContextSelect(ctx)}
              aria-label={String(CONTEXT_META[ctx].label ?? ctx)}
            >
              {CONTEXT_META[ctx].icon}
            </button>
          ))}
        </div>
        <Link href="/settings" className="dock-settings-btn" title="Indstillinger">⚙</Link>
      </nav>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080808;
          --surface: #111111;
          --surface-2: #1C1C1C;
          --border: #262626;
          --border-2: #363636;
          --text-1: #F0F0F0;
          --text-2: #A2A2A2;
          --text-3: #727272;
          --accent: #E8FF3C;
          --accent-bg: rgba(232,255,60,0.07);
          --danger: #FF6B3C;
          --radius: 10px;
          --radius-sm: 6px;
        }

        body {
          background: var(--bg);
          color: var(--text-1);
          font-family: 'DM Mono', 'Courier New', monospace;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        .apai-root {
          max-width: 680px;
          margin: 0 auto;
          padding: 24px 18px 160px;
        }

        /* ─── Header ─── */
        .apai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .apai-logo {
          font-size: 11px;
          letter-spacing: 0.4em;
          color: var(--accent);
          font-weight: 700;
          text-transform: uppercase;
        }

        .apai-count {
          font-size: 12px;
          color: var(--text-3);
          letter-spacing: 0.06em;
        }

        .header-settings-link {
          color: var(--text-3);
          text-decoration: none;
          font-size: 18px;
          line-height: 1;
          padding: 4px;
          transition: color 0.15s;
        }

        .header-settings-link:hover { color: var(--text-2); }

        /* ─── Capture ─── */
        .capture-section {
          margin-bottom: 40px;
        }

        .capture-box {
          position: relative;
        }

        .capture-input {
          width: 100%;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          color: var(--text-1);
          font-family: inherit;
          font-size: 16px;
          line-height: 1.65;
          padding: 18px 72px 18px 18px;
          resize: none;
          outline: none;
          transition: border-color 0.15s;
          min-height: 110px;
        }

        .capture-input:focus {
          border-color: var(--accent);
        }

        .capture-input::placeholder {
          color: var(--text-3);
        }

        .mic-btn {
          position: absolute;
          bottom: 14px;
          right: 14px;
          width: 46px;
          height: 46px;
          background: var(--surface-2);
          border: 1.5px solid var(--border);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .mic-btn:hover { border-color: var(--border-2); }

        .mic-btn.recording {
          border-color: var(--accent);
          background: var(--accent-bg);
          animation: pulse 1.2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,255,60,0.35); }
          50% { box-shadow: 0 0 0 10px rgba(232,255,60,0); }
        }

        .listening-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          padding: 10px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          min-height: 40px;
        }

        .listening-dot {
          width: 7px;
          height: 7px;
          background: var(--accent);
          border-radius: 50%;
          flex-shrink: 0;
          animation: blink 1s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }

        .listening-text {
          font-size: 13px;
          color: var(--text-2);
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .capture-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          margin-top: 10px;
          gap: 12px;
        }

        .capture-hint {
          font-size: 11px;
          color: var(--text-3);
          letter-spacing: 0.05em;
        }

        .capture-btn {
          background: var(--accent);
          color: #080808;
          border: none;
          border-radius: var(--radius-sm);
          padding: 12px 24px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: opacity 0.15s;
          touch-action: manipulation;
        }

        .capture-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        /* ─── Sections ─── */
        .section-label {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 12px;
          font-weight: 400;
        }

        .priority-section { margin-bottom: 36px; }
        .inbox-section { margin-bottom: 36px; }

        .item-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* ─── Item card ─── */
        .item-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
          overflow: hidden;
          touch-action: pan-y;
          user-select: none;
          transition: border-color 0.15s;
        }

        .item-card:hover { border-color: var(--border-2); }

        .item-card.priority-high {
          border-left: 3px solid var(--accent);
        }

        .item-card.flash-done {
          background: #0D1800;
          transition: background 0.3s;
        }

        .item-card.flash-archive {
          background: #1A0D00;
          transition: background 0.3s;
        }

        .swipe-hint {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0;
          pointer-events: none;
          font-weight: 700;
        }

        .swipe-hint.left-hint { left: 16px; color: var(--accent); }
        .swipe-hint.right-hint { right: 16px; color: var(--danger); }

        .item-body { flex: 1; }

        .item-summary {
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-1);
        }

        .item-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .item-type {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 3px 7px;
          border-radius: 4px;
          font-weight: 600;
        }

        .item-context {
          font-size: 12px;
          color: var(--text-2);
        }

        .item-priority {
          font-size: 11px;
          color: var(--text-3);
          letter-spacing: 0.04em;
        }

        .item-raw {
          font-size: 12px;
          color: var(--text-3);
          margin-top: 6px;
          line-height: 1.45;
          font-style: italic;
        }

        .item-actions {
          display: flex;
          flex-direction: row;
          gap: 6px;
          padding-top: 4px;
          border-top: 1px solid var(--border);
        }

        .action-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-2);
          font-family: inherit;
          font-size: 12px;
          padding: 7px 12px;
          cursor: pointer;
          transition: all 0.12s;
          white-space: nowrap;
          touch-action: manipulation;
          flex: 1;
          text-align: center;
        }

        .action-btn:hover { border-color: var(--border-2); color: var(--text-1); }
        .action-btn.done:hover { border-color: var(--accent); color: var(--accent); }

        /* ─── Empty state ─── */
        .empty-state {
          text-align: center;
          color: var(--text-3);
          font-size: 14px;
          line-height: 2;
          margin-top: 80px;
        }

        /* ─── Brief ─── */
        .brief-section {
          margin-top: 48px;
          padding-top: 32px;
          border-top: 1px solid var(--border);
          margin-bottom: 24px;
        }

        .brief-btns {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
          overflow-x: auto;
          padding-bottom: 2px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .brief-btns::-webkit-scrollbar { display: none; }

        .brief-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 20px;
          color: var(--text-2);
          font-family: inherit;
          font-size: 12px;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.04em;
          white-space: nowrap;
          flex-shrink: 0;
          touch-action: manipulation;
        }

        .brief-btn:hover { border-color: var(--border-2); color: var(--text-1); }
        .brief-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
        .brief-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .brief-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
        }

        .brief-text {
          font-size: 14px;
          line-height: 1.75;
          color: var(--text-1);
          white-space: pre-wrap;
        }

        .brief-cursor {
          animation: blink 0.8s step-end infinite;
          color: var(--accent);
        }

        .brief-timestamp {
          display: block;
          font-size: 11px;
          color: var(--text-3);
          margin-top: 12px;
          letter-spacing: 0.04em;
        }

        /* ─── Context picker (desktop) ─── */
        .context-picker {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-top: 12px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        .context-pick-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 16px;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .context-pick-btn:hover { border-color: var(--border-2); }
        .context-pick-btn.active { border-color: var(--accent); background: var(--accent-bg); }

        /* ─── Reclassify ─── */
        .reclassify-row {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          margin-top: 16px;
        }

        .reclassify-btn {
          background: none;
          border: none;
          color: var(--text-3);
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: color 0.15s;
          padding: 8px 0;
        }

        .reclassify-btn:hover { color: var(--text-2); }
        .reclassify-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .reclassify-result {
          font-size: 11px;
          color: var(--accent);
        }

        /* ─── Backlog ─── */
        .backlog-section {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .backlog-toggle {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: none;
          border: none;
          color: var(--text-2);
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 0;
          margin-bottom: 4px;
          touch-action: manipulation;
        }

        .backlog-toggle:hover { color: var(--text-1); }

        .backlog-count {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        /* ─── Toast ─── */
        .toast {
          position: fixed;
          bottom: 90px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          border-radius: var(--radius-sm);
          padding: 12px 24px;
          font-size: 13px;
          color: var(--accent);
          z-index: 300;
          white-space: nowrap;
        }

        /* ─── Modal ─── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }

        .modal {
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: var(--radius);
          padding: 24px;
          max-width: 420px;
          width: 100%;
        }

        .modal-title {
          font-size: 13px;
          color: var(--text-2);
          margin-bottom: 14px;
          letter-spacing: 0.02em;
        }

        .modal-existing {
          font-size: 15px;
          color: var(--text-1);
          padding: 14px;
          background: var(--bg);
          border-radius: var(--radius-sm);
          margin-bottom: 18px;
          line-height: 1.55;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
        }

        .modal-btn {
          flex: 1;
          padding: 13px;
          border: 1.5px solid var(--accent);
          border-radius: var(--radius-sm);
          background: none;
          color: var(--accent);
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .modal-btn.secondary {
          border-color: var(--border-2);
          color: var(--text-2);
        }

        /* ─── Command palette ─── */
        .cmd-palette {
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: var(--radius);
          width: 100%;
          max-width: 540px;
          overflow: hidden;
        }

        .cmd-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          color: var(--text-1);
          font-family: inherit;
          font-size: 16px;
          padding: 18px 22px;
          outline: none;
        }

        .cmd-results {
          max-height: 320px;
          overflow-y: auto;
        }

        .cmd-empty {
          padding: 18px 22px;
          font-size: 13px;
          color: var(--text-3);
        }

        .cmd-item {
          padding: 14px 22px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.1s;
        }

        .cmd-item:hover { background: var(--surface-2); }

        .cmd-item-summary {
          display: block;
          font-size: 14px;
          color: var(--text-1);
          margin-bottom: 3px;
        }

        .cmd-item-meta {
          font-size: 11px;
          color: var(--text-3);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* ─── Bottom dock (mobile) ─── */
        .bottom-dock {
          display: none;
        }

        /* ─── Mobile ─── */
        @media (max-width: 640px) {
          .apai-root {
            padding: 20px 14px 140px;
          }

          .apai-header {
            margin-bottom: 20px;
          }

          .header-settings-link {
            display: none; /* settings accessible via bottom dock */
          }

          .capture-input {
            font-size: 17px;
            min-height: 130px;
            padding: 16px 72px 16px 16px;
          }

          .mic-btn {
            width: 58px;
            height: 58px;
            font-size: 26px;
            bottom: 12px;
            right: 12px;
          }

          .capture-btn {
            flex: 1;
            padding: 16px;
            font-size: 15px;
            text-align: center;
          }

          .capture-footer {
            justify-content: stretch;
          }

          .capture-hint { display: none; }

          .item-card {
            padding: 14px;
          }

          .item-summary {
            font-size: 15px;
          }

          .item-actions {
            gap: 6px;
          }

          .action-btn {
            font-size: 12px;
            padding: 9px 8px;
          }

          /* Show bottom dock on mobile */
          .bottom-dock {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--surface);
            border-top: 1px solid var(--border);
            padding: 10px 20px;
            padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
            z-index: 100;
          }

          /* Hide inline context picker on mobile (it's in the dock) */
          .context-picker { display: none; }

          .toast { bottom: 100px; }
        }

        /* ─── Dock buttons ─── */
        .dock-context {
          display: flex;
          gap: 4px;
        }

        .dock-ctx-btn {
          background: none;
          border: 1.5px solid transparent;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 22px;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
          line-height: 1;
        }

        .dock-ctx-btn:hover { background: var(--surface-2); }
        .dock-ctx-btn.active { border-color: var(--accent); background: var(--accent-bg); }

        .dock-settings-btn {
          color: var(--text-3);
          text-decoration: none;
          font-size: 22px;
          padding: 8px 10px;
          border-radius: 8px;
          transition: all 0.15s;
          line-height: 1;
        }

        .dock-settings-btn:hover { color: var(--text-1); background: var(--surface-2); }
      `}</style>
    </main>
  )
}

function ItemCard({
  item,
  onDone,
  onArchive,
  onBacklog,
  isBacklog = false,
}: {
  item: Item
  onDone: (id: string) => void
  onArchive: (id: string) => void
  onBacklog?: (id: string) => void
  isBacklog?: boolean
}) {
  const isTemp = item.id.startsWith('temp-')
  const color = TYPE_COLORS[item.ai_type] || '#666666'
  const cardRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const [hintOpacity, setHintOpacity] = useState({ left: 0, right: 0 })
  const [flashClass, setFlashClass] = useState('')

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    currentXRef.current = 0
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startXRef.current
    currentXRef.current = dx
    const card = cardRef.current
    if (!card) return
    card.style.transform = `translateX(${dx}px)`
    card.style.transition = 'none'
    const ratio = Math.min(Math.abs(dx) / 80, 1)
    if (dx > 0) setHintOpacity({ left: ratio, right: 0 })
    else setHintOpacity({ left: 0, right: ratio })
  }

  function onTouchEnd() {
    const dx = currentXRef.current
    const card = cardRef.current
    if (!card) return
    card.style.transition = 'transform 0.2s ease'
    card.style.transform = ''
    setHintOpacity({ left: 0, right: 0 })

    if (dx > 80) {
      setFlashClass('flash-done')
      setTimeout(() => onDone(item.id), 300)
    } else if (dx < -80) {
      setFlashClass('flash-archive')
      setTimeout(() => onArchive(item.id), 300)
    }
  }

  return (
    <div
      ref={cardRef}
      className={`item-card ${item.ai_priority >= 4 ? 'priority-high' : ''} ${flashClass}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <span className="swipe-hint left-hint" style={{ opacity: hintOpacity.left }}>Færdig ✓</span>
      <span className="swipe-hint right-hint" style={{ opacity: hintOpacity.right }}>Arkiver →</span>
      <div className="item-body">
        <div className="item-summary">{item.ai_summary || item.raw_input}</div>
        <div className="item-meta">
          <span className="item-type" style={{ background: color + '18', color }}>
            {TYPE_LABELS[item.ai_type] || 'Ukendt'}
          </span>
          {item.ai_context && (
            <span className="item-context">↳ {item.ai_context}</span>
          )}
          <span className="item-priority">{PRIORITY_DOT(item.ai_priority)}</span>
        </div>
        {item.ai_summary && item.ai_summary !== item.raw_input && (
          <div className="item-raw">{item.raw_input}</div>
        )}
      </div>
      {!isTemp && (
        <div className="item-actions">
          <button className="action-btn done" onClick={() => onDone(item.id)}>Færdig</button>
          {!isBacklog && onBacklog && (
            <button className="action-btn" onClick={() => onBacklog(item.id)}>Backlog</button>
          )}
          {isBacklog && (
            <button className="action-btn" onClick={() => onBacklog?.(item.id)}>→ Indbakke</button>
          )}
          <button className="action-btn" onClick={() => onArchive(item.id)}>Arkiver</button>
        </div>
      )}
    </div>
  )
}
