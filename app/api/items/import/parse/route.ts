import { NextRequest, NextResponse } from 'next/server'
import { completeWithPDF } from '@/lib/ai'

const PDF_PROMPT = `Du er en assistent der udtrækker opgaver fra dokumenter.

Udtræk alle selvstændige opgave- eller huskelinjer.
Returner KUN et JSON-array af strings — én string per linje.
Ignorer: overskrifter, sidetal, datoer, adresser, tabel-headers, blanke linjer og generel boilerplate.
Bevar den originale formulering på linjen.

Eksempel output: ["Køb mælk", "Ring til læge", "Send rapport til Lars"]`

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      return await handlePDF(req)
    }
    return await handleText(req)
  } catch (err) {
    return NextResponse.json({ error: `Intern fejl: ${String(err)}` }, { status: 500 })
  }
}

async function handlePDF(req: NextRequest): Promise<Response> {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return NextResponse.json({ error: `Kunne ikke læse fildata: ${String(err)}` }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Ingen fil uploadet' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Kun PDF-filer understøttes' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF må max være 10 MB' }, { status: 400 })
  }

  let base64: string
  try {
    const bytes = await file.arrayBuffer()
    base64 = Buffer.from(bytes).toString('base64')
  } catch (err) {
    return NextResponse.json({ error: `Kunne ikke læse PDF: ${String(err)}` }, { status: 400 })
  }

  try {
    const text = await completeWithPDF(PDF_PROMPT, 'Udtræk alle opgavelinjer.', base64, 2000)

    let lines: string[]
    try {
      lines = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    }

    return NextResponse.json({
      lines: lines.filter((l) => typeof l === 'string' && l.trim().length >= 3),
      source: 'pdf',
    })
  } catch (err) {
    return NextResponse.json({ error: `AI-parsing fejlede: ${String(err)}` }, { status: 500 })
  }
}

async function handleText(req: NextRequest): Promise<Response> {
  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON i request' }, { status: 400 })
  }

  const { text } = body
  if (!text?.trim()) return NextResponse.json({ error: 'Ingen tekst' }, { status: 400 })

  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[\s\-\*\•\d\.]+/, '').trim())
    .filter((l) => l.length >= 3)
    .filter((l) => !/^[-=*_]{3,}$/.test(l))

  return NextResponse.json({ lines, source: 'text' })
}
