import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PDF_PROMPT = `Du er en assistent der udtrækker opgaver fra dokumenter.

Udtræk alle selvstændige opgave- eller huskelinjer.
Returner KUN et JSON-array af strings — én string per linje.
Ignorer: overskrifter, sidetal, datoer, adresser, tabel-headers, blanke linjer og generel boilerplate.
Bevar den originale formulering på linjen.

Eksempel output: ["Køb mælk", "Ring til læge", "Send rapport til Lars"]`

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    return handlePDF(req)
  }
  return handleText(req)
}

async function handlePDF(req: NextRequest): Promise<Response> {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Ingen fil' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Kun PDF understøttes' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF må max være 10 MB' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await (client.messages.create as any)({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: PDF_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: 'Udtræk alle opgavelinjer.' },
        ],
      }],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (message as any).content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('')

    const lines: string[] = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ lines: lines.filter((l) => l?.trim().length >= 3), source: 'pdf' })
  } catch (err) {
    return NextResponse.json({ error: `PDF-parsing fejlede: ${err}` }, { status: 500 })
  }
}

async function handleText(req: NextRequest): Promise<Response> {
  const { text } = await req.json() as { text: string }
  if (!text?.trim()) return NextResponse.json({ error: 'Ingen tekst' }, { status: 400 })

  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[\s\-\*\•\d\.]+/, '').trim()) // strip bullets/numbers
    .filter((l) => l.length >= 3)
    .filter((l) => !/^[-=*_]{3,}$/.test(l)) // separator lines

  return NextResponse.json({ lines, source: 'text' })
}
