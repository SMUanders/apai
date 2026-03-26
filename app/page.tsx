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
  note: '#B8B8B8',
  idea: '#FF9B3C',
  reminder: '#3CDFFF',
  someday: '#C4B5FD',
  none: '#555555',
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

    // Fallback: hold-to-record → Whisper
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
      <header className="apai-header">
        <span className="apai-logo">APAI</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="apai-count">{items.length} i indbakken</span>
          <Link href="/settings" style={{ color: '#333', textDecoration: 'none', fontSize: 16 }} title="Indstillinger">⚙</Link>
        </div>
      </header>

      {/* Brief */}
      <section className="brief-section">
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
        {!briefText && !briefLoading && (
          <p className="brief-empty">Tryk en knap for en kort briefing.</p>
        )}
      </section>

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
          <span className="capture-hint">⌘↵ for at sende</span>
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

      {/* Kontekst-vælger */}
      <div className="context-picker">
        {(['morning', 'work', 'leaving', 'evening'] as ContextTrigger[]).map((ctx) => (
          <button
            key={ctx}
            className={`context-pick-btn ${currentContext === ctx ? 'active' : ''}`}
            onClick={() => handleContextSelect(ctx)}
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

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0E0E0E;
          color: #E8E8E8;
          font-family: 'DM Mono', 'Courier New', monospace;
          min-height: 100vh;
        }

        .apai-root {
          max-width: 680px;
          margin: 0 auto;
          padding: 32px 20px 80px;
        }

        .apai-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 32px;
        }

        .apai-logo {
          font-size: 11px;
          letter-spacing: 0.35em;
          color: #E8FF3C;
          font-weight: 700;
          text-transform: uppercase;
        }

        .apai-count {
          font-size: 11px;
          color: #666;
          letter-spacing: 0.1em;
        }

        .capture-section {
          margin-bottom: 48px;
        }

        .capture-box {
          position: relative;
        }

        .capture-input {
          width: 100%;
          background: #181818;
          border: 1px solid #2A2A2A;
          border-radius: 8px;
          color: #E8E8E8;
          font-family: inherit;
          font-size: 15px;
          line-height: 1.6;
          padding: 16px 60px 16px 16px;
          resize: none;
          outline: none;
          transition: border-color 0.15s;
        }

        .capture-input:focus {
          border-color: #E8FF3C;
        }

        .capture-input::placeholder {
          color: #333;
        }

        .mic-btn {
          position: absolute;
          bottom: 12px;
          right: 12px;
          width: 38px;
          height: 38px;
          background: #222;
          border: 1px solid #2A2A2A;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .mic-btn:hover {
          border-color: #444;
        }

        .mic-btn.recording {
          border-color: #E8FF3C;
          background: #1A1E00;
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,255,60,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(232,255,60,0); }
        }

        .listening-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 6px 12px;
          background: #181818;
          border: 1px solid #2A2A2A;
          border-radius: 6px;
          min-height: 32px;
        }

        .listening-dot {
          width: 6px;
          height: 6px;
          background: #E8FF3C;
          border-radius: 50%;
          flex-shrink: 0;
          animation: blink 1s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .listening-text {
          font-size: 12px;
          color: #888;
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .capture-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          gap: 8px;
        }

        .capture-hint {
          font-size: 11px;
          color: #333;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }

        .capture-btn {
          background: #E8FF3C;
          color: #0E0E0E;
          border: none;
          border-radius: 6px;
          padding: 8px 20px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .capture-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .section-label {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 12px;
        }

        .priority-section { margin-bottom: 40px; }
        .inbox-section { margin-bottom: 40px; }

        .item-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .item-card {
          background: #141414;
          border: 1px solid #1E1E1E;
          border-radius: 8px;
          padding: 14px 16px;
          min-height: 60px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: start;
          position: relative;
          overflow: hidden;
          touch-action: pan-y;
          user-select: none;
          transition: border-color 0.15s;
        }

        .item-card:hover {
          border-color: #2A2A2A;
        }

        .item-card.priority-high {
          border-left: 2px solid #E8FF3C;
        }

        .item-card.flash-done {
          background: #0E1A00;
          transition: background 0.3s;
        }

        .item-card.flash-archive {
          background: #1A0E00;
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

        .swipe-hint.left-hint { left: 14px; color: #E8FF3C; }
        .swipe-hint.right-hint { right: 14px; color: #FF6B3C; }

        .item-summary {
          font-size: 14px;
          line-height: 1.5;
          color: #E0E0E0;
        }

        .item-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        .item-type {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 600;
        }

        .item-context {
          font-size: 11px;
          color: #666;
        }

        .item-priority {
          font-size: 10px;
          color: #444;
          letter-spacing: 0.05em;
        }

        .item-raw {
          font-size: 11px;
          color: #3A3A3A;
          margin-top: 4px;
          line-height: 1.4;
          font-style: italic;
        }

        .item-actions {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .action-btn {
          background: none;
          border: 1px solid #2A2A2A;
          border-radius: 4px;
          color: #666;
          font-family: inherit;
          font-size: 11px;
          padding: 4px 8px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
        }

        .action-btn:hover { border-color: #555; color: #AAA; }
        .action-btn.done:hover { border-color: #E8FF3C; color: #E8FF3C; }

        .empty-state {
          text-align: center;
          color: #2A2A2A;
          font-size: 14px;
          line-height: 2;
          margin-top: 80px;
        }

        .context-banner {
          margin-bottom: 24px;
          border: 1px solid #2A2A2A;
          border-radius: 8px;
          overflow: hidden;
        }

        .context-banner-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #141414;
          border: none;
          color: #E8E8E8;
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }

        .context-banner-header:hover { background: #1A1A1A; }

        .context-banner-count {
          font-size: 11px;
          color: #555;
          letter-spacing: 0.05em;
        }

        .context-banner-items {
          border-top: 1px solid #1E1E1E;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .context-item {
          padding: 10px 14px;
          background: #0E0E0E;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .context-item-summary {
          font-size: 13px;
          color: #C0C0C0;
        }

        .context-item-ctx {
          font-size: 11px;
          color: #444;
        }

        .context-picker {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid #1A1A1A;
        }

        .context-pick-btn {
          background: none;
          border: 1px solid #222;
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .context-pick-btn:hover { border-color: #444; }
        .context-pick-btn.active { border-color: #E8FF3C; background: #1A1E00; }

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
          color: #2A2A2A;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: color 0.15s;
        }

        .reclassify-btn:hover { color: #555; }
        .reclassify-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .reclassify-result {
          font-size: 11px;
          color: #E8FF3C;
        }

        .backlog-section {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid #1A1A1A;
        }

        .backlog-toggle {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: none;
          border: none;
          color: #555;
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 0;
          margin-bottom: 4px;
        }

        .backlog-toggle:hover { color: #888; }

        .backlog-count {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .brief-section {
          margin-bottom: 32px;
        }

        .brief-btns {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .brief-btn {
          background: none;
          border: 1px solid #222;
          border-radius: 6px;
          color: #555;
          font-family: inherit;
          font-size: 11px;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.05em;
        }

        .brief-btn:hover { border-color: #444; color: #999; }
        .brief-btn.active { border-color: #E8FF3C; color: #E8FF3C; }
        .brief-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .brief-box {
          background: #141414;
          border: 1px solid #1E1E1E;
          border-radius: 8px;
          padding: 16px;
        }

        .brief-text {
          font-size: 14px;
          line-height: 1.7;
          color: #C0C0C0;
          white-space: pre-wrap;
        }

        .brief-cursor {
          animation: blink 0.8s step-end infinite;
          color: #E8FF3C;
        }

        .brief-timestamp {
          display: block;
          font-size: 10px;
          color: #333;
          margin-top: 10px;
          letter-spacing: 0.05em;
        }

        .brief-empty {
          font-size: 12px;
          color: #2A2A2A;
          letter-spacing: 0.02em;
        }

        .toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: #1A1A1A;
          border: 1px solid #2A2A2A;
          border-radius: 6px;
          padding: 10px 20px;
          font-size: 13px;
          color: #E8FF3C;
          z-index: 100;
          white-space: nowrap;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }

        .modal {
          background: #141414;
          border: 1px solid #2A2A2A;
          border-radius: 10px;
          padding: 24px;
          max-width: 400px;
          width: 100%;
        }

        .modal-title {
          font-size: 13px;
          color: #888;
          margin-bottom: 12px;
          letter-spacing: 0.02em;
        }

        .modal-existing {
          font-size: 14px;
          color: #E8E8E8;
          padding: 12px;
          background: #0E0E0E;
          border-radius: 6px;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .modal-actions {
          display: flex;
          gap: 8px;
        }

        .modal-btn {
          flex: 1;
          padding: 10px;
          border: 1px solid #E8FF3C;
          border-radius: 6px;
          background: none;
          color: #E8FF3C;
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.15s;
        }

        .modal-btn.secondary {
          border-color: #333;
          color: #555;
        }

        .cmd-palette {
          background: #141414;
          border: 1px solid #2A2A2A;
          border-radius: 10px;
          width: 100%;
          max-width: 520px;
          overflow: hidden;
        }

        .cmd-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #1E1E1E;
          color: #E8E8E8;
          font-family: inherit;
          font-size: 15px;
          padding: 16px 20px;
          outline: none;
        }

        .cmd-results {
          max-height: 300px;
          overflow-y: auto;
        }

        .cmd-empty {
          padding: 16px 20px;
          font-size: 13px;
          color: #333;
        }

        .cmd-item {
          padding: 12px 20px;
          border-bottom: 1px solid #1A1A1A;
          cursor: pointer;
          transition: background 0.1s;
        }

        .cmd-item:hover { background: #1A1A1A; }

        .cmd-item-summary {
          display: block;
          font-size: 13px;
          color: #D0D0D0;
          margin-bottom: 2px;
        }

        .cmd-item-meta {
          font-size: 10px;
          color: #444;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Mobile */
        @media (max-width: 600px) {
          .apai-root {
            padding: 24px 16px 100px;
          }

          .capture-input {
            font-size: 16px;
            min-height: 40vh;
            padding-bottom: 64px;
          }

          .mic-btn {
            width: 56px;
            height: 56px;
            font-size: 24px;
            bottom: 10px;
            right: 10px;
          }

          .capture-btn {
            flex: 1;
            padding: 14px;
            font-size: 14px;
            text-align: center;
          }

          .capture-hint { display: none; }

          .item-actions { display: none; }
        }
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
  const color = TYPE_COLORS[item.ai_type] || '#555'
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
      <span className="swipe-hint left-hint" style={{ opacity: hintOpacity.left }}>Færdig</span>
      <span className="swipe-hint right-hint" style={{ opacity: hintOpacity.right }}>Arkiver</span>
      <div>
        <div className="item-summary">{item.ai_summary || item.raw_input}</div>
        <div className="item-meta">
          <span className="item-type" style={{ background: color + '20', color }}>
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
