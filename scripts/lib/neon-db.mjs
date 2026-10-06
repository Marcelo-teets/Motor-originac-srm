import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
}

export const neonPool = new Pool({
  connectionString,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'motor-github-actions',
});

export const query = async (text, values = []) => {
  const result = await neonPool.query(text, values);
  return result.rows;
};

export const closeNeonPool = () => neonPool.end();
