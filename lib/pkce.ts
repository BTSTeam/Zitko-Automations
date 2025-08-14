import crypto from 'crypto'

export function base64URLEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function sha256(buffer: Buffer) {
  return crypto.createHash('sha256').update(buffer).digest()
}

export function generateVerifier() {
  return base64URLEncode(crypto.randomBytes(32))
}

export function challengeFromVerifier(v: string) {
  return base64URLEncode(sha256(Buffer.from(v)))
}
