'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Mic, Square, Settings, Search, X, Volume2, VolumeX } from 'lucide-react'
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

function formatDueAt(due_at: string): string {
  const due = new Date(due_at)
  const now = new Date()
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - nowDay.getTime()) / 86400000)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0
  const timeStr = hasTime
    ? ' ' + due.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    : ''

  if (diffDays === 0) return `I dag${timeStr}`
  if (diffDays === 1) return `I morgen${timeStr}`
  if (diffDays === -1) return `I går${timeStr}`
  if (diffDays > 1 && diffDays < 7) return `Om ${diffDays} dage${timeStr}`
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} dage siden`
  return (
    due.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' }) + timeStr
  )
}

const FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'task', label: 'Opgaver' },
  { id: 'reminder', label: 'Påmindelser' },
  { id: 'idea', label: 'Idéer' },
  { id: 'med-dato', label: 'Med dato' },
  { id: 'hoj-prioritet', label: 'Høj prioritet' },
]

const SORTS = [
  { id: 'prioritet', label: 'Prioritet' },
  { id: 'dato', label: 'Dato' },
  { id: 'oprettet', label: 'Oprettet' },
]

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
  // Filter + sort
  const [activeFilter, setActiveFilter] = useState('alle')
  const [activeSort, setActiveSort] = useState('prioritet')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  // Inline search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Ask APAI
  const [askOpen, setAskOpen] = useState(false)
  const [askQuery, setAskQuery] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askResult, setAskResult] = useState<{ answer: string; items: Item[] } | null>(null)
  // Historik
  const [historyItems, setHistoryItems] = useState<Item[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // Speech
  const [speaking, setSpeaking] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const askInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    fetchItems()
    fetchBacklog()
    fetchHistory()
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
    if (ctx === 'anytime') {
      setContextItems([])
      return
    }
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
    setSpeaking(false)
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    const res = await fetch('/api/brief/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    if (!res.body) {
      setBriefLoading(false)
      return
    }
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
    setBriefTime(
      new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    )
  }

  function toggleSpeak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(briefText)
    utterance.lang = 'da-DK'
    const voices = window.speechSynthesis.getVoices()
    const daVoice = voices.find((v) => v.lang.startsWith('da'))
    if (daVoice) utterance.voice = daVoice
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  const searchItems = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCmdResults([])
      return
    }
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase
      .from('items')
      .select('*')
      .ilike('raw_input', `%${q}%`)
      .limit(8)
    setCmdResults(data ?? [])
  }, [])

  async function handleAsk() {
    if (!askQuery.trim() || askLoading) return
    setAskLoading(true)
    setAskResult(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: askQuery, items }),
      })
      const data = await res.json()
      setAskResult(data)
    } catch {
      setAskResult({ answer: 'Noget gik galt — prøv igen.', items: [] })
    }
    setAskLoading(false)
  }

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
      due_at: null,
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

  async function fetchHistory() {
    const res = await fetch('/api/items/history')
    const data = await res.json()
    setHistoryItems(Array.isArray(data) ? data : [])
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
    type SREvent = {
      resultIndex: number
      results: { isFinal: boolean; 0: { transcript: string } }[]
    }
    type SR = {
      start: () => void
      stop: () => void
      lang: string
      continuous: boolean
      interimResults: boolean
      onresult: ((e: SREvent) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
    }
    const w = window as Window & {
      SpeechRecognition?: new () => SR
      webkitSpeechRecognition?: new () => SR
    }
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
      recognition.onerror = () => {
        setRecording(false)
        setInterimText('')
      }
      recognition.onend = () => {
        setRecording(false)
        setInterimText('')
      }
      recognition.start()
      return
    }

    // Fallback: Whisper via API
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
      // Cmd+Shift+K → Ask APAI
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAskOpen((o) => !o)
        setAskQuery('')
        setAskResult(null)
        return
      }
      // Cmd+K → Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
        setCmdQuery('')
        setCmdResults([])
        return
      }
      if (e.key === 'Escape') {
        setCmdOpen(false)
        setAskOpen(false)
        setSearchOpen(false)
        setSearchQuery('')
      }
      // / → inline search
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (cmdOpen) setTimeout(() => cmdInputRef.current?.focus(), 50)
  }, [cmdOpen])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [searchOpen])

  useEffect(() => {
    if (askOpen) setTimeout(() => askInputRef.current?.focus(), 50)
  }, [askOpen])

  useEffect(() => {
    searchItems(cmdQuery)
  }, [cmdQuery, searchItems])

  function handleSortClick(sort: string) {
    if (activeSort === sort) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setActiveSort(sort)
      setSortDir('desc')
    }
  }

  const filteredItems = useMemo(() => {
    let result = items

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.raw_input.toLowerCase().includes(q) || i.ai_summary?.toLowerCase().includes(q)
      )
    }

    if (activeFilter === 'task') result = result.filter((i) => i.ai_type === 'task')
    else if (activeFilter === 'reminder') result = result.filter((i) => i.ai_type === 'reminder')
    else if (activeFilter === 'idea') result = result.filter((i) => i.ai_type === 'idea')
    else if (activeFilter === 'med-dato') result = result.filter((i) => i.due_at)
    else if (activeFilter === 'hoj-prioritet') result = result.filter((i) => i.ai_priority >= 4)

    result = [...result].sort((a, b) => {
      if (activeSort === 'prioritet') {
        const diff = b.ai_priority - a.ai_priority
        return sortDir === 'desc' ? diff : -diff
      } else if (activeSort === 'dato') {
        const inf = sortDir === 'asc' ? Infinity : -Infinity
        const aDate = a.due_at ? new Date(a.due_at).getTime() : inf
        const bDate = b.due_at ? new Date(b.due_at).getTime() : inf
        return sortDir === 'asc' ? aDate - bDate : bDate - aDate
      } else {
        const diff =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return sortDir === 'desc' ? diff : -diff
      }
    })

    return result
  }, [items, activeFilter, activeSort, sortDir, searchQuery])

  const isFiltered =
    activeFilter !== 'alle' || searchQuery.trim() !== '' || activeSort !== 'prioritet'

  const top3 = filteredItems.filter((i) => i.ai_priority >= 4).slice(0, 3)
  const rest = filteredItems.filter((i) => !top3.find((t) => t.id === i.id))

  return (
    <main className="apai-root">
      <header className="apai-header">
        <span className="apai-logo">APAI</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="apai-count">{items.length} i indbakken</span>
          <Link
            href="/settings"
            style={{ color: '#555', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            title="Indstillinger"
          >
            <Settings size={16} />
          </Link>
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
            {recording ? <Square size={16} /> : <Mic size={16} />}
          </button>
        </div>
        {(recording || interimText) && (
          <div className="listening-bar">
            <span className="listening-dot" />
            <span className="listening-text">{interimText || 'Lytter…'}</span>
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

      {/* Filter + Sort + Search */}
      <div className="filter-row">
        <div className="filter-labels">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-label ${activeFilter === f.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sort-row">
          {SORTS.map((s) => (
            <button
              key={s.id}
              className={`sort-btn ${activeSort === s.id ? 'active' : ''}`}
              onClick={() => handleSortClick(s.id)}
            >
              {s.label}
              {activeSort === s.id && (
                <span className="sort-dir">{sortDir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
          <button
            className="search-toggle"
            onClick={() => {
              setSearchOpen((o) => !o)
              if (searchOpen) setSearchQuery('')
            }}
            aria-label="Søg"
          >
            {searchOpen ? <X size={13} /> : <Search size={13} />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="search-bar">
          <Search size={13} style={{ color: '#555', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder="Søg i indbakken…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false)
                setSearchQuery('')
              }
            }}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Top 3 — kun ved default visning */}
      {!isFiltered && top3.length > 0 && (
        <section className="priority-section">
          <h2 className="section-label">Vigtigst nu</h2>
          <div className="item-list">
            {top3.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onDone={markDone}
                onArchive={archive}
                onBacklog={moveToBacklog}
              />
            ))}
          </div>
        </section>
      )}

      {/* Resten / filtreret liste */}
      {(isFiltered ? filteredItems : rest).length > 0 && (
        <section className="inbox-section">
          {isFiltered ? (
            <h2 className="section-label">
              {searchQuery.trim()
                ? `"${searchQuery}" · ${filteredItems.length}`
                : `${FILTERS.find((f) => f.id === activeFilter)?.label ?? 'Indbakke'} · ${filteredItems.length}`}
            </h2>
          ) : (
            <h2 className="section-label">Indbakke</h2>
          )}
          <div className="item-list">
            {(isFiltered ? filteredItems : rest).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onDone={markDone}
                onArchive={archive}
                onBacklog={moveToBacklog}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && filteredItems.length === 0 && (
        <div className="empty-state">
          {isFiltered
            ? 'Ingen items matcher filteret.'
            : 'Alt er styr.\nDump din næste tanke herover.'}
        </div>
      )}

      {/* Backlog */}
      {backlogItems.length > 0 && (
        <section className="backlog-section">
          <button className="backlog-toggle" onClick={() => setBacklogOpen((o) => !o)}>
            <span>Backlog</span>
            <span className="backlog-count">
              {backlogItems.length} {backlogOpen ? '▲' : '▼'}
            </span>
          </button>
          {backlogOpen && (
            <div className="item-list" style={{ marginTop: 8 }}>
              {backlogItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDone={markDone}
                  onArchive={archive}
                  onBacklog={moveToInbox}
                  isBacklog
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Historik */}
      {historyItems.length > 0 && (
        <section className="backlog-section">
          <button className="backlog-toggle" onClick={() => setHistoryOpen((o) => !o)}>
            <span>Historik</span>
            <span className="backlog-count">
              {historyItems.length} {historyOpen ? '▲' : '▼'}
            </span>
          </button>
          {historyOpen && (
            <div className="item-list" style={{ marginTop: 8 }}>
              {historyItems.map((item) => (
                <div key={item.id} className="item-card" style={{ opacity: 0.6 }}>
                  <div>
                    <div className="item-summary">{item.ai_summary || item.raw_input}</div>
                    <div className="item-meta">
                      <span
                        className="item-type"
                        style={{
                          background: (TYPE_COLORS[item.ai_type] || '#555') + '20',
                          color: TYPE_COLORS[item.ai_type] || '#555',
                        }}
                      >
                        {TYPE_LABELS[item.ai_type] || 'Ukendt'}
                      </span>
                      <span className="item-priority" style={{ color: item.status === 'done' ? '#4CAF50' : '#555' }}>
                        {item.status === 'done' ? '✓ Færdig' : 'Arkiveret'}
                      </span>
                    </div>
                  </div>
                </div>
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

      {/* Brief */}
      <section className="brief-section">
        <div className="brief-btns">
          {[
            ['morning', 'Morgen'],
            ['midday', 'Middag'],
            ['afternoon', 'Eftermiddag'],
            ['shutdown', 'Shutdown'],
          ].map(([t, label]) => (
            <button
              key={t}
              className={`brief-btn ${briefType === t ? 'active' : ''}`}
              onClick={() => generateBrief(t)}
              disabled={briefLoading}
            >
              {label}
            </button>
          ))}
        </div>
        {(briefLoading || briefText) && (
          <div className="brief-box">
            <p className="brief-text">
              {briefText}
              {briefLoading && <span className="brief-cursor">▌</span>}
            </p>
            <div className="brief-footer">
              {briefTime && <span className="brief-timestamp">Genereret {briefTime}</span>}
              {briefText && !briefLoading && (
                <button className="speak-btn" onClick={toggleSpeak}>
                  {speaking ? (
                    <>
                      <VolumeX size={13} />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={13} />
                      <span>Oplæs</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        {!briefText && !briefLoading && (
          <p className="brief-empty">Tryk en knap for en kort briefing.</p>
        )}
      </section>

      {/* Bottom dock — mobile only */}
      <nav className="bottom-dock">
        <div className="dock-context">
          {(['morning', 'work', 'leaving', 'evening'] as ContextTrigger[]).map((ctx) => (
            <button
              key={ctx}
              className={`dock-ctx-btn ${currentContext === ctx ? 'active' : ''}`}
              onClick={() => handleContextSelect(ctx)}
              aria-label={CONTEXT_META[ctx].label}
            >
              {CONTEXT_META[ctx].icon}
            </button>
          ))}
        </div>
        <Link href="/settings" className="dock-settings-btn" title="Indstillinger">
          <Settings size={20} />
        </Link>
      </nav>

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
              <button
                className="modal-btn"
                onClick={() => {
                  setDuplicate(null)
                  setInput(duplicate.pending)
                  setTimeout(() => handleSubmit(undefined, true), 0)
                }}
              >
                Gem alligevel
              </button>
              <button className="modal-btn secondary" onClick={() => setDuplicate(null)}>
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command palette (Cmd+K) */}
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
                  <span className="cmd-item-meta">
                    {item.ai_type} · prio {item.ai_priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ask APAI (Cmd+Shift+K) */}
      {askOpen && (
        <div className="modal-overlay" onClick={() => setAskOpen(false)}>
          <div className="cmd-palette ask-palette" onClick={(e) => e.stopPropagation()}>
            <div className="ask-header">
              <span className="ask-label">Spørg APAI</span>
              <span className="ask-hint">⌘⇧K</span>
            </div>
            <div className="ask-input-row">
              <input
                ref={askInputRef}
                className="cmd-input ask-cmd-input"
                placeholder="Hvad har jeg om camping? Er der noget til weekenden?"
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAsk()
                }}
              />
              <button
                className="ask-send-btn"
                onClick={handleAsk}
                disabled={!askQuery.trim() || askLoading}
              >
                {askLoading ? '…' : 'Spørg'}
              </button>
            </div>
            {askResult && (
              <div className="ask-result">
                <p className="ask-answer">{askResult.answer}</p>
                {askResult.items.length > 0 && (
                  <div className="ask-items">
                    {askResult.items.map((item) => (
                      <div key={item.id} className="cmd-item">
                        <span className="cmd-item-summary">
                          {item.ai_summary || item.raw_input}
                        </span>
                        <span className="cmd-item-meta">
                          {TYPE_LABELS[item.ai_type]} · prio {item.ai_priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

        .apai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
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
          letter-spacing: 0.08em;
        }

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
          color: var(--text-2);
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .mic-btn:hover {
          border-color: var(--border-2);
          color: var(--text-1);
        }

        .mic-btn.recording {
          border-color: var(--accent);
          background: var(--accent-bg);
          color: var(--accent);
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
          color: var(--bg);
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

        /* Filter + sort bar */
        .filter-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .filter-labels {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          flex-wrap: nowrap;
          padding-bottom: 2px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        .filter-labels::-webkit-scrollbar { display: none; }

        .filter-label {
          background: none;
          border: 1px solid var(--border);
          border-radius: 20px;
          color: var(--text-3);
          font-family: inherit;
          font-size: 11px;
          letter-spacing: 0.08em;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
          flex-shrink: 0;
          touch-action: manipulation;
        }

        .filter-label:hover { border-color: var(--border-2); color: var(--text-2); }
        .filter-label.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

        .sort-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .sort-btn {
          background: none;
          border: none;
          color: var(--text-3);
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.08em;
          padding: 2px 0;
          cursor: pointer;
          transition: color 0.1s;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .sort-btn:hover { color: var(--text-2); }
        .sort-btn.active { color: var(--text-2); }

        .sort-dir { opacity: 0.7; }

        .search-toggle {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-3);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 26px;
          cursor: pointer;
          margin-left: auto;
          transition: all 0.1s;
        }

        .search-toggle:hover { border-color: var(--border-2); color: var(--text-2); }

        /* Inline search bar */
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          margin-bottom: 12px;
        }

        .search-input {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-1);
          font-family: inherit;
          font-size: 14px;
          outline: none;
        }

        .search-input::placeholder { color: var(--text-3); }

        .search-clear {
          background: none;
          border: none;
          color: var(--text-3);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.1s;
        }

        .search-clear:hover { color: var(--text-2); }

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

        .item-due {
          font-size: 11px;
          color: var(--accent);
          letter-spacing: 0.03em;
          border: 1px solid rgba(232,255,60,0.3);
          border-radius: 4px;
          padding: 2px 6px;
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
          padding: 8px 10px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
          flex: 1;
          text-align: center;
          touch-action: manipulation;
        }

        .action-btn:hover { border-color: var(--border-2); color: var(--text-1); }
        .action-btn.done:hover { border-color: var(--accent); color: var(--accent); }

        .empty-state {
          text-align: center;
          color: var(--text-3);
          font-size: 14px;
          line-height: 2;
          margin-top: 80px;
          white-space: pre-line;
        }

        .context-picker {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        .context-pick-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 16px;
          font-size: 20px;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .context-pick-btn:hover { border-color: var(--border-2); }
        .context-pick-btn.active { border-color: var(--accent); background: var(--accent-bg); }

        .reclassify-row {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          margin-top: 14px;
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

        /* Brief section */
        .brief-section {
          margin-top: 40px;
          padding-top: 28px;
          border-top: 1px solid var(--border);
          margin-bottom: 16px;
        }

        .brief-btns {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
          overflow-x: auto;
          flex-wrap: nowrap;
          padding-bottom: 2px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
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

        .brief-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          gap: 8px;
        }

        .brief-timestamp {
          font-size: 11px;
          color: var(--text-3);
          letter-spacing: 0.04em;
        }

        .speak-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-2);
          font-family: inherit;
          font-size: 12px;
          padding: 6px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.1s;
          flex-shrink: 0;
          touch-action: manipulation;
        }

        .speak-btn:hover { border-color: var(--border-2); color: var(--text-1); }

        .brief-empty {
          font-size: 12px;
          color: var(--text-3);
          letter-spacing: 0.02em;
        }

        /* Toast */
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

        /* Modals */
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

        /* Command palette */
        .cmd-palette {
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: var(--radius);
          width: 100%;
          max-width: 540px;
          overflow: hidden;
        }

        .ask-palette { max-width: 580px; }

        .ask-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 22px 0;
        }

        .ask-label {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
        }

        .ask-hint {
          font-size: 10px;
          color: var(--text-3);
          letter-spacing: 0.05em;
        }

        .ask-input-row {
          display: flex;
          align-items: stretch;
        }

        .ask-cmd-input {
          border-bottom: 1px solid var(--border) !important;
        }

        .ask-send-btn {
          background: var(--accent);
          border: none;
          border-bottom: 1px solid var(--border);
          color: var(--bg);
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          padding: 0 18px;
          cursor: pointer;
          transition: opacity 0.1s;
          white-space: nowrap;
          flex-shrink: 0;
          touch-action: manipulation;
        }

        .ask-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ask-result {
          padding: 18px 22px;
          border-top: 1px solid var(--border);
          max-height: 320px;
          overflow-y: auto;
        }

        .ask-answer {
          font-size: 14px;
          line-height: 1.75;
          color: var(--text-1);
          margin-bottom: 12px;
        }

        .ask-items { display: flex; flex-direction: column; }

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

        /* Bottom dock */
        .bottom-dock {
          display: none;
        }

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
          display: flex;
          align-items: center;
          padding: 8px 4px 8px 12px;
          border-radius: 8px;
          transition: all 0.15s;
        }

        .dock-settings-btn:hover { color: var(--text-1); background: var(--surface-2); }

        /* Mobile */
        @media (max-width: 640px) {
          .apai-root {
            padding: 20px 14px 140px;
          }

          .capture-input {
            font-size: 17px;
            min-height: 130px;
            padding: 16px 72px 16px 16px;
          }

          .mic-btn {
            width: 58px;
            height: 58px;
            font-size: 24px;
            bottom: 12px;
            right: 12px;
          }

          .capture-btn {
            flex: 1;
            padding: 16px;
            font-size: 15px;
            text-align: center;
          }

          .capture-footer { justify-content: stretch; }
          .capture-hint { display: none; }

          .item-card { padding: 14px; }

          .item-actions {
            gap: 6px;
          }

          .action-btn {
            font-size: 12px;
            padding: 9px 8px;
          }

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
            padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
            z-index: 100;
          }

          .context-picker { display: none; }

          .toast { bottom: 100px; }
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
      <span className="swipe-hint left-hint" style={{ opacity: hintOpacity.left }}>
        Færdig
      </span>
      <span className="swipe-hint right-hint" style={{ opacity: hintOpacity.right }}>
        Arkiver
      </span>
      <div>
        <div className="item-summary">{item.ai_summary || item.raw_input}</div>
        <div className="item-meta">
          <span className="item-type" style={{ background: color + '20', color }}>
            {TYPE_LABELS[item.ai_type] || 'Ukendt'}
          </span>
          {item.ai_context && <span className="item-context">↳ {item.ai_context}</span>}
          {item.due_at && <span className="item-due">{formatDueAt(item.due_at)}</span>}
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
          {!isBacklog && onBacklog && (
            <button className="action-btn" onClick={() => onBacklog(item.id)}>
              Backlog
            </button>
          )}
          {isBacklog && (
            <button className="action-btn" onClick={() => onBacklog?.(item.id)}>
              → Indbakke
            </button>
          )}
          <button className="action-btn" onClick={() => onArchive(item.id)}>
            Arkiver
          </button>
        </div>
      )}
    </div>
  )
}
