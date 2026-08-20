import { pathToFileURL } from 'node:url';

const DEFAULT_SPREADSHEET_ID = '1qSMfIrpAbOmBE9x26WhyGk4Cn4AOLk7lAMKfbd1Msag';
const DEFAULT_SHEET_NAME = 'Página1';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_env:${name}`);
  return value;
};

const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
const normalizeCell = (value) => String(value ?? '').trim();
export const normalizeRowsForComparison = (rows) => rows.map((row) => row.map(normalizeCell));

export function buildSummaryFromDisplayedRows(rows) {
  const data = rows.filter((row) => String(row?.[1] ?? '').trim());
  const countStatus = (label) => data.filter((row) => normalize(row?.[2]) === normalize(label)).length;
  const countHealth = (label) => data.filter((row) => normalize(row?.[3]) === normalize(label)).length;
  return [
    ['Total', data.length, 'Real', countStatus('Real'), 'Ativa', countStatus('Ativa'), 'Parcial', countStatus('Parcial')],
    ['Planejada', countStatus('Planejada'), 'Saudável', countHealth('Saudável'), 'Degradada', countHealth('Degradada'), 'Controle', 'Supabase → Sheets'],
  ];
}

const currentSheetDate = () => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date());

const fetchJson = async (url, init, context) => {
  const response = await fetch(url, init);
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) throw new Error(`${context}_http_${response.status}:${String(raw).slice(0, 400)}`);
  return payload;
};

const googleAccessToken = async ({ clientId, clientSecret, refreshToken }) => {
  const payload = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }, 'google_oauth');
  if (!payload?.access_token) throw new Error('google_oauth_access_token_missing');
  return String(payload.access_token);
};

const quoted = (sheetName, range) => `'${sheetName.replaceAll("'", "''")}'!${range}`;

export async function main() {
  const spreadsheetId = process.env.SOURCE_CONTROL_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.SOURCE_CONTROL_SHEET_NAME?.trim() || DEFAULT_SHEET_NAME;
  const token = await googleAccessToken({
    clientId: required('GOOGLE_DRIVE_CLIENT_ID'),
    clientSecret: required('GOOGLE_DRIVE_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_DRIVE_REFRESH_TOKEN'),
  });
  const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const dataRange = quoted(sheetName, 'A4:D1002');
  const read = await fetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(dataRange)}`,
    { headers },
    'sheet_rows_read',
  );
  const summary = buildSummaryFromDisplayedRows(read?.values ?? []);
  const versionDate = currentSheetDate();
  await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: quoted(sheetName, 'C1'), majorDimension: 'ROWS', values: [[versionDate]] },
        { range: quoted(sheetName, 'E1:L2'), majorDimension: 'ROWS', values: summary },
      ],
    }),
  }, 'sheet_summary_write');
  const verifyRange = quoted(sheetName, 'E1:L2');
  const verify = await fetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(verifyRange)}`,
    { headers },
    'sheet_summary_verify',
  );
  const actual = verify?.values ?? [];
  if (JSON.stringify(normalizeRowsForComparison(actual)) !== JSON.stringify(normalizeRowsForComparison(summary))) {
    throw new Error(`sheet_summary_verify_mismatch expected=${JSON.stringify(summary)} actual=${JSON.stringify(actual)}`);
  }
  console.log(JSON.stringify({ status: 'repaired', spreadsheetId, sheetName, versionDate, summary }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}
