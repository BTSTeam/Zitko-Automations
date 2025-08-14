export const config = {
  VINCERE_ID_BASE: process.env.VINCERE_ID_BASE!,
  VINCERE_TENANT_API_BASE: process.env.VINCERE_TENANT_API_BASE!,
  VINCERE_CLIENT_ID: process.env.VINCERE_CLIENT_ID!,
  VINCERE_API_KEY: process.env.VINCERE_API_KEY!,
  REDIRECT_URI: process.env.REDIRECT_URI!,
  SESSION_PASSWORD: process.env.SESSION_PASSWORD!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

export function requiredEnv() {
  const missing = Object.entries(config)
    .filter(([, v]) => v === undefined || v === null || v === '')
    .map(([k]) => k);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
}
