export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import crypto from 'crypto'

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function sha256(input: string) {
  const hash = crypto.createHash('sha256').update(input).digest()
  return base64url(hash)
}

export async function GET(req: NextRequest) {
  requiredEnv()

  // PKCE: create verifier + challenge
  const codeVerifier = base64url(crypto.randomBytes(32))
  const codeChallenge = await sha256(codeVerifier)

  // save verifier in session
  const session = await getSession()
  session.codeVerifier = codeVerifier
  await session.save()

  // build authorize URL
  const auth = new URL(`${config.VINCERE_ID_BASE.replace(/\/$/, '')}/oauth2/authorize`)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('client_id', config.VINCERE_CLIENT_ID)
  auth.searchParams.set('redirect_uri', config.REDIRECT_URI)
  auth.searchParams.set('code_challenge_method', 'S256')
  auth.searchParams.set('code_challenge', codeChallenge)
  // optional scope/state – tweak if Vincere requires specific scopes
  auth.searchParams.set('scope', 'openid offline_access')
  auth.searchParams.set('state', 'state')

  return NextResponse.redirect(auth.toString())
}
