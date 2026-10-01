import { randomBytes } from 'node:crypto';
import {
  assertEinvoiceSecret,
  decryptSecret,
  encryptSecret,
} from './einvoice-secret';

describe('einvoice-secret', () => {
  const original = process.env.EINVOICE_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.EINVOICE_SECRET;
    else process.env.EINVOICE_SECRET = original;
  });

  it('decrypts what it encrypted, with a new IV each time', () => {
    const a = encryptSecret('Duyen123@');
    const b = encryptSecret('Duyen123@');
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('Duyen123@');
  });

  it('refuses a tampered value', () => {
    const [v, iv, tag, data] = encryptSecret('secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(
      decryptSecret([v, iv, tag, flipped.toString('base64')].join(':')),
    ).toBeNull();
    expect(decryptSecret('garbage')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it('refuses a value encrypted with another key', () => {
    const value = encryptSecret('secret');
    process.env.EINVOICE_SECRET = randomBytes(32).toString('base64');
    expect(decryptSecret(value)).toBeNull();
  });

  it('checks the key length', () => {
    process.env.EINVOICE_SECRET = Buffer.alloc(16).toString('base64');
    expect(() => assertEinvoiceSecret()).toThrow(/32 byte/);
  });
});
