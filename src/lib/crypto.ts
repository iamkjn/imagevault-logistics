import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
  const k = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32)
    throw new Error('ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  return k;
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString('base64'))
    .join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
