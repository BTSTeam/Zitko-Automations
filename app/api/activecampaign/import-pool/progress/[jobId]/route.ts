// app/api/activecampaign/import-pool/progress/[jobId]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const JOBS_KEY = '__AC_IMPORT_JOBS__'
const jobs: Map<string, any> = (globalThis as any)[JOBS_KEY] || new Map()
;(globalThis as any)[JOBS_KEY] = jobs

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      // first tick
      send(jobs.get(jobId) || { status: 'not-found', jobId })

      const iv = setInterval(() => {
        const job = jobs.get(jobId)
        if (!job) {
          send({ status: 'not-found', jobId })
          clearInterval(iv)
          controller.close()
          return
        }
        send(job)
        if (job.status !== 'running') {
          clearInterval(iv)
          controller.close()
        }
      }, 1000)
    },
    cancel() {},
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
