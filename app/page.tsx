'use client'

import { useState, useEffect, useRef } from 'react'
import { Item } from '@/lib/supabase'

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

function isMobile() {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [recording, setRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    fetchItems()
    if (!isMobile()) {
      textareaRef.current?.focus()
    }
  }, [])

  async function fetchItems() {
    setLoading(true)
    const res = await fetch('/api/items')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || classifying) return

    setClassifying(true)
    const optimisticId = 'temp-' + Date.now()
    const optimistic: Item = {
      id: optimisticId,
      raw_input: input.trim(),
      ai_type: 'none',
      ai_summary: '...',
      ai_context: null,
      ai_priority: 3,
      status: 'inbox',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems((prev) => [optimistic, ...prev])
    setInput('')

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input: optimistic.raw_input }),
    })
    const newItem = await res.json()
    setItems((prev) => prev.map((i) => (i.id === optimisticId ? newItem : i)))
    setClassifying(false)
  }

  async function markDone(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
  }

  async function archive(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }

    // Prøv Web Speech API først
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'da-DK'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      setRecording(true)
      recognition.start()
      recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript
        setInput((prev) => (prev ? prev + ' ' + transcript : transcript))
        setRecording(false)
      }
      recognition.onerror = () => setRecording(false)
      recognition.onend = () => setRecording(false)
      return
    }

    // Fallback: MediaRecorder → Whisper
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
        const res = await fetch('/api/transcribe', { method: 'POST', body: form })
        const data = await res.json()
        if (data.text) setInput((prev) => (prev ? prev + ' ' + data.text : data.text))
        setRecording(false)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      setRecording(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  const top3 = items.filter((i) => i.ai_priority >= 4).slice(0, 3)
  const rest = items.filter((i) => !top3.find((t) => t.id === i.id))

  return (
    <main className="apai-root">
      <header className="apai-header">
        <span className="apai-logo">APAI</span>
        <span className="apai-count">{items.length} i indbakken</span>
      </header>

      {/* Capture */}
      <section className="capture-section">
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
        <div className="capture-footer">
          <span className="capture-hint">⌘↵ for at sende</span>
          <div className="capture-actions">
            <button
              className={`mic-btn ${recording ? 'recording' : ''}`}
              onClick={toggleRecording}
              aria-label={recording ? 'Stop optagelse' : 'Optag tale'}
              title={recording ? 'Stop optagelse' : 'Optag tale'}
            >
              {recording ? '⏹' : '🎙'}
            </button>
            <button
              className="capture-btn"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || classifying}
            >
              {classifying ? 'Klassificerer…' : 'Dump det'}
            </button>
          </div>
        </div>
      </section>

      {/* Top 3 */}
      {top3.length > 0 && (
        <section className="priority-section">
          <h2 className="section-label">Vigtigst nu</h2>
          <div className="item-list">
            {top3.map((item) => (
              <ItemCard key={item.id} item={item} onDone={markDone} onArchive={archive} />
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
              <ItemCard key={item.id} item={item} onDone={markDone} onArchive={archive} />
            ))}
          </div>
        </section>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          Indbakken er tom.<br />Dump din første tanke herover.
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
          color: #444;
          letter-spacing: 0.1em;
        }

        .capture-section {
          margin-bottom: 48px;
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
          padding: 16px;
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

        .capture-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .capture-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .capture-hint {
          font-size: 11px;
          color: #333;
          letter-spacing: 0.05em;
        }

        .mic-btn {
          background: #181818;
          border: 1px solid #2A2A2A;
          border-radius: 6px;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .mic-btn:hover {
          border-color: #444;
        }

        .mic-btn.recording {
          border-color: #E8FF3C;
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
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
          color: #444;
          margin-bottom: 12px;
        }

        .priority-section {
          margin-bottom: 40px;
        }

        .inbox-section {
          margin-bottom: 40px;
        }

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
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: start;
          transition: border-color 0.15s, transform 0.2s ease, opacity 0.2s ease;
          position: relative;
          overflow: hidden;
          touch-action: pan-y;
          user-select: none;
        }

        .item-card:hover {
          border-color: #2A2A2A;
        }

        .item-card.priority-high {
          border-left: 2px solid #E8FF3C;
        }

        .item-card.swiping-right {
          background: #0E1A00;
        }

        .item-card.swiping-left {
          background: #1A0E00;
        }

        .swipe-hint {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0;
          transition: opacity 0.1s;
          pointer-events: none;
        }

        .swipe-hint.left-hint {
          left: 16px;
          color: #E8FF3C;
        }

        .swipe-hint.right-hint {
          right: 16px;
          color: #FF6B3C;
        }

        .item-summary {
          font-size: 14px;
          line-height: 1.5;
          color: #D0D0D0;
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
          color: #555;
        }

        .item-priority {
          font-size: 10px;
          color: #333;
          letter-spacing: 0.05em;
        }

        .item-raw {
          font-size: 11px;
          color: #2A2A2A;
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
          border: 1px solid #222;
          border-radius: 4px;
          color: #444;
          font-family: inherit;
          font-size: 11px;
          padding: 4px 8px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
        }

        .action-btn:hover {
          border-color: #444;
          color: #999;
        }

        .action-btn.done:hover {
          border-color: #E8FF3C;
          color: #E8FF3C;
        }

        .empty-state {
          text-align: center;
          color: #2A2A2A;
          font-size: 14px;
          line-height: 2;
          margin-top: 80px;
        }

        /* Mobile */
        @media (max-width: 600px) {
          .apai-root {
            padding: 24px 16px 100px;
          }

          .capture-input {
            font-size: 16px; /* undgår zoom på iOS */
            min-height: 120px;
          }

          .mic-btn {
            width: 48px;
            height: 48px;
            font-size: 22px;
            border-radius: 50%;
          }

          .capture-btn {
            padding: 12px 24px;
            font-size: 13px;
          }

          .item-actions {
            display: none; /* skjul knapper på mobil — brug swipe */
          }
        }
      `}</style>
    </main>
  )
}

function ItemCard({
  item,
  onDone,
  onArchive,
}: {
  item: Item
  onDone: (id: string) => void
  onArchive: (id: string) => void
}) {
  const isTemp = item.id.startsWith('temp-')
  const color = TYPE_COLORS[item.ai_type] || '#555'
  const cardRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const [swipeClass, setSwipeClass] = useState('')
  const [hintOpacity, setHintOpacity] = useState({ left: 0, right: 0 })

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
    const ratio = Math.min(Math.abs(dx) / 80, 1)
    if (dx > 0) {
      setSwipeClass('swiping-right')
      setHintOpacity({ left: ratio, right: 0 })
    } else {
      setSwipeClass('swiping-left')
      setHintOpacity({ left: 0, right: ratio })
    }
  }

  function onTouchEnd() {
    const dx = currentXRef.current
    const card = cardRef.current
    if (!card) return
    card.style.transform = ''
    setSwipeClass('')
    setHintOpacity({ left: 0, right: 0 })
    if (dx > 80) onDone(item.id)
    else if (dx < -80) onArchive(item.id)
  }

  return (
    <div
      ref={cardRef}
      className={`item-card ${item.ai_priority >= 4 ? 'priority-high' : ''} ${swipeClass}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <span className="swipe-hint left-hint" style={{ opacity: hintOpacity.left }}>Færdig</span>
      <span className="swipe-hint right-hint" style={{ opacity: hintOpacity.right }}>Arkiver</span>
      <div>
        <div className="item-summary">{item.ai_summary || item.raw_input}</div>
        <div className="item-meta">
          <span
            className="item-type"
            style={{ background: color + '20', color }}
          >
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
          <button className="action-btn done" onClick={() => onDone(item.id)}>
            Færdig
          </button>
          <button className="action-btn" onClick={() => onArchive(item.id)}>
            Arkiver
          </button>
        </div>
      )}
    </div>
  )
}
