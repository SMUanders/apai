'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Mic, Square, Settings, Search, X, Volume2, VolumeX, Sun } from 'lucide-react'
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

const AREA_LABELS: Record<string, string> = {
  smu: 'SMU',
  gca: 'GCA',
  privat: 'Privat',
  familie: 'Familie',
  andet: 'Andet',
}

const AREA_COLORS: Record<string, string> = {
  smu: '#3CDFFF',
  gca: '#C4B5FD',
  privat: '#6AE08A',
  familie: '#FF9B3C',
  andet: '#555555',
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
  // Use UTC hours to detect "no specific time" (AI stores time-less dates as T00:00:00Z)
  const hasTime = due.getUTCHours() !== 0 || due.getUTCMinutes() !== 0
  const timeStr = hasTime
    ? ' ' + due.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    : ''

  if (diffDays === 0) return `I dag${timeStr}`
  if (diffDays === 1) return `I morgen${timeStr}`
  if (diffDays === -1) return `I går${timeStr}`
  if (diffDays > 1 && diffDays < 7) return `Om ${diffDays} dage${timeStr}`
  if (diffDays === -2) return `I forgårs`
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} dage siden`
  return (
    due.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' }) + timeStr
  )
}

function isDuePast(due_at: string): boolean {
  return new Date(due_at) < new Date()
}

const FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'task', label: 'Opgaver' },
  { id: 'reminder', label: 'Påmindelser' },
  { id: 'idea', label: 'Idéer' },
  { id: 'med-dato', label: 'Med dato' },
  { id: 'hoj-prioritet', label: 'Høj prioritet' },
  { id: 'review', label: '⚑ Review' },
  { id: 'sager', label: '⊙ Sager' },
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
  const [sagerOpen, setSagerOpen] = useState(true)
  const [briefPoints, setBriefPoints] = useState<{ item_id: string | null; note: string; item?: Item }[]>([])
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefType, setBriefType] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [duplicate, setDuplicate] = useState<{ existing: Item; pending: string } | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [cmdResults, setCmdResults] = useState<Item[]>([])
  // Filter + sort
  const [activeFilter, setActiveFilter] = useState('alle')
  const [activeAreaFilter, setActiveAreaFilter] = useState('alle')
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
  // Capture result
  const [captureResult, setCaptureResult] = useState<{ item: Item; confident: boolean } | null>(null)
  const captureResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Briefing modal
  const [briefOpen, setBriefOpen] = useState(false)
  const [briefCompareMode, setBriefCompareMode] = useState(false)
  const [compareResult, setCompareResult] = useState<{ anthropic: string; openai: string; itemCount: number } | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  // Group suggestions
  const [groupSuggestions, setGroupSuggestions] = useState<{ label: string; item_ids: string[]; reasoning: string }[]>([])
  // Duplicate detection
  type DupItem = { id: string; ai_summary: string | null; raw_input: string }
  const [duplicatePairs, setDuplicatePairs] = useState<{ a: DupItem; b: DupItem; score: number; reason?: string; aiConfirmed?: boolean }[]>([])
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set())
  // AI analyse panel
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [aiAnalysisMsg, setAiAnalysisMsg] = useState<string | null>(null)
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
    fetchDuplicates()
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

  async function fetchDuplicates() {
    const res = await fetch('/api/items/find-duplicates')
    if (!res.ok) return
    const data = await res.json()
    setDuplicatePairs(data.pairs ?? [])
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
    setBriefPoints([])
    setBriefType(type)
    setSpeaking(false)
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    try {
      const res = await fetch('/api/brief/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (res.ok) {
        const enriched = (data.points ?? []).map((p: { item_id: string | null; note: string }) => ({
          ...p,
          item: p.item_id ? items.find((i) => i.id === p.item_id) : undefined,
        }))
        setBriefPoints(enriched)
      }
    } finally {
      setBriefLoading(false)
    }
  }

  async function handlePriorityChange(id: string, newPriority: number) {
    const clamped = Math.max(1, Math.min(5, newPriority))
    const res = await fetch(`/api/items/${id}/priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: clamped }),
    })
    if (res.ok) {
      const data = await res.json()
      const update = (prev: Item[]) => prev.map((i) => i.id === id ? { ...i, ai_priority: data.item.ai_priority } : i)
      setItems(update)
      setBacklogItems(update)
      setBriefPoints((prev) => prev.map((p) => p.item?.id === id ? { ...p, item: { ...p.item!, ai_priority: data.item.ai_priority } } : p))
    }
  }

  async function handleSnooze(id: string, option: string) {
    const res = await fetch(`/api/items/${id}/snooze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option }),
    })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setBacklogItems((prev) => prev.filter((i) => i.id !== id))
      setBriefPoints((prev) => prev.filter((p) => p.item_id !== id))
    }
  }

  async function runCompare(type: string) {
    setCompareLoading(true)
    setCompareResult(null)
    setBriefType(type)
    try {
      const res = await fetch('/api/brief/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (res.ok) setCompareResult(data)
    } finally {
      setCompareLoading(false)
    }
  }

  function toggleSpeak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const speakText = briefPoints.map((p) => p.note).join('. ')
    const utterance = new SpeechSynthesisUtterance(speakText || 'Ingen briefing.')
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
    const confident = data.confident !== false
    setCaptureResult({ item: data, confident })
    if (captureResultTimer.current) clearTimeout(captureResultTimer.current)
    captureResultTimer.current = setTimeout(() => setCaptureResult(null), 5000)
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

  function handleItemUpdate(id: string, updatedItem: Item) {
    setItems((prev) => prev.map((i) => (i.id === id ? updatedItem : i)))
  }

  async function handleGroupUpdate(id: string, group_label: string | null) {
    const res = await fetch(`/api/items/${id}/group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_label }),
    })
    const data = await res.json()
    if (data.item) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, group_label: data.item.group_label } : i)))
      setBacklogItems((prev) => prev.map((i) => (i.id === id ? { ...i, group_label: data.item.group_label } : i)))
    }
  }

  async function analyzeAll() {
    // Open panel immediately with loading state — brugeren ser straks at noget sker
    setAiPanelOpen(true)
    setAiAnalysisStatus('loading')
    setAiAnalysisMsg(null)
    setGroupSuggestions([])
    setDuplicatePairs((prev) => prev.filter((p) => !p.aiConfirmed))

    try {
      const res = await fetch('/api/items/analyze', { method: 'POST' })
      if (!res.ok) {
        let msg = `Serverfejl (${res.status})`
        try { const d = await res.json(); msg = d.error ?? msg } catch { /* ignore */ }
        setAiAnalysisStatus('error')
        setAiAnalysisMsg(msg)
        return
      }

      const data = await res.json()
      const aiDups = (data.duplicates ?? []).map((d: { a: DupItem; b: DupItem; reason: string; score: number }) => ({
        ...d,
        aiConfirmed: true,
      }))
      setDuplicatePairs((prev) => {
        const aiIds = new Set(aiDups.map((d: { a: DupItem; b: DupItem }) => `${d.a.id}:${d.b.id}`))
        const filtered = prev.filter((p) => !aiIds.has(`${p.a.id}:${p.b.id}`))
        return [...aiDups, ...filtered]
      })
      setGroupSuggestions(data.groups ?? [])

      const totalFound = (data.duplicates?.length ?? 0) + (data.groups?.length ?? 0)
      if (totalFound === 0) {
        setAiAnalysisMsg('Ingen forslag fundet — din indbakke ser ryddig ud.')
      } else {
        setAiAnalysisMsg(null)
      }
      setAiAnalysisStatus('done')
    } catch (err) {
      setAiAnalysisStatus('error')
      setAiAnalysisMsg(`Noget gik galt — prøv igen. (${err instanceof Error ? err.message : 'ukendt fejl'})`)
    }
  }

  async function applyGroupSuggestion(label: string, item_ids: string[]) {
    await Promise.all(item_ids.map((id) => handleGroupUpdate(id, label)))
    setGroupSuggestions((prev) => prev.filter((s) => s.label !== label))
  }

  function dismissPair(aId: string, bId: string) {
    setDismissedPairs((prev) => new Set(Array.from(prev).concat(`${aId}:${bId}`)))
  }

  async function archiveFromPair(idToArchive: string, aId: string, bId: string) {
    await archive(idToArchive)
    dismissPair(aId, bId)
    setDuplicatePairs((prev) =>
      prev.filter((p) => !(p.a.id === aId && p.b.id === bId))
    )
  }

  async function handleAreaUpdate(id: string, area: string) {
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    })
    const data = await res.json()
    if (data.area !== undefined) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, area: data.area } : i)))
      setBacklogItems((prev) => prev.map((i) => (i.id === id ? { ...i, area: data.area } : i)))
    }
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
    else if (activeFilter === 'review') result = result.filter((i) => i.ai_type === 'none' || i.ai_context === '__review__')
    else if (activeFilter === 'sager') result = result.filter((i) => !!i.group_label)

    if (activeAreaFilter !== 'alle') {
      result = result.filter((i) => (i.area ?? 'andet') === activeAreaFilter)
    }

    const TYPE_ORDER: Record<string, number> = { task: 0, reminder: 0, idea: 1, note: 1, someday: 2, none: 2 }

    result = [...result].sort((a, b) => {
      if (activeSort === 'prioritet') {
        const diff = b.ai_priority - a.ai_priority
        if (diff !== 0) return sortDir === 'desc' ? diff : -diff
        // Within same priority: tasks/reminders first
        const tDiff = (TYPE_ORDER[a.ai_type] ?? 1) - (TYPE_ORDER[b.ai_type] ?? 1)
        if (tDiff !== 0) return tDiff
        // Items with due_at coming up first
        if (a.due_at && !b.due_at) return -1
        if (!a.due_at && b.due_at) return 1
        return 0
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
  }, [items, activeFilter, activeAreaFilter, activeSort, sortDir, searchQuery])

  const existingGroups = useMemo(
    () => Array.from(new Set(items.filter((i) => i.group_label).map((i) => i.group_label!))).sort(),
    [items]
  )

  const activeDuplicates = useMemo(
    () => duplicatePairs.filter((p) => !dismissedPairs.has(`${p.a.id}:${p.b.id}`)),
    [duplicatePairs, dismissedPairs]
  )

  const isFiltered =
    activeFilter !== 'alle' || activeAreaFilter !== 'alle' || searchQuery.trim() !== '' || activeSort !== 'prioritet'

  const top3 = filteredItems.filter((i) => i.ai_priority >= 4).slice(0, 3)
  const rest = filteredItems.filter((i) => !top3.find((t) => t.id === i.id))

  return (
    <main className="apai-root">
      <header className="apai-header">
        <span className="apai-logo">APAI</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="apai-count">{items.length} i indbakken</span>
          <button
            className="header-icon-btn"
            onClick={() => setBriefOpen(true)}
            title="Briefing"
            aria-label="Åbn briefing"
          >
            <Sun size={15} />
          </button>
          <Link
            href="/settings"
            className="header-icon-btn"
            title="Indstillinger"
          >
            <Settings size={15} />
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

      {/* Capture result */}
      {captureResult && (() => {
        const { item, confident } = captureResult
        const color = TYPE_COLORS[item.ai_type] || '#555'
        const needsReview = item.ai_type === 'none' || item.ai_context === '__review__'
        return (
          <div className="capture-result">
            <div className="capture-result-top">
              <div className="capture-result-badges">
                <span className="item-type" style={{ background: color + '20', color, fontSize: 11 }}>
                  {TYPE_LABELS[item.ai_type] || 'Ukendt'}
                </span>
                <span className="item-priority">{PRIORITY_DOT(item.ai_priority)}</span>
                {!confident && <span className="review-badge">usikker</span>}
                {needsReview && confident && <span className="review-badge">til review</span>}
              </div>
              <button className="capture-result-dismiss" onClick={() => setCaptureResult(null)}>×</button>
            </div>
            <div className="capture-result-summary">
              {item.ai_summary && item.ai_summary !== '...' ? item.ai_summary : item.raw_input}
            </div>
            {item.due_at && (
              <div className={isDuePast(item.due_at) ? 'item-due-overdue' : 'item-due'} style={{ marginTop: 8, display: 'inline-block' }}>
                {formatDueAt(item.due_at)}
              </div>
            )}
          </div>
        )
      })()}

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

      {/* Område-filter */}
      <div className="area-filter-row">
        <span className="area-filter-label">Område</span>
        {(['alle', 'smu', 'gca', 'privat', 'familie', 'andet'] as const).map((a) => (
          <button
            key={a}
            className={`area-filter-btn ${activeAreaFilter === a ? 'active' : ''}`}
            style={activeAreaFilter === a && a !== 'alle' ? {
              borderColor: AREA_COLORS[a],
              color: AREA_COLORS[a],
              background: AREA_COLORS[a] + '12',
            } : {}}
            onClick={() => setActiveAreaFilter(a)}
          >
            {a === 'alle' ? 'Alle' : AREA_LABELS[a]}
          </button>
        ))}
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

      {/* AI Sorterings-panel */}
      {aiPanelOpen && (
        <section className="ai-panel">
          <div className="ai-panel-header">
            <span className="ai-panel-title">AI Sorterings-forslag</span>
            <button className="ai-panel-close" onClick={() => { setAiPanelOpen(false); setAiAnalysisStatus('idle'); setAiAnalysisMsg(null) }}>×</button>
          </div>

          {/* Loading */}
          {aiAnalysisStatus === 'loading' && (
            <div className="ai-panel-status">
              <span className="ai-loading-dot" />
              <span>Analyserer din indbakke…</span>
            </div>
          )}

          {/* Fejl */}
          {aiAnalysisStatus === 'error' && (
            <div className="ai-panel-status error">
              <span>⚠ {aiAnalysisMsg}</span>
              <button className="ai-action-btn" style={{ marginTop: 8 }} onClick={analyzeAll}>Prøv igen</button>
            </div>
          )}

          {/* Tom state */}
          {aiAnalysisStatus === 'done' && aiAnalysisMsg && (
            <div className="ai-panel-status muted">{aiAnalysisMsg}</div>
          )}

          {/* Word-overlap dubletter (auto-detekteret) */}
          {activeDuplicates.filter((p) => !p.aiConfirmed).slice(0, 2).map((pair) => (
            <div key={`${pair.a.id}:${pair.b.id}`} className="ai-insight">
              <div className="ai-insight-tag dup-tag">≈ Mulig dublet</div>
              <div className="ai-insight-items">
                <span className="ai-insight-text">"{pair.a.ai_summary || pair.a.raw_input}"</span>
                <span className="ai-insight-sep">og</span>
                <span className="ai-insight-text">"{pair.b.ai_summary || pair.b.raw_input}"</span>
              </div>
              <div className="ai-insight-actions">
                <button className="ai-action-btn" onClick={() => dismissPair(pair.a.id, pair.b.id)}>Behold begge</button>
                <button className="ai-action-btn danger" onClick={() => archiveFromPair(pair.a.id, pair.a.id, pair.b.id)}>Arkiver første</button>
                <button className="ai-action-btn danger" onClick={() => archiveFromPair(pair.b.id, pair.a.id, pair.b.id)}>Arkiver andet</button>
              </div>
            </div>
          ))}

          {/* AI-bekræftede dubletter */}
          {activeDuplicates.filter((p) => p.aiConfirmed).slice(0, 4).map((pair) => (
            <div key={`${pair.a.id}:${pair.b.id}`} className="ai-insight">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="ai-insight-tag dup-tag">≈ Mulig dublet</div>
                <span style={{ fontSize: 9, color: '#6A9200', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI</span>
              </div>
              <div className="ai-insight-items">
                <span className="ai-insight-text">"{pair.a.ai_summary || pair.a.raw_input}"</span>
                <span className="ai-insight-sep">og</span>
                <span className="ai-insight-text">"{pair.b.ai_summary || pair.b.raw_input}"</span>
              </div>
              {pair.reason && <div className="ai-insight-subtext">{pair.reason}</div>}
              <div className="ai-insight-actions">
                <button className="ai-action-btn" onClick={() => dismissPair(pair.a.id, pair.b.id)}>Behold begge</button>
                <button className="ai-action-btn danger" onClick={() => archiveFromPair(pair.a.id, pair.a.id, pair.b.id)}>Arkiver første</button>
                <button className="ai-action-btn danger" onClick={() => archiveFromPair(pair.b.id, pair.a.id, pair.b.id)}>Arkiver andet</button>
              </div>
            </div>
          ))}

          {/* Gruppe-forslag */}
          {groupSuggestions.map((s) => (
            <div key={s.label} className="ai-insight">
              <div className="ai-insight-tag group-tag">⊙ {s.label}</div>
              <div className="ai-insight-items">
                {s.item_ids.slice(0, 3).map((id) => {
                  const it = items.find((i) => i.id === id)
                  return it ? <span key={id} className="ai-insight-text">· {it.ai_summary || it.raw_input}</span> : null
                })}
                {s.item_ids.length > 3 && <span className="ai-insight-text" style={{ color: '#555' }}>+ {s.item_ids.length - 3} mere</span>}
              </div>
              <div className="ai-insight-subtext">{s.reasoning}</div>
              <div className="ai-insight-actions">
                <button className="ai-action-btn accent" onClick={() => applyGroupSuggestion(s.label, s.item_ids)}>Opret sag</button>
                <button className="ai-action-btn" onClick={() => setGroupSuggestions((prev) => prev.filter((g) => g.label !== s.label))}>Ignorer</button>
              </div>
            </div>
          ))}

          {/* Kør analyse igen når panel er åbent og done */}
          {aiAnalysisStatus === 'done' && (
            <button className="ai-rerun-btn" onClick={analyzeAll}>↺ Kør analyse igen</button>
          )}
        </section>
      )}

      {/* AI analyse-trigger — vises når panel er lukket og der er nok items */}
      {!aiPanelOpen && items.length >= 3 && activeFilter === 'alle' && (
        <div className="ai-trigger-row">
          <button className="ai-trigger-btn" onClick={analyzeAll}>
            ✦ AI Analyse
          </button>
          {activeDuplicates.filter((p) => !p.aiConfirmed).length > 0 && (
            <button className="ai-trigger-btn dup" onClick={() => setAiPanelOpen(true)}>
              ≈ {activeDuplicates.filter((p) => !p.aiConfirmed).length} mulige dubletter
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
                onUpdate={handleItemUpdate}
                existingGroups={existingGroups}
                onGroupUpdate={handleGroupUpdate}
                onAreaUpdate={handleAreaUpdate}
                onPriorityChange={handlePriorityChange}
                onSnooze={handleSnooze}
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

          {activeFilter === 'sager' ? (
            /* Grupperet visning */
            <div className="item-list">
              {Object.entries(
                filteredItems.reduce<Record<string, Item[]>>((acc, item) => {
                  const key = item.group_label!
                  if (!acc[key]) acc[key] = []
                  acc[key].push(item)
                  return acc
                }, {})
              ).sort(([a], [b]) => a.localeCompare(b)).map(([label, groupItems]) => (
                <div key={label} className="group-section">
                  <div className="group-header">{label} · {groupItems.length}</div>
                  {groupItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onDone={markDone}
                      onArchive={archive}
                      onBacklog={moveToBacklog}
                      onUpdate={handleItemUpdate}
                      existingGroups={existingGroups}
                      onGroupUpdate={handleGroupUpdate}
                      onAreaUpdate={handleAreaUpdate}
                      onPriorityChange={handlePriorityChange}
                      onSnooze={handleSnooze}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="item-list">
              {(isFiltered ? filteredItems : rest).map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDone={markDone}
                  onArchive={archive}
                  onBacklog={moveToBacklog}
                  onUpdate={handleItemUpdate}
                  existingGroups={existingGroups}
                  onGroupUpdate={handleGroupUpdate}
                  onAreaUpdate={handleAreaUpdate}
                  onPriorityChange={handlePriorityChange}
                  onSnooze={handleSnooze}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && filteredItems.length === 0 && (
        <div className="empty-state">
          {isFiltered
            ? 'Ingen items matcher filteret.'
            : 'Alt er styr.\nDump din næste tanke herover.'}
        </div>
      )}

      {/* Mine sager */}
      {existingGroups.length > 0 && activeFilter !== 'sager' && (
        <section className="backlog-section sager-section">
          <button className="backlog-toggle sager-toggle" onClick={() => setSagerOpen((o) => !o)}>
            <span>⊙ Mine sager</span>
            <span className="backlog-count">
              {existingGroups.length} {sagerOpen ? '▲' : '▼'}
            </span>
          </button>
          {sagerOpen && (
            <div style={{ marginTop: 8 }}>
              {existingGroups.map((label) => {
                const groupItems = items.filter((i) => i.group_label === label)
                return (
                  <div key={label} className="sager-group">
                    <div className="sager-group-header">{label} · {groupItems.length}</div>
                    <div className="item-list">
                      {groupItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onDone={markDone}
                          onArchive={archive}
                          onBacklog={moveToBacklog}
                          onUpdate={handleItemUpdate}
                          existingGroups={existingGroups}
                          onGroupUpdate={handleGroupUpdate}
                          onAreaUpdate={handleAreaUpdate}
                          onPriorityChange={handlePriorityChange}
                          onSnooze={handleSnooze}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
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
                  onUpdate={handleItemUpdate}
                  existingGroups={existingGroups}
                  onGroupUpdate={handleGroupUpdate}
                  onAreaUpdate={handleAreaUpdate}
                  onPriorityChange={handlePriorityChange}
                  onSnooze={handleSnooze}
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


      {/* Briefing modal */}
      {briefOpen && (
        <div className="modal-overlay" onClick={() => setBriefOpen(false)}>
          <div className="brief-modal" onClick={(e) => e.stopPropagation()}>
            <div className="brief-modal-header">
              <span className="brief-modal-title">Briefing</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className={`brief-mode-toggle ${briefCompareMode ? 'active' : ''}`}
                  onClick={() => { setBriefCompareMode((m) => !m); setCompareResult(null); setBriefPoints([]); setBriefType(null) }}
                  title="A/B: sammenlign Claude og GPT-4o side om side"
                >
                  A/B
                </button>
                <button className="modal-close-btn" onClick={() => setBriefOpen(false)}>×</button>
              </div>
            </div>

            <div className="brief-btns">
              {[
                ['leaving_home', 'På vej på arbejde'],
                ['leaving_work', 'Inden jeg går hjem'],
                ['going_home', 'På vej hjem'],
                ['arrived_home', 'Kommer hjem'],
                ['focus', 'Fokus nu'],
              ].map(([t, label]) => (
                <button
                  key={t}
                  className={`brief-btn ${briefType === t ? 'active' : ''} ${t === 'focus' ? 'brief-btn-focus' : ''}`}
                  onClick={() => briefCompareMode ? runCompare(t) : generateBrief(t)}
                  disabled={briefLoading || compareLoading}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Normal mode */}
            {!briefCompareMode && briefLoading && (
              <p className="brief-empty">Analyserer indbakken…</p>
            )}
            {!briefCompareMode && !briefLoading && briefPoints.length === 0 && !briefType && (
              <p className="brief-empty">Vælg situation for en handlingsrettet briefing.</p>
            )}
            {!briefCompareMode && !briefLoading && briefPoints.length === 0 && briefType && (
              <p className="brief-empty">Ingen relevante items fundet for denne situation.</p>
            )}
            {!briefCompareMode && briefPoints.length > 0 && (
              <div className="brief-cards">
                {briefPoints.map((point, idx) => (
                  <div key={idx} className="brief-card">
                    <div className="brief-card-summary">
                      {point.item ? (point.item.ai_summary || point.item.raw_input) : point.note}
                    </div>
                    {point.item && point.note !== (point.item.ai_summary || point.item.raw_input) && (
                      <div className="brief-card-note">{point.note}</div>
                    )}
                    {point.item && (
                      <div className="brief-card-actions">
                        <button className="brief-action-btn" onClick={() => handlePriorityChange(point.item!.id, point.item!.ai_priority + 1)} disabled={point.item.ai_priority >= 5}>↑</button>
                        <button className="brief-action-btn" onClick={() => handlePriorityChange(point.item!.id, point.item!.ai_priority - 1)} disabled={point.item.ai_priority <= 1}>↓</button>
                        <button className="brief-action-btn" onClick={() => handleSnooze(point.item!.id, 'tomorrow')}>I morgen</button>
                        <button className="brief-action-btn danger" onClick={() => handlePriorityChange(point.item!.id, 1)}>Ikke vigtig</button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="brief-footer">
                  <button className="speak-btn" onClick={toggleSpeak}>
                    {speaking ? <><VolumeX size={13} /><span>Stop</span></> : <><Volume2 size={13} /><span>Oplæs</span></>}
                  </button>
                </div>
              </div>
            )}

            {/* A/B compare mode */}
            {briefCompareMode && compareLoading && (
              <p className="brief-empty">Spørger begge modeller…<span className="brief-cursor">▌</span></p>
            )}
            {briefCompareMode && !compareLoading && !compareResult && (
              <p className="brief-empty">Vælg situation for at sammenligne Claude og GPT-4o.</p>
            )}
            {briefCompareMode && compareResult && (
              <div className="compare-panels">
                <div className="compare-panel">
                  <div className="compare-label">Claude Sonnet</div>
                  <p className="brief-text">{compareResult.anthropic}</p>
                </div>
                <div className="compare-panel">
                  <div className="compare-label">GPT-4o</div>
                  <p className="brief-text">{compareResult.openai}</p>
                </div>
                <p className="compare-meta">{compareResult.itemCount} items brugt som input</p>
              </div>
            )}
          </div>
        </div>
      )}


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

        /* Capture result card */
        .capture-result {
          background: var(--surface);
          border: 1.5px solid var(--accent);
          border-radius: var(--radius);
          padding: 14px 16px;
          margin-bottom: 20px;
          animation: slideIn 0.18s ease;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .capture-result-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .capture-result-badges {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .capture-result-summary {
          font-size: 15px;
          color: var(--text-1);
          line-height: 1.5;
        }

        .capture-result-dismiss {
          background: none;
          border: none;
          color: var(--text-3);
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          padding: 0 0 0 8px;
          flex-shrink: 0;
          touch-action: manipulation;
        }

        .review-badge {
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--danger);
          border: 1px solid var(--danger);
          border-radius: 4px;
          padding: 2px 6px;
          font-weight: 600;
        }

        .source-badge {
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #555;
          border: 1px solid #2A2A2A;
          border-radius: 4px;
          padding: 2px 5px;
          font-weight: 500;
        }

        .group-label-badge {
          font-size: 9px;
          letter-spacing: 0.08em;
          color: #E8FF3C;
          border: 1px solid #4A5A00;
          border-radius: 4px;
          padding: 2px 6px;
          font-weight: 600;
          cursor: pointer;
        }

        .group-attach-btn {
          font-size: 9px;
          letter-spacing: 0.06em;
          color: #3A3A3A;
          background: none;
          border: 1px dashed #2A2A2A;
          border-radius: 4px;
          padding: 2px 6px;
          cursor: pointer;
          font-family: inherit;
        }

        .group-picker {
          margin-top: 10px;
          background: #111;
          border: 1px solid #262626;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .group-picker-option {
          background: none;
          border: 1px solid #262626;
          border-radius: 6px;
          color: #A2A2A2;
          font-family: inherit;
          font-size: 12px;
          padding: 8px 12px;
          cursor: pointer;
          text-align: left;
          touch-action: manipulation;
        }

        .group-picker-option:hover { border-color: #4A4A4A; color: #F0F0F0; }
        .group-picker-option.clear { color: #555; }

        .group-picker-new {
          display: flex;
          gap: 6px;
        }

        .group-picker-input {
          flex: 1;
          background: #0C0C0C;
          border: 1px solid #262626;
          border-radius: 6px;
          color: #F0F0F0;
          font-family: inherit;
          font-size: 12px;
          padding: 8px 10px;
          outline: none;
        }

        .group-picker-save {
          background: #E8FF3C;
          border: none;
          border-radius: 6px;
          color: #080808;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          padding: 8px 12px;
          cursor: pointer;
          touch-action: manipulation;
        }

        .group-section {
          margin-bottom: 8px;
        }

        .group-header {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #E8FF3C;
          padding: 8px 0 6px;
          font-weight: 600;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          z-index: 200;
          display: flex;
          align-items: flex-end;
          padding: 0;
        }

        .modal-box {
          background: #111;
          border: 1px solid #262626;
          border-radius: 16px 16px 0 0;
          padding: 24px 20px 40px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }

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

        .item-due-overdue {
          font-size: 11px;
          color: #FF6B3C;
          letter-spacing: 0.03em;
          border: 1px solid rgba(255,107,60,0.4);
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

        .context-picker { display: none; }

        .backlog-section {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .sager-section {
          border-top-color: rgba(232,255,60,0.12);
        }

        .sager-toggle {
          color: var(--text-2) !important;
        }
        .sager-toggle:hover { color: var(--accent) !important; }

        .sager-group {
          margin-bottom: 16px;
        }

        .sager-group-header {
          font-size: 9px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #4A6A00;
          font-weight: 700;
          padding: 6px 0 8px;
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

        /* Header icon buttons */
        .header-icon-btn {
          color: var(--text-3);
          background: none;
          border: none;
          text-decoration: none;
          display: flex;
          align-items: center;
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          transition: color 0.15s;
          touch-action: manipulation;
        }
        .header-icon-btn:hover { color: var(--text-1); }

        /* Brief modal */
        .brief-modal {
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: var(--radius);
          width: 100%;
          max-width: 540px;
          padding: 22px;
          max-height: 85vh;
          overflow-y: auto;
        }

        .brief-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .brief-modal-title {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 700;
        }

        .modal-close-btn {
          background: none;
          border: none;
          color: var(--text-3);
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          touch-action: manipulation;
        }

        /* Update form */
        .update-form {
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }

        .update-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-1);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.55;
          padding: 10px 12px;
          resize: none;
          outline: none;
          transition: border-color 0.15s;
        }
        .update-input:focus { border-color: var(--border-2); }
        .update-input::placeholder { color: var(--text-3); }

        .update-form-btns {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .update-submit-btn {
          background: var(--accent);
          color: var(--bg);
          border: none;
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          padding: 10px 20px;
          cursor: pointer;
          touch-action: manipulation;
          transition: opacity 0.15s;
        }
        .update-submit-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .update-cancel-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-3);
          font-family: inherit;
          font-size: 13px;
          padding: 10px 16px;
          cursor: pointer;
          touch-action: manipulation;
        }

        /* Update result */
        .update-result {
          padding-top: 10px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .update-change {
          font-size: 12px;
          color: var(--accent);
          letter-spacing: 0.02em;
        }

        .update-result-dismiss {
          background: none;
          border: none;
          color: var(--text-3);
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          padding: 4px 0 0;
          text-align: left;
          touch-action: manipulation;
        }

        /* Brief section (nu kun i modal) */
        .brief-section {
          display: none;
        }

        .brief-btns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 14px;
        }

        .brief-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-2);
          font-family: inherit;
          font-size: 13px;
          padding: 14px 12px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.03em;
          text-align: left;
          touch-action: manipulation;
          line-height: 1.3;
        }

        .brief-btn-focus {
          grid-column: 1 / -1;
          color: var(--text-1);
          border-color: var(--border-2);
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

        .brief-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .brief-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
        }

        .brief-card-summary {
          font-size: 14px;
          color: var(--text-1);
          line-height: 1.4;
          margin-bottom: 4px;
        }

        .brief-card-note {
          font-size: 12px;
          color: var(--accent);
          margin-bottom: 10px;
          line-height: 1.4;
        }

        .brief-card-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .brief-action-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-2);
          font-family: inherit;
          font-size: 12px;
          padding: 5px 10px;
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.12s;
        }
        .brief-action-btn:hover { border-color: var(--border-2); color: var(--text-1); }
        .brief-action-btn:disabled { opacity: 0.25; cursor: not-allowed; }
        .brief-action-btn.danger { color: #FF6B3C; border-color: rgba(255,107,60,0.3); }
        .brief-action-btn.danger:hover { background: rgba(255,107,60,0.08); }

        .action-btn.prio-btn {
          font-size: 13px;
          min-width: 32px;
          padding: 6px 8px;
          color: var(--text-2);
        }
        .action-btn.prio-btn:disabled { opacity: 0.2; cursor: not-allowed; }

        .snooze-picker {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding: 8px 0 4px;
        }

        .snooze-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-2);
          font-family: inherit;
          font-size: 12px;
          padding: 7px 12px;
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.12s;
        }
        .snooze-btn:hover { border-color: var(--border-2); color: var(--text-1); }
        .snooze-btn.cancel { color: var(--text-3); }

        .brief-mode-toggle {
          background: none;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-3);
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.12em;
          padding: 4px 8px;
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.15s;
        }
        .brief-mode-toggle.active {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-bg);
        }

        .compare-panels {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .compare-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px 16px;
        }

        .compare-label {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 8px;
          font-weight: 600;
        }

        .compare-meta {
          font-size: 11px;
          color: var(--text-3);
          text-align: center;
          margin-top: 4px;
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

        /* Bottom dock — fjernet */
        .bottom-dock { display: none; }

        /* AI Sorterings-panel */
        .ai-panel {
          background: #0D0D0D;
          border: 1px solid #1E2800;
          border-radius: var(--radius);
          padding: 14px 16px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ai-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ai-panel-title {
          font-size: 9px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #4A6A00;
          font-weight: 700;
        }

        .ai-panel-close {
          background: none;
          border: none;
          color: #3A3A3A;
          font-size: 16px;
          cursor: pointer;
          line-height: 1;
          padding: 0;
          touch-action: manipulation;
        }

        .ai-panel-close:hover { color: #555; }

        .ai-insight {
          border-top: 1px solid #1A1A1A;
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ai-insight-tag {
          font-size: 9px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }

        .dup-tag {
          color: #FF9B3C;
          background: rgba(255,155,60,0.1);
          border: 1px solid rgba(255,155,60,0.2);
        }

        .group-tag {
          color: #E8FF3C;
          background: rgba(232,255,60,0.06);
          border: 1px solid rgba(232,255,60,0.15);
        }

        .ai-insight-items {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ai-insight-text {
          font-size: 13px;
          color: var(--text-2);
          line-height: 1.5;
        }

        .ai-insight-sep {
          font-size: 10px;
          color: var(--text-3);
          letter-spacing: 0.1em;
          padding: 0 2px;
        }

        .ai-insight-subtext {
          font-size: 11px;
          color: var(--text-3);
          font-style: italic;
        }

        .ai-insight-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 4px;
        }

        .ai-action-btn {
          background: none;
          border: 1px solid #262626;
          border-radius: var(--radius-sm);
          color: var(--text-3);
          font-family: inherit;
          font-size: 11px;
          padding: 6px 10px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
          touch-action: manipulation;
        }

        .ai-action-btn:hover { border-color: #3A3A3A; color: var(--text-2); }
        .ai-action-btn.accent { border-color: rgba(232,255,60,0.3); color: #E8FF3C; }
        .ai-action-btn.accent:hover { background: rgba(232,255,60,0.07); }
        .ai-action-btn.danger { border-color: rgba(255,107,60,0.2); color: #FF6B3C; }
        .ai-action-btn.danger:hover { background: rgba(255,107,60,0.07); }

        /* Trigger row */
        .ai-trigger-row {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .ai-trigger-btn {
          background: none;
          border: 1px solid #1E2800;
          border-radius: 20px;
          color: #4A6A00;
          font-family: inherit;
          font-size: 11px;
          letter-spacing: 0.06em;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .ai-trigger-btn:hover { border-color: #3A5000; color: #6A9200; }
        .ai-trigger-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ai-trigger-btn.dup { border-color: rgba(255,155,60,0.2); color: rgba(255,155,60,0.6); }
        .ai-trigger-btn.dup:hover { border-color: rgba(255,155,60,0.4); color: #FF9B3C; }

        .ai-panel-status {
          font-size: 13px;
          color: var(--text-3);
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 4px 0;
        }
        .ai-panel-status.error { color: #FF6B3C; }
        .ai-panel-status.muted { color: #4A4A4A; font-style: italic; }

        .ai-loading-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #4A6A00;
          border-radius: 50%;
          margin-right: 8px;
          animation: pulse 1s ease-in-out infinite;
          vertical-align: middle;
        }

        .ai-rerun-btn {
          background: none;
          border: none;
          color: #2A3A00;
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.1em;
          padding: 4px 0 0;
          cursor: pointer;
          touch-action: manipulation;
          margin-top: 4px;
          align-self: flex-start;
        }
        .ai-rerun-btn:hover { color: #4A6A00; }

        /* Område-filter */
        .area-filter-row {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          flex-wrap: nowrap;
          padding-bottom: 2px;
          margin-bottom: 12px;
          scrollbar-width: none;
        }
        .area-filter-row::-webkit-scrollbar { display: none; }

        .area-filter-label {
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-3);
          white-space: nowrap;
          flex-shrink: 0;
          padding-right: 2px;
        }

        .area-filter-btn {
          background: none;
          border: 1px solid #222;
          border-radius: 20px;
          color: #3A3A3A;
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 4px 10px;
          cursor: pointer;
          transition: all 0.1s;
          white-space: nowrap;
          flex-shrink: 0;
          touch-action: manipulation;
        }
        .area-filter-btn:hover { border-color: #333; color: #555; }
        .area-filter-btn.active { border-color: var(--border-2); color: var(--text-2); }

        /* Area badge på items */
        .area-badge {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid;
          cursor: pointer;
          flex-shrink: 0;
        }

        .area-picker {
          margin-top: 8px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }

        .area-picker-btn {
          background: none;
          border: 1px solid #262626;
          border-radius: 6px;
          color: #A2A2A2;
          font-family: inherit;
          font-size: 11px;
          padding: 6px 10px;
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.1s;
        }
        .area-picker-btn:hover { border-color: #3A3A3A; color: #F0F0F0; }
        .area-picker-btn.active { font-weight: 700; }

        /* Mobile */
        @media (max-width: 640px) {
          .apai-root {
            padding: 20px 14px 60px;
          }

          .capture-input {
            font-size: 17px;
            min-height: 120px;
            padding: 16px 72px 16px 16px;
          }

          .mic-btn {
            width: 54px;
            height: 54px;
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

          .sort-row { display: none; }

          .item-card { padding: 14px; }

          .action-btn {
            font-size: 12px;
            padding: 10px 8px;
          }

          .action-btn.backlog-btn { display: none; }

          .toast {
            bottom: 24px;
            font-size: 14px;
            padding: 14px 28px;
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
  onBacklog,
  onUpdate,
  onGroupUpdate,
  onAreaUpdate,
  onPriorityChange,
  onSnooze,
  existingGroups = [],
  isBacklog = false,
}: {
  item: Item
  onDone: (id: string) => void
  onArchive: (id: string) => void
  onBacklog?: (id: string) => void
  onUpdate?: (id: string, updated: Item) => void
  onGroupUpdate?: (id: string, group_label: string | null) => void
  onAreaUpdate?: (id: string, area: string) => void
  onPriorityChange?: (id: string, newPriority: number) => void
  onSnooze?: (id: string, option: string) => void
  existingGroups?: string[]
  isBacklog?: boolean
}) {
  const isTemp = item.id.startsWith('temp-')
  const color = TYPE_COLORS[item.ai_type] || '#555'
  const cardRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const updateInputRef = useRef<HTMLTextAreaElement>(null)
  const [hintOpacity, setHintOpacity] = useState({ left: 0, right: 0 })
  const [flashClass, setFlashClass] = useState('')
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [updateLoading, setUpdateLoading] = useState(false)
  const [updateChanges, setUpdateChanges] = useState<string[] | null>(null)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [newGroupInput, setNewGroupInput] = useState('')
  const [areaPickerOpen, setAreaPickerOpen] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    if (updateOpen) return
    startXRef.current = e.touches[0].clientX
    currentXRef.current = 0
  }

  function onTouchMove(e: React.TouchEvent) {
    if (updateOpen) return
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
    if (updateOpen) return
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

  function openUpdate() {
    setUpdateOpen(true)
    setUpdateChanges(null)
    setTimeout(() => updateInputRef.current?.focus(), 50)
  }

  async function submitUpdate() {
    if (!updateText.trim() || updateLoading) return
    setUpdateLoading(true)
    try {
      const res = await fetch(`/api/items/${item.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_text: updateText,
          current: { ai_type: item.ai_type, ai_summary: item.ai_summary, ai_priority: item.ai_priority, context_trigger: item.context_trigger },
        }),
      })
      const data = await res.json()
      if (data.item && onUpdate) onUpdate(item.id, data.item)
      setUpdateChanges(data.changes ?? ['Opdateret'])
      setUpdateOpen(false)
      setUpdateText('')
    } catch {
      setUpdateChanges(['Kunne ikke opdatere — prøv igen'])
      setUpdateOpen(false)
    }
    setUpdateLoading(false)
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
          {item.group_label && (
            <span
              className="group-label-badge"
              onClick={(e) => { e.stopPropagation(); setGroupPickerOpen((o) => !o) }}
              title="Skift sag"
            >
              {item.group_label}
            </span>
          )}
          {!item.group_label && onGroupUpdate && (
            <button
              className="group-attach-btn"
              onClick={(e) => { e.stopPropagation(); setGroupPickerOpen((o) => !o) }}
            >
              ~ sag
            </button>
          )}
          {item.ai_context?.startsWith('todoist:') && (
            <span className="source-badge">Todoist</span>
          )}
          {item.ai_context === 'pdf_import' && (
            <span className="source-badge">PDF</span>
          )}
          {item.ai_context === 'bulk_import' && (
            <span className="source-badge">Liste</span>
          )}
          {item.ai_context && !item.ai_context.startsWith('todoist:') && item.ai_context !== '__review__' && item.ai_context !== 'pdf_import' && item.ai_context !== 'bulk_import' && (
            <span className="item-context">↳ {item.ai_context}</span>
          )}
          {item.due_at && <span className={isDuePast(item.due_at) ? 'item-due-overdue' : 'item-due'}>{formatDueAt(item.due_at)}</span>}
          <span className="item-priority">{PRIORITY_DOT(item.ai_priority)}</span>
          {(item.ai_type === 'none' || item.ai_context === '__review__') && (
            <span className="review-badge">til review</span>
          )}
          {item.area && item.area !== 'andet' && (
            <span
              className="area-badge"
              style={{ color: AREA_COLORS[item.area] ?? '#555', borderColor: (AREA_COLORS[item.area] ?? '#555') + '40' }}
              onClick={(e) => { e.stopPropagation(); setAreaPickerOpen((o) => !o) }}
              title="Skift område"
            >
              {AREA_LABELS[item.area] ?? item.area}
            </span>
          )}
          {(!item.area || item.area === 'andet') && onAreaUpdate && (
            <button
              className="group-attach-btn"
              style={{ color: '#2A2A2A', borderColor: '#1E1E1E' }}
              onClick={(e) => { e.stopPropagation(); setAreaPickerOpen((o) => !o) }}
            >
              + område
            </button>
          )}
        </div>
        {item.ai_summary && item.ai_summary !== item.raw_input && (
          <div className="item-raw">{item.raw_input}</div>
        )}
      </div>

      {/* Update-feedback */}
      {updateChanges && (
        <div className="update-result">
          {updateChanges.map((c, i) => <div key={i} className="update-change">✓ {c}</div>)}
          <button className="update-result-dismiss" onClick={() => setUpdateChanges(null)}>OK</button>
        </div>
      )}

      {/* Update-form */}
      {updateOpen && (
        <div className="update-form">
          <textarea
            ref={updateInputRef}
            className="update-input"
            placeholder="Hvad er nyt? fx 'venter på svar', 'hæv prioritet', 'ikke relevant mere'…"
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setUpdateOpen(false); setUpdateText('') } }}
            rows={2}
          />
          <div className="update-form-btns">
            <button className="update-submit-btn" onClick={submitUpdate} disabled={!updateText.trim() || updateLoading}>
              {updateLoading ? '…' : 'Gem'}
            </button>
            <button className="update-cancel-btn" onClick={() => { setUpdateOpen(false); setUpdateText('') }}>
              Annuller
            </button>
          </div>
        </div>
      )}

      {/* Gruppe-picker */}
      {groupPickerOpen && onGroupUpdate && (
        <div className="group-picker">
          {existingGroups.filter((g) => g !== item.group_label).map((g) => (
            <button
              key={g}
              className="group-picker-option"
              onClick={() => { onGroupUpdate(item.id, g); setGroupPickerOpen(false) }}
            >
              {g}
            </button>
          ))}
          <div className="group-picker-new">
            <input
              className="group-picker-input"
              placeholder="Ny sag…"
              value={newGroupInput}
              onChange={(e) => setNewGroupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroupInput.trim()) {
                  onGroupUpdate(item.id, newGroupInput.trim())
                  setNewGroupInput('')
                  setGroupPickerOpen(false)
                }
                if (e.key === 'Escape') setGroupPickerOpen(false)
              }}
              autoFocus
            />
            <button
              className="group-picker-save"
              disabled={!newGroupInput.trim()}
              onClick={() => {
                if (newGroupInput.trim()) {
                  onGroupUpdate(item.id, newGroupInput.trim())
                  setNewGroupInput('')
                  setGroupPickerOpen(false)
                }
              }}
            >
              OK
            </button>
          </div>
          {item.group_label && (
            <button
              className="group-picker-option clear"
              onClick={() => { onGroupUpdate(item.id, null); setGroupPickerOpen(false) }}
            >
              Fjern fra sag
            </button>
          )}
        </div>
      )}

      {/* Område-picker */}
      {areaPickerOpen && onAreaUpdate && (
        <div className="area-picker">
          {(['smu', 'gca', 'privat', 'familie', 'andet'] as const).map((a) => (
            <button
              key={a}
              className={`area-picker-btn ${item.area === a ? 'active' : ''}`}
              style={item.area === a ? { borderColor: AREA_COLORS[a], color: AREA_COLORS[a] } : {}}
              onClick={() => { onAreaUpdate(item.id, a); setAreaPickerOpen(false) }}
            >
              {AREA_LABELS[a]}
            </button>
          ))}
          <button
            className="area-picker-btn"
            style={{ color: '#3A3A3A' }}
            onClick={() => setAreaPickerOpen(false)}
          >
            Luk
          </button>
        </div>
      )}

      {/* Handlinger */}
      {!isTemp && !updateOpen && !groupPickerOpen && !snoozeOpen && (
        <div className="item-actions">
          {onPriorityChange && (
            <>
              <button
                className="action-btn prio-btn"
                onClick={() => onPriorityChange(item.id, item.ai_priority + 1)}
                disabled={item.ai_priority >= 5}
                title="Vigtigere"
              >↑</button>
              <button
                className="action-btn prio-btn"
                onClick={() => onPriorityChange(item.id, item.ai_priority - 1)}
                disabled={item.ai_priority <= 1}
                title="Mindre vigtig"
              >↓</button>
            </>
          )}
          {onSnooze && (
            <button className="action-btn" onClick={() => setSnoozeOpen(true)}>Snooze</button>
          )}
          <button className="action-btn update-btn" onClick={openUpdate}>Opdatér</button>
          <button className="action-btn done" onClick={() => onDone(item.id)}>Færdig</button>
          {isBacklog ? (
            <button className="action-btn" onClick={() => onBacklog?.(item.id)}>→ Indbakke</button>
          ) : (
            <button className="action-btn not-task-btn" onClick={() => onArchive(item.id)}>Ikke en opgave</button>
          )}
        </div>
      )}
      {snoozeOpen && (
        <div className="snooze-picker">
          <button className="snooze-btn" onClick={() => { onSnooze?.(item.id, 'today'); setSnoozeOpen(false) }}>4 timer</button>
          <button className="snooze-btn" onClick={() => { onSnooze?.(item.id, 'tomorrow'); setSnoozeOpen(false) }}>I morgen</button>
          <button className="snooze-btn" onClick={() => { onSnooze?.(item.id, 'week'); setSnoozeOpen(false) }}>Næste uge</button>
          <button className="snooze-btn cancel" onClick={() => setSnoozeOpen(false)}>Annuller</button>
        </div>
      )}
    </div>
  )
}
