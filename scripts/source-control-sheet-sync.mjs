import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SPREADSHEET_ID = '1qSMfIrpAbOmBE9x26WhyGk4Cn4AOLk7lAMKfbd1Msag';
export const DEFAULT_SHEET_NAME = 'Página1';

const STATUS_LABELS = Object.freeze({
  real: 'Real',
  active: 'Ativa',
  partial: 'Parcial',
  planned: 'Planejada',
});

const HEALTH_LABELS = Object.freeze({
  healthy: 'Saudável',
  degraded: 'Degradada',
});

const FREQUENCY_LABELS = Object.freeze({
  hourly_control_daily_export: 'Horário + export diário',
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  on_demand: 'Sob demanda',
});

const CRITICALITY_LABELS = Object.freeze({
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
});

const RUN_STATUS_LABELS = Object.freeze({
  completed: 'Concluída',
  partial: 'Parcial',
  failed: 'Falhou',
  running: 'Em execução',
});

const CATEGORY_LABELS = Object.freeze({
  funds_structured_data: 'Fundos estruturados',
  'Fundos estruturados': 'Fundos estruturados',
  regulatory: 'Regulatório',
  Regulatorio: 'Regulatório',
  'Regulatório': 'Regulatório',
  regulated_financials: 'Instituições financeiras reguladas',
  embedded_finance: 'Embedded finance',
  credit_bureau_authorized: 'Bureau de crédito autorizado',
  macro_context: 'Contexto macroeconômico',
  asset_quality: 'Qualidade de ativos',
  'LatAm business media': 'Mídia de negócios LatAm',
  capital_structure: 'Estrutura de capital',
  public_api_cadastral: 'API pública cadastral',
  news_traditional: 'Notícias tradicionais',
  'Business media': 'Mídia de negócios',
  legal_risk: 'Risco legal',
  judicial_risk: 'Risco judicial',
  international_receivables: 'Recebíveis internacionais',
  website_monitoring: 'Monitoramento de sites',
  company_site: 'Sites corporativos',
  public_procurement_receivables: 'Recebíveis do setor público',
  news_niche: 'Notícias nichadas',
  vc_portfolio: 'Portfólios de VC/PE',
  public_innovation_funding: 'Funding público de inovação',
  'Fintech media': 'Mídia de fintechs',
  technical_product_signal: 'Sinais técnicos de produto',
  Prestadores: 'Prestadores de serviço',
  product_innovation: 'Inovação e propriedade intelectual',
  'LinkedIn company intelligence': 'LinkedIn — empresas',
  social_signal: 'Sinais sociais',
  'LinkedIn people intelligence': 'LinkedIn — pessoas',
  'Market data': 'Dados de mercado',
  fiscal_risk: 'Risco fiscal',
  'Setor público': 'Setor público',
  compliance_public_sector: 'Compliance do setor público',
  'Professional network content': 'Rede profissional — conteúdo',
  professional_network: 'Rede profissional — perfil',
  cadastral: 'Dados cadastrais',
  cadastral_ownership: 'Quadro societário',
  receivables_credit: 'Recebíveis e crédito',
  revenue_receivables: 'Receita e recebíveis',
  'Startup media': 'Mídia de startups',
});

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_env:${name}`);
  return value;
}

function normalizeText(value) {
  return String(value ?? '').replace(/[\t\n\r]+/g, ' ').trim();
}

function fallbackLabel(value) {
  const normalized = normalizeText(value).replaceAll('_', ' ');
  if (!normalized) return 'Não informado';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function statusDisplay(value) {
  return STATUS_LABELS[String(value ?? '').toLowerCase()] ?? fallbackLabel(value);
}

export function healthDisplay(value) {
  return HEALTH_LABELS[String(value ?? '').toLowerCase()] ?? 'Sem telemetria';
}

export function frequencyDisplay(value) {
  return FREQUENCY_LABELS[String(value ?? '').toLowerCase()] ?? fallbackLabel(value);
}

export function criticalityDisplay(value) {
  return CRITICALITY_LABELS[String(value ?? '').toLowerCase()] ?? fallbackLabel(value);
}

export function categoryDisplay(value) {
  const normalized = normalizeText(value);
  return CATEGORY_LABELS[normalized] ?? fallbackLabel(normalized);
}

export function runStatusDisplay(value) {
  return RUN_STATUS_LABELS[String(value ?? '').toLowerCase()] ?? 'Sem execução';
}

export function nextAction(source) {
  const status = String(source.status ?? '').toLowerCase();
  const health = String(source.health ?? '').toLowerCase();
  const runStatus = String(source.last_run_status ?? '').toLowerCase();

  if (status === 'planned') return 'Implementar conector, persistência e smoke test.';
  if (status === 'partial') return 'Concluir cobertura e validar ingestão em produção.';
  if (status === 'active' && !source.last_run_at) {
    return 'Formalizar conector e telemetria; hoje é monitoramento manual/web.';
  }
  if (health === 'degraded') return 'Corrigir saúde e executar validação ponta a ponta.';
  if (runStatus === 'partial') return 'Revisar cobertura do último run e eliminar resultado parcial.';
  if (status === 'real' && runStatus === 'completed') {
    return 'Operacional; manter monitoramento e qualidade.';
  }
  if (status === 'real') return 'Validar próxima execução e telemetria.';
  return 'Revisar status e regra de validação.';
}

function formatTimestamp(value) {
  if (!value) return 'Sem execução';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem execução';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
}

function currentSheetDate(now = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
}

export function buildSheetRows(sources) {
  const ordered = [...sources].sort((a, b) => collator.compare(normalizeText(a.name), normalizeText(b.name)));
  const header = [
    '#',
    'Fonte de dados',
    'Status',
    'Saúde',
    'Categoria',
    'Frequência',
    'Prioridade',
    'Criticidade',
    'Última execução',
    'Resultado',
    'Itens coletados',
    'Próxima ação',
  ];

  const rows = ordered.map((source, index) => [
    index + 1,
    normalizeText(source.name),
    statusDisplay(source.status),
    healthDisplay(source.health),
    categoryDisplay(source.category),
    frequencyDisplay(source.frequency),
    Number(source.priority ?? 0),
    criticalityDisplay(source.criticality),
    formatTimestamp(source.last_run_at),
    runStatusDisplay(source.last_run_status),
    Number(source.items_collected ?? 0),
    nextAction(source),
  ]);

  return [header, ...rows];
}

export function buildSummary(sources) {
  const count = (field, value) => sources.filter((source) => String(source[field] ?? '').toLowerCase() === value).length;
  return [
    ['Total', sources.length, 'Real', count('status', 'real'), 'Ativa', count('status', 'active'), 'Parcial', count('status', 'partial')],
    ['Planejada', count('status', 'planned'), 'Saudável', count('health', 'healthy'), 'Degradada', count('health', 'degraded'), 'Controle', 'Supabase → Sheets'],
  ];
}

async function fetchJson(url, init, context) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${context}_http_${response.status}:${normalizeText(text).slice(0, 800)}`);
  }
  return payload;
}

async function fetchSources({ supabaseUrl, serviceRoleKey }) {
  const select = [
    'source_id', 'name', 'category', 'priority', 'criticality', 'frequency', 'status', 'health',
    'last_run_status', 'last_run_at', 'items_collected', 'outputs_written', 'signals_written',
  ].join(',');
  const url = `${supabaseUrl}/rest/v1/source_control_sheet_v1?select=${encodeURIComponent(select)}&limit=1000`;
  const payload = await fetchJson(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: 'application/json',
    },
  }, 'supabase_source_control_read');
  if (!Array.isArray(payload)) throw new Error('supabase_source_control_invalid_payload');
  return payload;
}

async function googleAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const payload = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }, 'google_oauth');
  if (!payload?.access_token) throw new Error('google_oauth_access_token_missing');
  return String(payload.access_token);
}

function quotedSheetRange(sheetName, range) {
  return `'${sheetName.replaceAll("'", "''")}'!${range}`;
}

async function clearSheetData({ accessToken, spreadsheetId, sheetName }) {
  const range = quotedSheetRange(sheetName, 'A3:L1002');
  await fetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    },
    'google_sheets_clear',
  );
}

async function writeSheet({ accessToken, spreadsheetId, sheetName, tableRows, summaryRows, versionDate }) {
  const payload = {
    valueInputOption: 'USER_ENTERED',
    includeValuesInResponse: false,
    data: [
      { range: quotedSheetRange(sheetName, 'C1'), majorDimension: 'ROWS', values: [[versionDate]] },
      { range: quotedSheetRange(sheetName, 'E1:L2'), majorDimension: 'ROWS', values: summaryRows },
      {
        range: quotedSheetRange(sheetName, `A3:L${tableRows.length + 2}`),
        majorDimension: 'ROWS',
        values: tableRows,
      },
    ],
  };
  return fetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'google_sheets_batch_update',
  );
}

async function verifySheet({ accessToken, spreadsheetId, sheetName, sourceCount, expectedDate }) {
  const ranges = [
    quotedSheetRange(sheetName, 'C1'),
    quotedSheetRange(sheetName, 'A3:L4'),
    quotedSheetRange(sheetName, `A${sourceCount + 3}:L${sourceCount + 3}`),
  ];
  const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join('&');
  const payload = await fetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
    'google_sheets_verify',
  );
  const values = payload?.valueRanges ?? [];
  const versionDate = values[0]?.values?.[0]?.[0];
  const header = values[1]?.values?.[0] ?? [];
  const lastRow = values[2]?.values?.[0] ?? [];
  if (String(versionDate) !== expectedDate) throw new Error('google_sheets_verify_version_date_mismatch');
  if (header.length !== 12 || header[1] !== 'Fonte de dados') throw new Error('google_sheets_verify_header_mismatch');
  if (Number(lastRow[0]) !== sourceCount) throw new Error('google_sheets_verify_source_count_mismatch');
  return { versionDate, lastRowNumber: Number(lastRow[0]), headerColumns: header.length };
}

async function recordAudit({ supabaseUrl, serviceRoleKey, row }) {
  try {
    await fetchJson(`${supabaseUrl}/rest/v1/source_control_sheet_sync_runs`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    }, 'supabase_source_control_audit');
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'warning',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function main() {
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const spreadsheetId = process.env.SOURCE_CONTROL_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.SOURCE_CONTROL_SHEET_NAME?.trim() || DEFAULT_SHEET_NAME;
  const dryRun = String(process.env.SOURCE_CONTROL_SHEET_DRY_RUN ?? '').toLowerCase() === 'true';

  const sources = await fetchSources({ supabaseUrl, serviceRoleKey });
  if (sources.length === 0) throw new Error('source_control_empty_catalog');
  const tableRows = buildSheetRows(sources);
  const summaryRows = buildSummary(sources);
  const versionDate = currentSheetDate();
  const checksumSha256 = createHash('sha256').update(JSON.stringify(tableRows)).digest('hex');
  const statusCounts = Object.fromEntries(['real', 'active', 'partial', 'planned'].map((status) => [status, sources.filter((source) => source.status === status).length]));
  const healthCounts = Object.fromEntries(['healthy', 'degraded'].map((health) => [health, sources.filter((source) => source.health === health).length]));

  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry_run', spreadsheetId, sheetName, sourceCount: sources.length, checksumSha256, statusCounts, healthCounts }, null, 2));
    return;
  }

  const accessToken = await googleAccessToken({
    clientId: requiredEnv('GOOGLE_DRIVE_CLIENT_ID'),
    clientSecret: requiredEnv('GOOGLE_DRIVE_CLIENT_SECRET'),
    refreshToken: requiredEnv('GOOGLE_DRIVE_REFRESH_TOKEN'),
  });

  await clearSheetData({ accessToken, spreadsheetId, sheetName });
  const updateResult = await writeSheet({ accessToken, spreadsheetId, sheetName, tableRows, summaryRows, versionDate });
  const verification = await verifySheet({ accessToken, spreadsheetId, sheetName, sourceCount: sources.length, expectedDate: versionDate });

  const audit = await recordAudit({
    supabaseUrl,
    serviceRoleKey,
    row: {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      source_count: sources.length,
      checksum_sha256: checksumSha256,
      status_counts: statusCounts,
      health_counts: healthCounts,
      trigger_source: process.env.GITHUB_EVENT_NAME ?? 'manual',
      git_sha: process.env.GITHUB_SHA ?? null,
      workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
      metadata: {
        runtime: 'source-control-sheet-sync-v1',
        total_updated_cells: updateResult?.totalUpdatedCells ?? null,
        verification,
      },
    },
  });

  console.log(JSON.stringify({
    status: 'ok',
    spreadsheetId,
    sheetName,
    versionDate,
    sourceCount: sources.length,
    checksumSha256,
    statusCounts,
    healthCounts,
    verification,
    audit,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
