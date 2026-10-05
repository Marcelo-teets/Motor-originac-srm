import { getNeonPostgresClient } from '../backend/src/lib/postgres.js';

export const neonDatabaseUrl = () => (
  process.env.MOTOR_NEON_DATABASE_URL
  || process.env.DATABASE_URL
  || ''
);

export const isNeonDatabaseConfigured = () => Boolean(neonDatabaseUrl());

export const requireNeonDataClient = () => {
  const url = neonDatabaseUrl();
  if (!url) {
    throw Object.assign(
      new Error('Neon database is not configured. Set MOTOR_NEON_DATABASE_URL or DATABASE_URL.'),
      { statusCode: 503 },
    );
  }
  const client = getNeonPostgresClient(url);
  if (!client) {
    throw Object.assign(new Error('Unable to initialize Neon database client.'), { statusCode: 503 });
  }
  return client;
};
