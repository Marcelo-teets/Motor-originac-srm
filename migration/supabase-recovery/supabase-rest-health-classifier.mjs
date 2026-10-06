import { appendFile } from 'node:fs/promises';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const classifySupabaseRest = ({status,body,error}) => {
  const text = String(body ?? '').toLowerCase();
  const errorText = String(error ?? '').toLowerCase();

  if (status >= 200 && status < 300) return 'reachable';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'missing_table_or_route';
  if (status === 402 || text.includes('exceed_db_size_quota') || text.includes('db size quota')) return 'quota';
  if (
    [500,502,503,504,521,522,523,524].includes(status) &&
    (text.includes('timeout') || text.includes('connection terminated') || text.includes('connect_timeout'))
  ) return 'db_timeout';
  if ([500,502,503,504,521,522,523,524].includes(status)) return 'upstream_5xx';
  if (errorText.includes('timeout') || errorText.includes('timed out')) return 'network_timeout';
  if (errorText) return 'network_error';
  return 'other';
};

export async function probeSupabaseRest({baseUrl,key,table,fetchImpl=fetch,timeoutMs=20_000}) {
  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Invalid table name');
  const url = new URL(`${baseUrl.replace(/\/+$/,'')}/rest/v1/${table}`);
  url.searchParams.set('select','id');
  url.searchParams.set('limit','1');

  try {
    const response = await fetchImpl(url,{
      headers:{
        apikey:key,
        Authorization:`Bearer ${key}`,
        Accept:'application/json',
      },
      signal:AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      table,
      class:classifySupabaseRest({status:response.status,body}),
      status:response.status,
    };
  } catch (error) {
    return {
      table,
      class:classifySupabaseRest({status:0,error:error instanceof Error ? error.message : String(error)}),
      status:0,
    };
  }
}

async function main() {
  const table = process.argv.find((arg)=>arg.startsWith('--table='))?.slice('--table='.length);
  if (!table) throw new Error('--table is required');
  const result = await probeSupabaseRest({
    baseUrl:required('SUPABASE_URL'),
    key:required('SUPABASE_SERVICE_ROLE_KEY'),
    table,
  });

  process.stdout.write(`Supabase REST ${result.table}: ${result.class} (HTTP ${result.status || 'network'})\n`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT,`class=${result.class}\nhttp_status=${result.status}\n`);
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  await main();
}
