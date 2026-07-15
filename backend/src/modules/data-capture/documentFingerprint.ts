import crypto from 'node:crypto';

export const buildDocumentFingerprint = (parts: Array<string | undefined | null>) =>
  crypto.createHash('sha1').update(parts.filter(Boolean).join('::')).digest('hex');

export const buildDeterministicUuid = (parts: Array<string | undefined | null>) => {
  const hash = buildDocumentFingerprint(parts);
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
