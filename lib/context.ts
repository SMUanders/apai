export type ContextTrigger = 'home' | 'work' | 'leaving' | 'morning' | 'evening' | 'anytime'

export const CONTEXT_META: Record<ContextTrigger, { icon: string; label: string }> = {
  morning: { icon: '🌅', label: 'Morgen' },
  work:    { icon: '💼', label: 'Arbejde' },
  leaving: { icon: '🚗', label: 'På vej hjem' },
  evening: { icon: '🏠', label: 'Hjemme' },
  anytime: { icon: '',   label: '' },
  home:    { icon: '🏠', label: 'Hjemme' },
}

export function detectCurrentContext(): ContextTrigger {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 9)   return 'morning'
  if (hour >= 9 && hour < 16)  return 'work'
  if (hour >= 16 && hour < 18) return 'leaving'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'anytime'
}

export function getRelevantTriggers(current: ContextTrigger): ContextTrigger[] {
  const map: Record<ContextTrigger, ContextTrigger[]> = {
    morning: ['morning', 'work', 'anytime'],
    work:    ['work', 'anytime'],
    leaving: ['leaving', 'home', 'anytime'],
    evening: ['evening', 'home', 'anytime'],
    anytime: ['anytime'],
    home:    ['home', 'anytime'],
  }
  return map[current]
}

const OVERRIDE_KEY = 'apai_context_override'
const TTL_MS = 2 * 60 * 60 * 1000

export function getContextOverride(): ContextTrigger | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    if (!raw) return null
    const { value, expires } = JSON.parse(raw)
    if (Date.now() > expires) { localStorage.removeItem(OVERRIDE_KEY); return null }
    return value as ContextTrigger
  } catch { return null }
}

export function setContextOverride(ctx: ContextTrigger) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ value: ctx, expires: Date.now() + TTL_MS }))
}

export function clearContextOverride() {
  localStorage.removeItem(OVERRIDE_KEY)
}
