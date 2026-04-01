import crypto from 'node:crypto';

export const buildDocumentFingerprint = (parts: Array<string | undefined | null>) =>
  crypto.createHash('sha1').update(parts.filter(Boolean).join('::')).digest('hex');
