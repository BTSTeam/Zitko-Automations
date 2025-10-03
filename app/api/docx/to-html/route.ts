// app/api/docx/to-html/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import sanitizeHtml from 'sanitize-html'

const MAX_BYTES = 20 * 1024 * 1024
const CC_API = 'https://api.cloudconvert.com/v2'

async function cc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.CLOUDCONVERT_API_KEY
  if (!token) throw new Error('Missing CLOUDCONVERT_API_KEY')
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` }
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${CC_API}${path}`, { ...init, headers: { ...headers, ...(init.headers as any) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`CloudConvert HTTP ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text as unknown as T }
}
type CCTask = { id:string; name:string; operation:string; status:string; result?: any }
type CCJob = { data: { id:string; status:string; tasks: CCTask[] } }
function taskError(job: CCJob): string | null {
  const t = job?.data?.tasks?.find(x => x.status === 'error')
  if (!t) return null
  return t.result?.message || (t.result?.errors?.[0]?.message) || t.result?.code || 'Unknown CloudConvert task error'
}
async function poll(jobId: string, ms = 180000): Promise<CCJob> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const job = await cc<CCJob>(`/jobs/${jobId}`, { method: 'GET' })
    if (job.data.status === 'finished') return job
    if (job.data.status === 'error') throw new Error(taskError(job) || 'CloudConvert job failed')
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('CloudConvert job polling timed out')
}

async function mammothConvert(arrayBuffer: ArrayBuffer): Promise<string> {
  const mAny = mammoth as any
  const convertImage =
    mAny?.images?.inline?.() ??
    mAny?.images?.imgElement?.((image: any) =>
      image.read('base64').then((b64: string) => ({ src: `data:${image.contentType};base64,${b64}` }))
    )
  const { value: rawHtml } = await mammoth.convertToHtml(
    { buffer: Buffer.from(arrayBuffer) },
    convertImage ? { convertImage } : undefined
  )
  return rawHtml
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large' }, { status: 413 })
    }

    const name = (file as any).name || 'document.docx'
    const buf = await file.arrayBuffer()

    let html: string | null = null

    // Prefer CloudConvert for DOCX if key is present (better fidelity)
    const isDocx = /\.docx$/i.test(name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    if (isDocx && process.env.CLOUDCONVERT_API_KEY) {
      try {
        // import/upload -> convert(docx->html, engine=office) -> export/url
        const create = await cc<CCJob>('/jobs', {
          method: 'POST',
          body: JSON.stringify({
            tasks: {
              'import-my-file': { operation: 'import/upload' },
              'convert-to-html': {
                operation: 'convert',
                input: 'import-my-file',
                input_format: 'docx',
                output_format: 'html',
                engine: 'office',
              },
              'export-file': { operation: 'export/url', input: 'convert-to-html', inline: false, archive_multiple_files: false }
            }
          })
        })
        const jobId = create.data.id
        const importTask = create.data.tasks.find(t => t.operation === 'import/upload')
        const uploadUrl = importTask?.result?.form?.url
        const uploadFields: Record<string, string> = importTask?.result?.form?.parameters || {}
        if (!jobId || !uploadUrl) throw new Error('Failed to create CloudConvert job')

        const up = new FormData()
        Object.entries(uploadFields).forEach(([k, v]) => up.append(k, v))
        up.append('file', file, name)
        const upRes = await fetch(uploadUrl, { method: 'POST', body: up })
        if (!upRes.ok) throw new Error(`Upload to CloudConvert failed: ${upRes.status} ${await upRes.text()}`)

        const finished = await poll(jobId)
        const exportTask = finished.data.tasks.find(t => t.operation === 'export/url' && t.status === 'finished')
        const f = exportTask?.result?.files?.[0]
        if (!f?.url) throw new Error(taskError(finished) || 'No export URL')

        const htmlRes = await fetch(f.url)
        if (!htmlRes.ok) throw new Error(`Fetch HTML failed: ${htmlRes.status} ${await htmlRes.text()}`)
        html = await htmlRes.text()
      } catch (e) {
        console.warn('[docx/to-html] CloudConvert path failed, falling back to Mammoth:', e)
      }
    }

    // Fallback to Mammoth
    if (!html) {
      html = await mammothConvert(buf)
    }

    // Sanitize
    const safe = sanitizeHtml(html, {
      allowedTags: [
        'h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','b','i','u',
        'table','thead','tbody','tr','th','td','blockquote','hr','br','span','img','div'
      ],
      allowedAttributes: {
        a: ['href','title'],
        img: ['src','alt','width','height','style'],
        '*': ['style','colspan','rowspan','align']
      },
      allowedSchemes: ['http', 'https', 'data', 'mailto', 'tel']
    })

    return NextResponse.json({ ok: true, html: safe })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
