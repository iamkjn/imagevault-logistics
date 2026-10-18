import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '../src/lib/crypto';
describe('refresh token encryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  it('round-trips without deterministic ciphertext', () => {
    const a = encrypt('refresh-secret'),
      b = encrypt('refresh-secret');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('refresh-secret');
  });
  it('rejects modified authentication tags', () => {
    const a = encrypt('secret').split('.');
    a[1] = Buffer.alloc(16, 0).toString('base64');
    expect(() => decrypt(a.join('.'))).toThrow();
  });
  it('requires a full 256-bit key', () => {
    process.env.ENCRYPTION_KEY = 'bad';
    expect(() => encrypt('secret')).toThrow('32-byte');
  });
});
