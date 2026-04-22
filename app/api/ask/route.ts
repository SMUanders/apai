import { NextRequest, NextResponse } from 'next/server'
import { complete } from '@/lib/ai'
import { Item } from '@/lib/supabase'

const SYSTEM = `Du er APAI, et personligt AI-hukommelsessystem. Brugeren spørger om sine gemte items.
Svar på dansk — præcist og kort, max 3 sætninger.
Returner KUN gyldig JSON:
{
  "answer": "dit svar her",
  "relevant_indices": [liste af 0-baserede indeksnumre for relevante items, max 5]
}`

export async function POST(req: NextRequest) {
  const { question, items } = (await req.json()) as { question: string; items: Item[] }

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Mangler spørgsmål' }, { status: 400 })
  }

  const itemsText = items
    .map((item, idx) => `[${idx}] ${item.ai_summary || item.raw_input} (${item.ai_type}, prio ${item.ai_priority})`)
    .join('\n')

  const text = await complete(SYSTEM, `Mine items:\n${itemsText || '(ingen items)'}\n\nSpørgsmål: ${question}`, 500)
  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  const relevantItems = ((parsed.relevant_indices as number[]) ?? [])
    .filter((i) => i >= 0 && i < items.length)
    .map((i) => items[i])

  return NextResponse.json({ answer: parsed.answer, items: relevantItems })
}
