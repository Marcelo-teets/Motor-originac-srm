import crypto from 'node:crypto';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
};

const base = required('SUPABASE_URL').replace(/\/+$/, '');
const key = required('SUPABASE_SERVICE_ROLE_KEY');
const bucket = process.env.RECOVERY_BUCKET?.trim() || 'historical-excel-archive';
const objectPath = process.env.RECOVERY_OBJECT_PATH?.trim();
if (!objectPath) throw new Error('RECOVERY_OBJECT_PATH_missing');

const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/');
const url = `${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;

const response = await fetch(url, {
  headers: {
    apikey: key,
    authorization: `Bearer ${key}`,
  },
});

const body = new Uint8Array(await response.arrayBuffer());
const contentType = response.headers.get('content-type') || '';
const sha256 = crypto.createHash('sha256').update(body).digest('hex');

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  bucket,
  objectPath,
  bytes: body.byteLength,
  sha256,
  contentType,
  errorPreview: response.ok ? null : Buffer.from(body).toString('utf8').replace(/\s+/g, ' ').slice(0, 500),
}));

if (!response.ok) process.exit(1);
