import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { einvoiceSecret } from '../config/env';

// Secrets of a third party (the Minvoice password and session) stored in the
// database, encrypted with a key that lives only in the environment
// (spec 2026-10-01 §11). Format: v1:<iv>:<auth tag>:<ciphertext>, base64.
const VERSION = 'v1';

function key(): Buffer {
  const raw = Buffer.from(einvoiceSecret(), 'base64');
  if (raw.length !== 32) {
    throw new Error(
      'EINVOICE_SECRET phải là 32 byte mã hóa base64 (tạo bằng: openssl rand -base64 32)',
    );
  }
  return raw;
}

// Called at start-up so production refuses to run with a missing or bad key.
export function assertEinvoiceSecret(): void {
  key();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
}

// Null when the value is empty, was tampered with or used another key.
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, iv, tag, data] = value.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
