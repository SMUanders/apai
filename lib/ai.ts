import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const PROVIDER = (process.env.AI_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai'
const MODEL_OVERRIDE = process.env.AI_MODEL

const DEFAULT_MODEL = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
}

// Lazy clients — avoids errors when env vars aren't present at build time
let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

/** Standard text completion — works with both providers */
export async function complete(
  system: string,
  user: string,
  maxTokens = 400,
  modelOverride?: string
): Promise<string> {
  if (PROVIDER === 'openai') return completeOpenAI(system, user, maxTokens)
  return completeAnthropic(system, user, maxTokens, modelOverride)
}

async function completeAnthropic(system: string, user: string, maxTokens: number, modelOverride?: string): Promise<string> {
  const model = modelOverride ?? MODEL_OVERRIDE ?? DEFAULT_MODEL.anthropic
  const message = await anthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

async function completeOpenAI(system: string, user: string, maxTokens: number): Promise<string> {
  const model = MODEL_OVERRIDE ?? DEFAULT_MODEL.openai
  const res = await openai().chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}

/**
 * PDF completion — Anthropic only (document content type).
 * Falls back to Anthropic regardless of AI_PROVIDER.
 */
export async function completeWithPDF(
  system: string,
  user: string,
  pdfBase64: string,
  maxTokens = 2000
): Promise<string> {
  const model = MODEL_OVERRIDE ?? DEFAULT_MODEL.anthropic
  const message = await anthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: user },
      ],
    }],
  })
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/**
 * Streaming completion — returns a ReadableStream of text chunks + a Promise
 * that resolves with the full concatenated text once streaming is complete.
 * Useful for UI streaming + server-side post-processing (e.g. saving to DB).
 */
export function completeStream(
  system: string,
  user: string,
  maxTokens = 150
): { stream: ReadableStream<Uint8Array>; fullText: Promise<string> } {
  let resolveFull!: (text: string) => void
  const fullText = new Promise<string>((r) => { resolveFull = r })

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = ''
      try {
        if (PROVIDER === 'openai') {
          const model = MODEL_OVERRIDE ?? DEFAULT_MODEL.openai
          const oaiStream = await openai().chat.completions.create({
            model, max_tokens: maxTokens, stream: true,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          })
          for await (const chunk of oaiStream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) { accumulated += text; controller.enqueue(new TextEncoder().encode(text)) }
          }
        } else {
          const model = MODEL_OVERRIDE ?? DEFAULT_MODEL.anthropic
          const s = anthropic().messages.stream({
            model, max_tokens: maxTokens, system,
            messages: [{ role: 'user', content: user }],
          })
          for await (const chunk of s) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              accumulated += chunk.delta.text
              controller.enqueue(new TextEncoder().encode(chunk.delta.text))
            }
          }
        }
      } finally {
        controller.close()
        resolveFull(accumulated)
      }
    },
  })

  return { stream: readable, fullText }
}

export { PROVIDER }
