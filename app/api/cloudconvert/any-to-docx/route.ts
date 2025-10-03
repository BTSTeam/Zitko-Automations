// app/api/cloudconvert/any-to-docx/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

type CCJob = {
  data: {
    id: string
    status: string
    tasks: Array<{
      id: string
      name: string
      operation: string
      status: string
      result?: any
    }>
  }
}

const CC_API = 'https://api.cloudconvert.com/v2'

async function cc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.CLOUDCONVERT_API_KEY
  if (!token) throw new Error('Missing CLOUDCONVERT_API_KEY')

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${CC_API}${path}`, { ...init, headers: { ...headers, ...(init.headers as any) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`CloudConvert error ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text as unknown as T }
}

async function pollJob(jobId: string, timeoutMs = 110_000, intervalMs = 1500): Promise<CCJob> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = await cc<CCJob>(`/jobs/${jobId}`, { method: 'GET' })
    if (job?.data?.status === 'finished') return job
    if (job?.data?.status === 'error') throw new Error('CloudConvert job failed')
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error('CloudConvert job polling timed out')
}

const MAX_BYTES = 20 * 1024 * 1024 // 20MB safeguard (tune as needed)

export async function POST(req: NextRequest) {
  try {
    if (!process.env.CLOUDCONVERT_API_KEY) {
      return NextResponse.json({ ok: false, error: 'Conversion not configured (CLOUDCONVERT_API_KEY missing).' }, { status: 500 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large' }, { status: 413 })
    }

    const name = (file as any).name || 'document'
    // 1) Create job: import/upload -> convert(any->docx) -> export/url
    const createJob = await cc<CCJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        tasks: {
          'import-my-file': { operation: 'import/upload' },
          'convert-to-docx': {
            operation: 'convert',
            input: 'import-my-file',
            output_format: 'docx',
            // Let CloudConvert infer input format; optionally pass input_format if you wish
            // input_format: 'pdf' | 'rtf' | 'odt' ...
            engine: 'office',
          },
          'export-file': {
            operation: 'export/url',
            input: 'convert-to-docx',
            inline: false,
            archive_multiple_files: false,
          },
        },
      }),
    })

    const jobId = createJob?.data?.id
    const importTask = createJob?.data?.tasks?.find(t => t.operation === 'import/upload')
    const uploadUrl: string | undefined = importTask?.result?.form?.url
    const uploadFields: Record<string, string> = importTask?.result?.form?.parameters || {}
    if (!jobId || !uploadUrl) throw new Error('Failed to create CloudConvert job')

    // 2) Upload original file
    const uploadForm = new FormData()
    Object.entries(uploadFields).forEach(([k, v]) => uploadForm.append(k, v))
    uploadForm.append('file', file, name)

    const uploadRes = await fetch(uploadUrl, { method: 'POST', body: uploadForm })
    if (!uploadRes.ok) throw new Error(`Upload to CloudConvert failed: ${uploadRes.status} ${await uploadRes.text()}`)

    // 3) Wait → 4) Download exported DOCX
    const finished = await pollJob(jobId)
    const exportTask = finished.data.tasks.find(t => t.operation === 'export/url' && t.status === 'finished')
    const doc = exportTask?.result?.files?.[0]
    if (!doc?.url) throw new Error('CloudConvert export URL not found')

    const docxRes = await fetch(doc.url)
    if (!docxRes.ok) throw new Error(`Fetch converted DOCX failed: ${docxRes.status} ${await docxRes.text()}`)
    const buf = Buffer.from(await docxRes.arrayBuffer())
    const outName = name.replace(/\.[^.]+$/, '') + '.docx'

    return new NextResponse(new Uint8Array(buf).buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `inline; filename="${outName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

