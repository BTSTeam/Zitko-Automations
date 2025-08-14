export const config = {
  VINCERE_ID_BASE: process.env.VINCERE_ID_BASE || 'https://id.vincere.io',
  VINCERE_TENANT_API_BASE: process.env.VINCERE_TENANT_API_BASE || 'https://zitko.vincere.io',
  VINCERE_CLIENT_ID: process.env.VINCERE_CLIENT_ID || '',
  VINCERE_API_KEY: process.env.VINCERE_API_KEY || '',
  REDIRECT_URI: process.env.REDIRECT_URI || '',
  SESSION_PASSWORD: process.env.SESSION_PASSWORD || ''
}
export function requiredEnv() {
  const missing = Object.entries(config).filter(([,v]) => !v)
  if (missing.length) {
    throw new Error('Missing env: ' + missing.map(([k]) => k).join(', '))
  }
}
