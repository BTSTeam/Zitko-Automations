// app/api/cv/upload/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'

// Optionally use your existing refresh helper if you have one, otherwise just read session
async function getIdToken() {
  const session = await getSession()
  const id = session.tokens?.idToken
  if (!id) throw new Error('Not connected to Vincere: missing id-token in session')
  return id
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const candidateId = (form.get('candidateId') || '').toString().trim()
    const documentTypeId = Number(form.get('document_type_id') || 1) // <- adjust default if needed
    const originalCv = (form.get('original_cv') ?? 'true').toString() === 'true'
    const expiryDate = (form.get('expiry_date') || '').toString().trim() // optional
    const creatorIdRaw = (form.get('creator_id') || '').toString().trim() // optional
    const creatorId = creatorIdRaw ? Number(creatorIdRaw) : undefined

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Missing file (form-data key "file")' }, { status: 400 })
    }
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'Missing candidateId' }, { status: 400 })
    }

    // 1) Upload file to Blob to get a durable URL (preferred pattern for Vincere url-based attach)
    let blobUrl: string
    try {
      const putResp = await put(file.name || 'upload.bin', file, { access: 'private' })
      blobUrl = putResp.url
    } catch (err: any) {
      console.error('[BLOB] put() failed:', err?.message || err)
      return NextResponse.json({ ok: false, error: 'Blob upload failed' }, { status: 500 })
    }

    // 2) Build Vincere JSON body (using URL rather than base64)
    const payload: Record<string, any> = {
      file_name: file.name || 'document.bin',
      document_type_id: documentTypeId,
      url: blobUrl,
      base_64_content: "",         // leave empty when using url
      original_cv: originalCv,
    }
    if (expiryDate) payload.expiry_date = expiryDate
    if (typeof creatorId === 'number') payload.creator_id = creatorId

    // 3) POST to Vincere
    const idToken = await getIdToken()
    const tenantBase = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    // Your example shows the ID domain, but Vincere’s REST is usually under the Tenant API base you already use elsewhere.
    // If your working endpoints use the full domain "https://zitko.vincere.io/api/v2", then set VINCERE_TENANT_API_BASE to that format.
    const url = `${tenantBase}/candidate/${candidateId}/file`

    const headers = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
    }

    const vincereResp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const vincereText = await vincereResp.text().catch(() => '')

    // Debug logs visible in Vercel → Project → Functions → Logs
    console.log('[CV UPLOAD] to Vincere:', {
      url,
      status: vincereResp.status,
      // never log secrets
      headersSent: { accept: headers.accept, 'content-type': headers['content-type'], 'id-token': '[redacted]', 'x-api-key': '[redacted]' },
      payload,
      blobUrl,
    })
    if (!vincereResp.ok) {
      console.error('[CV UPLOAD] Vincere response:', vincereText)
      return NextResponse.json({
        ok: false,
        blobUrl,
        vincere: { status: vincereResp.status, body: vincereText.slice(0, 2000) }
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      candidateId,
      file: { name: payload.file_name, size: file.size, type: file.type },
      blobUrl,
      vincere: { status: vincereResp.status, body: vincereText.slice(0, 2000) }
    })
  } catch (err: any) {
    console.error('[CV UPLOAD] Fatal:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || 'Upload failed' }, { status: 500 })
  }
}
