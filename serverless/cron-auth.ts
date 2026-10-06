import { timingSafeEqual } from 'node:crypto';

const headerValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * True only when CRON_SECRET is configured and the Authorization header is
 * exactly `Bearer <CRON_SECRET>`. Constant-time so the secret cannot be
 * recovered by timing the comparison; fails closed without a secret.
 */
export const isCronSecretAuthorized = (authorization: string | string[] | undefined) => {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return false;
  const received = Buffer.from(headerValue(authorization));
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
};
