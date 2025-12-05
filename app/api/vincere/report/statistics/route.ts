import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { config, requiredEnv } from "@/lib/config"
import { refreshIdToken } from "@/lib/vincereRefresh"

const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, "")

async function fetchWithRefresh(url: string, idToken: string, userKey: string) {
  const headers = new Headers()
  headers.set("id-token", idToken)
  headers.set("x-api-key", config.VINCERE_API_KEY)
  headers.set("accept", "application/json")

  let res = await fetch(url, { method: "GET", headers, cache: "no-store" })

  if (res.status === 401 || res.status === 403) {
    const refreshed = await refreshIdToken(userKey)
    if (refreshed) {
      const s2: any = await getSession()
      const newId = s2.tokens?.idToken
      if (newId) {
        headers.set("id-token", newId)
        res = await fetch(url, { method: "GET", headers, cache: "no-store" })
      }
    }
  }

  return res
}

export async function GET(req: NextRequest) {
  try {
    requiredEnv()

    const session: any = await getSession()
    const idToken = session.tokens?.idToken || ""
    const userKey = session.user?.email || session.sessionId || "anonymous"

    if (!idToken)
      return NextResponse.json({ error: "Not connected to Vincere" }, { status: 401 })

    const consultantId = req.nextUrl.searchParams.get("consultant_id")
    const period = req.nextUrl.searchParams.get("period") || "CURRENT_MONTH"

    const url = `${BASE}/api/v2/report/statistics?consultant_id=${consultantId}&period=${period}`

    const res = await fetchWithRefresh(url, idToken, userKey)
    const text = await res.text()

    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ raw: text })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 })
  }
}
