import { NextResponse } from 'next/server'
import { generateVerifier, challengeFromVerifier } from '@/lib/pkce'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'

export async function GET() {
  requiredEnv()
  const session = await getSession()

  const codeVerifier = generateVerifier()
  const codeChallenge = challengeFromVerifier(codeVerifier)

  session.codeVerifier = codeVerifier
  await session.save()

  const url = new URL(config.VINCERE_ID_BASE + '/oauth2/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.VINCERE_CLIENT_ID)
  url.searchParams.set('redirect_uri', config.REDIRECT_URI)
  url.searchParams.set('scope', 'openid')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', crypto.randomUUID())

  return NextResponse.redirect(url.toString())
}
