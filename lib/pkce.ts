import { createHash, randomBytes } from 'crypto';

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');

export function generateVerifier(): string {
  return b64url(randomBytes(32));
}

export function challengeFromVerifier(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return b64url(hash);
}
