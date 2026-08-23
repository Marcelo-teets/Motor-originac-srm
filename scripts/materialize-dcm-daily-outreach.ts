import { pathToFileURL } from 'node:url';
import { getSupabaseClient } from '../backend/src/lib/supabase.js';

export const materializeDcmDailyOutreach = async () => {
  if (process.env.USE_SUPABASE !== 'true') throw new Error('USE_SUPABASE=true is required for DCM daily materialization.');
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client unavailable for DCM daily materialization.');
  const generatedOn = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const result = await client.rpc<Record<string, unknown>>('materialize_dcm_daily_outreach', {
    p_generated_on: generatedOn,
    p_limit: 20,
  });
  const rows = await client.select('dcm_daily_leads', {
    select: 'id,company_id,contact_name,linkedin_url,priority,outreach_status,generated_on',
    filters: [{ column: 'generated_on', value: generatedOn }],
    limit: 100,
  });
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('dcm_daily_outreach_materialization_empty');
  const autoSent = rows.filter((row: any) => row.outreach_status === 'sent').length;
  if (autoSent > 0) throw new Error(`dcm_daily_outreach_autosend_detected:${autoSent}`);
  console.log(JSON.stringify({ event: 'dcm_daily_outreach_materialized', generatedOn, result, queueSize: rows.length, autoSent }, null, 2));
  return { generatedOn, result, queueSize: rows.length, autoSent };
};

const isDirectExecution = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isDirectExecution) {
  materializeDcmDailyOutreach().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
