// lib/config.ts
type Cfg = {
  VINCERE_ID_BASE: string
  VINCERE_TENANT_API_BASE: string
  VINCERE_CLIENT_ID: string
  VINCERE_API_KEY: string
  REDIRECT_URI: string
  SESSION_PASSWORD?: string
  OPENAI_API_KEY?: string
}

export const config: Cfg = {
  VINCERE_ID_BASE: process.env.VINCERE_ID_BASE || '',
  VINCERE_TENANT_API_BASE: process.env.VINCERE_TENANT_API_BASE || '',
  VINCERE_CLIENT_ID: process.env.VINCERE_CLIENT_ID || '',
  VINCERE_API_KEY: process.env.VINCERE_API_KEY || '',
  REDIRECT_URI: process.env.REDIRECT_URI || '',
  SESSION_PASSWORD: process.env.SESSION_PASSWORD,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
}

// Call this *inside* handlers only (so it doesn't run at import time)
export function requiredEnv() {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }
}
