// lib/config.ts

type Cfg = {
  // Vincere (core)
  VINCERE_ID_BASE: string
  VINCERE_TENANT_API_BASE: string
  VINCERE_CLIENT_ID: string
  VINCERE_API_KEY: string
  REDIRECT_URI: string

  // Optional (app-wide)
  SESSION_PASSWORD?: string
  OPENAI_API_KEY?: string

  // ActiveCampaign (optional globally; required by AC routes)
  AC_BASE_URL?: string
  AC_API_TOKEN?: string

  // Apollo (OAuth 2.0)
  APOLLO_CLIENT_ID?: string
  APOLLO_CLIENT_SECRET?: string
  APOLLO_REDIRECT_URI?: string
  APOLLO_SCOPES?: string
  APOLLO_API_KEY?: string           // optional legacy API key
}

export const config: Cfg = {
  // Vincere (core)
  VINCERE_ID_BASE: process.env.VINCERE_ID_BASE || '',
  VINCERE_TENANT_API_BASE: process.env.VINCERE_TENANT_API_BASE || '',
  VINCERE_CLIENT_ID: process.env.VINCERE_CLIENT_ID || '',
  VINCERE_API_KEY: process.env.VINCERE_API_KEY || '',
  REDIRECT_URI: process.env.REDIRECT_URI || '',

  // Optional (app-wide)
  SESSION_PASSWORD: process.env.SESSION_PASSWORD,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // ActiveCampaign
  AC_BASE_URL: process.env.AC_BASE_URL,
  AC_API_TOKEN: process.env.AC_API_TOKEN,

  // Apollo (OAuth 2.0)
  APOLLO_CLIENT_ID: process.env.APOLLO_OAUTH_CLIENT_ID,
  APOLLO_CLIENT_SECRET: process.env.APOLLO_OAUTH_CLIENT_SECRET,
  APOLLO_REDIRECT_URI: process.env.APOLLO_OAUTH_REDIRECT_URI,
  APOLLO_SCOPES: process.env.APOLLO_OAUTH_SCOPES,
  APOLLO_API_KEY: process.env.APOLLO_API_KEY,
}

/**
 * Require environment variables at runtime.
 * - If `requiredKeys` is provided, only those keys are enforced.
 * - Otherwise, we enforce a sensible default set (core Vincere app keys).
 */
export function requiredEnv(requiredKeys?: (keyof Cfg)[]) {
  const defaultRequired: (keyof Cfg)[] = [
    'VINCERE_ID_BASE',
    'VINCERE_TENANT_API_BASE',
    'VINCERE_CLIENT_ID',
    'VINCERE_API_KEY',
    'REDIRECT_URI',
  ]
  const keysToCheck = requiredKeys ?? defaultRequired
  const missing = keysToCheck.filter((k) => !config[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)
}

/** Convenience helper specifically for ActiveCampaign routes */
export function requiredActiveCampaignEnv() {
  requiredEnv(['AC_BASE_URL', 'AC_API_TOKEN'])
}

/** Convenience helper for Apollo routes */
export function requiredApolloEnv() {
  requiredEnv(['APOLLO_CLIENT_ID', 'APOLLO_CLIENT_SECRET', 'APOLLO_REDIRECT_URI'])
}

/** Small helper objects */
export const AC = {
  BASE_URL: (config.AC_BASE_URL ?? '').replace(/\/+$/, ''),
  API_TOKEN: config.AC_API_TOKEN ?? '',
}

export const APOLLO = {
  CLIENT_ID: config.APOLLO_CLIENT_ID ?? '',
  CLIENT_SECRET: config.APOLLO_CLIENT_SECRET ?? '',
  REDIRECT_URI: config.APOLLO_REDIRECT_URI ?? '',
  SCOPES: config.APOLLO_SCOPES ?? 'read_user_profile contacts_read accounts_read',
}
