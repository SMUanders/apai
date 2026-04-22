import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Item } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// POST /api/ask — semantisk søgning via Claude
export async function POST(req: NextRequest) {
  const { question, items } = (await req.json()) as { question: string; items: Item[] }

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Mangler spørgsmål' }, { status: 400 })
  }

  const itemsText = items
    .map((item, idx) => `[${idx}] ${item.ai_summary || item.raw_input} (${item.ai_type}, prio ${item.ai_priority})`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: `Du er APAI, et personligt AI-hukommelsessystem. Brugeren spørger om sine gemte items.
Svar på dansk — præcist og kort, max 3 sætninger.
Returner KUN gyldig JSON:
{
  "answer": "dit svar her",
  "relevant_indices": [liste af 0-baserede indeksnumre for relevante items, max 5]
}`,
    messages: [
      {
        role: 'user',
        content: `Mine items:\n${itemsText || '(ingen items)'}\n\nSpørgsmål: ${question}`,
      },
    ],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  const relevantItems = ((parsed.relevant_indices as number[]) ?? [])
    .filter((i) => i >= 0 && i < items.length)
    .map((i) => items[i])

  return NextResponse.json({ answer: parsed.answer, items: relevantItems })
}
