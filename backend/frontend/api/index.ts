const generatedAt = () => new Date().toISOString();

const FALLBACK_COMPANIES = [
  {
    id: 'fallback-klavi-001',
    name: 'Klavi',
    segment: 'Fintech',
    subsegment: 'Open Finance / Crédito',
    geography: 'Brasil',
    product: 'Infraestrutura financeira e dados para crédito',
    receivables: ['contratos recorrentes', 'receitas B2B'],
    suggestedStructure: 'FIDC / DCM',
    qualificationScore: 83,
    leadScore: 86,
    predictedFundingNeed: 78,
    urgencyScore: 74,
    leadBucket: 'Prioridade A',
    monitoringStatus: 'active',
    triggerStrength: 82,
    sourceConfidence: 72,
    topPatterns: ['embedded finance pressure', 'receivables strong / funding weak'],
    thesis: 'Empresa com infraestrutura financeira aderente a estruturas de funding escalável e tese de DCM/FIDC.',
    nextAction: 'Validar apetite para funding estruturado e mapear recebíveis elegíveis.'
  },
  {
    id: 'fallback-nac-002',
    name: 'NAC Digital',
    segment: 'Tech-enabled services',
    subsegment: 'Recebíveis / capital de giro',
    geography: 'Brasil',
    product: 'Operação com necessidade de bridge para FIDC',
    receivables: ['recebíveis comerciais', 'fluxo recorrente'],
    suggestedStructure: 'Bridge Debenture com take-out em FIDC',
    qualificationScore: 88,
    leadScore: 90,
    predictedFundingNeed: 86,
    urgencyScore: 84,
    leadBucket: 'Prioridade A',
    monitoringStatus: 'active',
    triggerStrength: 88,
    sourceConfidence: 76,
    topPatterns: ['growth without funding', 'capital mismatch'],
    thesis: 'Caso com timing claro para bridge curto e transição para veículo estruturado.',
    nextAction: 'Rodar checklist de elegibilidade, lastro e cronograma bridge de 7 dias.'
  },
  {
    id: 'fallback-clinia-003',
    name: 'Clinia',
    segment: 'Healthtech',
    subsegment: 'SaaS / AI healthcare',
    geography: 'Brasil',
    product: 'SaaS de automação para clínicas',
    receivables: ['MRR', 'contratos SaaS', 'assinaturas'],
    suggestedStructure: 'Nota comercial / venture debt leve',
    qualificationScore: 72,
    leadScore: 78,
    predictedFundingNeed: 82,
    urgencyScore: 86,
    leadBucket: 'Prioridade B',
    monitoringStatus: 'active',
    triggerStrength: 80,
    sourceConfidence: 70,
    topPatterns: ['expansion outpacing capital', 'capital mismatch'],
    thesis: 'Sinais de pressão de caixa e base recorrente que pode sustentar estrutura ponte com governança.',
    nextAction: 'Atualizar diagnóstico financeiro e simular estrutura com covenants de caixa.'
  }
];

const TABLES = [
  'companies',
  'source_catalog',
  'source_connector_runs',
  'monitoring_outputs',
  'company_signals',
  'enrichments',
  'qualification_snapshots',
  'company_patterns',
  'score_snapshots',
  'lead_score_snapshots',
  'pipeline'
];

const envFlag = (key) => Boolean(process.env[key] && String(process.env[key]).trim().length > 0);
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const normalizePath = (pathname) => pathname.replace(/^\/api(?=\/|$)/, '') || '/';
const getRequestUrl = (req) => new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function envelope(status, data, extra = {}) {
  return { status, generatedAt: generatedAt(), data, ...extra };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function supabaseFetch(path, init = {}) {
  const baseUrl = supabaseUrl();
  const key = supabaseKey();
  if (!baseUrl || !key) return { ok: false, status: 0, data: null, error: 'missing_supabase_env' };
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, error: response.ok ? null : text, headers: response.headers };
}

async function selectTable(table, query = 'select=*') {
  return supabaseFetch(`/rest/v1/${table}?${query}`, { headers: { Prefer: 'count=exact' } });
}

async function countTable(table) {
  const result = await supabaseFetch(`/rest/v1/${table}?select=id`, {
    headers: { Range: '0-0', Prefer: 'count=exact' }
  });
  const contentRange = result.headers?.get?.('content-range') || '';
  const countText = contentRange.split('/').pop();
  const count = countText && countText !== '*' ? Number(countText) : null;
  return { table, ok: result.ok, count, error: result.ok ? null : (result.error || 'unavailable') };
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCompany(row, index = 0) {
  const fallback = FALLBACK_COMPANIES[index % FALLBACK_COMPANIES.length];
  const name = row?.name || row?.company_name || row?.legal_name || fallback.name;
  const qualificationScore = asNumber(row?.qualification_score || row?.qualification_score_total || row?.score || row?.qualificationScore, fallback.qualificationScore);
  const leadScore = asNumber(row?.lead_score || row?.leadScore || row?.ranking_score, fallback.leadScore);
  return {
    id: String(row?.id || row?.company_id || fallback.id),
    name,
    segment: row?.segment || row?.sector || row?.industry || fallback.segment,
    subsegment: row?.subsegment || row?.sub_sector || row?.business_model || fallback.subsegment,
    geography: row?.geography || row?.country || 'Brasil',
    product: row?.product || row?.credit_product || row?.description || fallback.product,
    receivables: Array.isArray(row?.receivables) ? row.receivables : fallback.receivables,
    suggestedStructure: row?.suggested_structure || row?.suggestedStructure || row?.target_structure || fallback.suggestedStructure,
    qualificationScore,
    leadScore,
    predictedFundingNeed: asNumber(row?.predicted_funding_need || row?.predictedFundingNeed, Math.max(60, qualificationScore - 5)),
    urgencyScore: asNumber(row?.urgency_score || row?.urgencyScore, Math.max(55, leadScore - 8)),
    leadBucket: row?.lead_bucket || row?.leadBucket || (leadScore >= 85 ? 'Prioridade A' : leadScore >= 75 ? 'Prioridade B' : 'Prioridade C'),
    monitoringStatus: row?.monitoring_status || row?.monitoringStatus || 'active',
    triggerStrength: asNumber(row?.trigger_strength || row?.triggerStrength, Math.max(55, leadScore - 4)),
    sourceConfidence: asNumber(row?.source_confidence || row?.sourceConfidence, 70),
    topPatterns: Array.isArray(row?.top_patterns) ? row.top_patterns : fallback.topPatterns,
    thesis: row?.thesis || row?.investment_thesis || fallback.thesis,
    nextAction: row?.next_action || row?.nextAction || fallback.nextAction
  };
}

async function listCompanies() {
  const result = await selectTable('companies', 'select=*');
  if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
    return { status: 'real', companies: result.data.map(normalizeCompany) };
  }
  return { status: supabaseUrl() && supabaseKey() ? 'partial' : 'mock', companies: FALLBACK_COMPANIES };
}

function buildDashboard(companies) {
  const topLeads = [...companies]
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, 8)
    .map((item) => ({
      companyId: item.id,
      companyName: item.name,
      qualificationScore: item.qualificationScore,
      leadScore: item.leadScore,
      triggerStrength: item.triggerStrength,
      suggestedStructure: item.suggestedStructure,
      bucket: item.leadBucket,
      rankingScore: Math.round((item.leadScore * 0.55) + (item.qualificationScore * 0.45))
    }));
  const priorityA = companies.filter((item) => item.leadBucket === 'Prioridade A').length;
  return {
    summary: [
      { label: 'Empresas monitoradas', value: String(companies.length), tone: 'neutral', helper: 'Base operacional do backend shim autocontido' },
      { label: 'Prioridade A', value: String(priorityA), tone: 'positive', helper: 'Leads com maior timing para FIDC/DCM' },
      { label: 'Score médio', value: String(Math.round(companies.reduce((sum, item) => sum + item.leadScore, 0) / Math.max(companies.length, 1))), tone: 'neutral', helper: 'Lead score médio da amostra ativa' },
      { label: 'API backend', value: 'Online', tone: 'positive', helper: 'Rotas críticas respondendo JSON' }
    ],
    topLeads,
    monitoring: { activeSources: 3, outputs24h: companies.length, triggers24h: priorityA, websiteChecks: companies.length },
    agents: [
      { name: 'qualification_agent', status: 'ready', lastRun: generatedAt(), note: 'Shim operacional até backend completo ser reativado no Vercel' },
      { name: 'pattern_engine', status: 'ready', lastRun: generatedAt(), note: 'Padrões gerados a partir de sinais normalizados' }
    ],
    patterns: [
      { pattern: 'growth without funding', companies: Math.max(1, priorityA), avgImpact: 82 },
      { pattern: 'capital mismatch', companies: companies.length, avgImpact: 78 },
      { pattern: 'embedded finance pressure', companies: Math.max(1, companies.length - 1), avgImpact: 74 }
    ],
    pipeline: [
      { stage: 'Identified', count: companies.length, coverage: '100%' },
      { stage: 'Qualified', count: priorityA, coverage: `${Math.round((priorityA / Math.max(companies.length, 1)) * 100)}%` }
    ],
    charts: {
      leadBuckets: [
        { label: 'Prioridade A', value: priorityA },
        { label: 'Prioridade B/C', value: companies.length - priorityA }
      ],
      qualificationVsLead: topLeads.map((item) => ({ company: item.companyName, qualification: item.qualificationScore, lead: item.leadScore }))
    }
  };
}

function companyDetail(company) {
  return {
    company: {
      ...company,
      description: company.thesis,
      currentFundingStructure: 'A validar em discovery comercial',
      stage: company.leadBucket,
      cnpj: '',
      website: '',
      geography: company.geography || 'Brasil',
      product: company.product,
      receivables: company.receivables,
      thesis: company.thesis,
      nextAction: company.nextAction,
      urgencyScore: company.urgencyScore || company.triggerStrength
    },
    qualification: {
      qualification_score_total: company.qualificationScore,
      predicted_funding_need_score: company.predictedFundingNeed,
      urgency_score: company.urgencyScore || company.triggerStrength,
      source_confidence_score: company.sourceConfidence,
      suggested_structure_type: company.suggestedStructure,
      capital_structure_rationale: company.thesis,
      pattern_summary: company.topPatterns,
      fit_fidc: company.suggestedStructure.includes('FIDC'),
      fit_dcm: true
    },
    patterns: company.topPatterns.map((pattern, index) => ({ id: `${company.id}-pattern-${index}`, patternName: pattern, rationale: `Padrão identificado para ${company.name}`, confidenceScore: 0.72, leadScoreImpact: 8, rankingImpact: 7, thesisImpact: company.thesis })),
    thesis: { summary: company.thesis, structureType: company.suggestedStructure, marketMapSummary: 'Comparar com fintechs, SaaS recorrentes e empresas com recebíveis estruturáveis no Brasil.', confidenceScore: company.sourceConfidence },
    marketMap: [{ peerName: 'Universo middle market tech Brasil', peerType: 'comparable_set', rationale: 'Recorte Brasil-only com potencial DCM/FIDC.' }],
    monitoring: { status: company.monitoringStatus || 'active', lastRunAt: generatedAt(), outputs24h: 1, triggers24h: company.triggerStrength > 80 ? 1 : 0, websiteChanges: [], feedHighlights: [company.thesis] },
    signals: company.topPatterns.map((pattern) => ({ type: pattern, strength: company.triggerStrength, confidence: company.sourceConfidence, note: company.thesis, source: 'backend-shim' })),
    sources: [{ id: 'backend-shim', name: 'Backend Vercel Shim', status: 'active', health: 'healthy', category: 'runtime' }],
    activities: [{ title: company.nextAction || 'Definir próxima ação', owner: 'Origination', status: 'open', dueDate: generatedAt() }],
    scores: { qualification: company.qualificationScore, lead: company.leadScore, bucket: company.leadBucket, rankingScore: Math.round((company.leadScore * 0.55) + (company.qualificationScore * 0.45)) },
    scoreHistory: [{ at: generatedAt(), qualification: company.qualificationScore, lead: company.leadScore }],
    monitoringOutputs: [{ id: `${company.id}-output`, sourceId: 'backend-shim', title: `Sinal ativo: ${company.name}`, summary: company.thesis, confidenceScore: company.sourceConfidence, connectorStatus: 'ready', collectedAt: generatedAt() }]
  };
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  if (!supabaseUrl() || !supabaseKey()) {
    sendJson(res, 503, { status: 'partial', generatedAt: generatedAt(), error: 'Supabase Auth env vars are not configured on this backend deployment.' });
    return;
  }
  const result = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, password: body.password })
  });
  if (!result.ok) {
    sendJson(res, 401, { status: 'partial', generatedAt: generatedAt(), error: 'Falha ao autenticar no Supabase Auth.' });
    return;
  }
  sendJson(res, 200, envelope('real', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: result.data.expires_at,
    user: { id: result.data.user?.id, email: result.data.user?.email, role: result.data.user?.role || 'authenticated' }
  }));
}

async function handleMe(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || !supabaseUrl() || !supabaseKey()) {
    sendJson(res, 401, { status: 'partial', generatedAt: generatedAt(), error: 'Unauthorized.' });
    return;
  }
  const result = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}` } });
  const data = await result.json().catch(() => null);
  if (!result.ok) {
    sendJson(res, 401, { status: 'partial', generatedAt: generatedAt(), error: 'Unauthorized.' });
    return;
  }
  sendJson(res, 200, envelope('real', { id: data.id, email: data.email, role: data.role || 'authenticated' }));
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const requestUrl = getRequestUrl(req);
  const path = normalizePath(requestUrl.pathname);

  if (path === '/' || path === '/index.html') {
    sendJson(res, 200, envelope('partial', { service: 'motor-originac-srm-backend', mode: 'api-shim', routes: ['/health', '/api/companies', '/api/dashboard/summary', '/api/data-capture/health', '/api/platform/status'] }));
    return;
  }

  if (path === '/health') {
    sendJson(res, 200, envelope('partial', { service: 'backend', mode: 'self_contained_vercel_api_shim', uptime: process.uptime(), supabaseConfigured: Boolean(supabaseUrl() && supabaseKey()) }));
    return;
  }

  if (path === '/auth/login' && req.method === 'POST') return handleLogin(req, res);
  if (path === '/auth/me') return handleMe(req, res);
  if (path === '/auth/logout' && req.method === 'POST') {
    sendJson(res, 200, envelope('partial', { success: true }));
    return;
  }

  if (path === '/data-capture/health') {
    const checks = await Promise.all(TABLES.map(countTable));
    const coreOk = checks.filter((check) => ['companies', 'source_catalog'].includes(check.table)).every((check) => check.ok);
    sendJson(res, coreOk ? 200 : 207, {
      status: coreOk ? 'real' : 'partial',
      generatedAt: generatedAt(),
      data: {
        mode: 'self_contained_vercel_api_shim',
        supabaseConfigured: Boolean(supabaseUrl() && supabaseKey()),
        coreTablesAccessible: coreOk,
        tables: checks
      }
    });
    return;
  }

  const { status, companies } = await listCompanies();

  if (path === '/companies') {
    sendJson(res, 200, envelope(status, companies));
    return;
  }

  if (path.startsWith('/companies/')) {
    const id = decodeURIComponent(path.split('/')[2] || '');
    const company = companies.find((item) => item.id === id) || companies.find((item) => item.name.toLowerCase() === id.toLowerCase());
    if (!company) {
      sendJson(res, 404, { status: 'partial', generatedAt: generatedAt(), error: 'Company not found' });
      return;
    }
    sendJson(res, 200, envelope(status, companyDetail(company)));
    return;
  }

  if (path === '/dashboard/summary') {
    sendJson(res, 200, envelope(status, buildDashboard(companies)));
    return;
  }

  if (path === '/sources/catalog') {
    const result = await selectTable('source_catalog', 'select=*');
    const sources = result.ok && Array.isArray(result.data) && result.data.length
      ? result.data.map((item, index) => ({ id: String(item.id || `source-${index}`), name: item.name || item.source_name || `Fonte ${index + 1}`, sourceType: item.source_type || item.type || 'public', category: item.category || 'market_intelligence', status: item.status || 'active', health: item.health || 'healthy' }))
      : [{ id: 'backend-shim', name: 'Backend Vercel Shim', sourceType: 'runtime', category: 'infra', status: 'active', health: 'healthy' }];
    sendJson(res, 200, envelope(result.ok ? 'real' : 'partial', sources));
    return;
  }

  if (path === '/pipeline') {
    sendJson(res, 200, envelope('partial', { mode: 'shim', rows: companies.map((company) => ({ companyId: company.id, stage: company.leadScore >= 85 ? 'Qualified' : 'Identified', owner: 'Origination', nextAction: company.nextAction || 'Definir próxima ação' })) }));
    return;
  }

  if (path === '/pipeline/stages') {
    sendJson(res, 200, envelope('partial', { mode: 'shim', stages: buildDashboard(companies).pipeline }));
    return;
  }

  if (path === '/pipeline/snapshot') {
    sendJson(res, 200, envelope('partial', { stages: buildDashboard(companies).pipeline, recentActivities: companies.slice(0, 5).map((company) => ({ companyId: company.id, companyName: company.name, title: company.nextAction || 'Definir próxima ação', owner: 'Origination', dueDate: null, status: 'open' })) }));
    return;
  }

  if (path === '/monitoring/snapshot') {
    sendJson(res, 200, envelope('partial', { activeSources: 3, outputs24h: companies.length, triggers24h: companies.filter((c) => c.triggerStrength >= 80).length, lastRunAt: generatedAt(), health: 'ready' }));
    return;
  }

  if (path === '/agents/snapshot') {
    sendJson(res, 200, envelope('partial', { healthy: 2, degraded: 0, mocked: 1, agents: [{ name: 'qualification_agent', status: 'ready' }, { name: 'pattern_engine', status: 'ready' }] }));
    return;
  }

  if (path === '/mvp/ops/quick-actions') {
    sendJson(res, 200, envelope('partial', { items: companies.slice(0, 3).map((company, index) => ({ id: `qa_${company.id}`, title: `${index === 0 ? 'Abordar' : 'Revisar'} ${company.name}: ${company.nextAction}`, owner: 'Origination', priority: index === 0 ? 'high' : 'medium' })) }));
    return;
  }

  if (path === '/mvp-readiness') {
    const dashboard = buildDashboard(companies);
    sendJson(res, 200, envelope('partial', {
      auth: { status: envFlag('SUPABASE_ANON_KEY') ? 'real' : 'partial', provider: 'supabase' },
      database: { status: status === 'real' ? 'real' : 'partial', mode: status === 'real' ? 'supabase' : 'shim_fallback' },
      sources: { total: dashboard.monitoring.activeSources, degraded: 0, status: 'healthy' },
      monitoring: { outputs24h: dashboard.monitoring.outputs24h, triggers24h: dashboard.monitoring.triggers24h, status: 'active' },
      qualification: { topLeads: dashboard.topLeads.length, status: 'active' },
      pipeline: { rows: companies.length, stages: dashboard.pipeline, status: 'active' },
      frontend_runtime: { status: 'ready', stack: 'react_vite' },
      deploy_health: { status: 'api_shim_ready', note: 'Backend autocontido no root backend/frontend; substituir pelo backend completo após ajuste definitivo do Vercel root.' }
    }));
    return;
  }

  if (path === '/platform/status') {
    sendJson(res, 200, envelope('partial', { auth: envFlag('SUPABASE_ANON_KEY') ? 'real' : 'partial', dashboard: 'partial', companies: status, qualification: 'partial', leadScore: 'partial', sources: 'partial', monitoring: 'partial', agents: 'partial', pipeline: 'partial', frontendDataFallback: 'controlled', persistence: status === 'real' ? 'supabase' : 'shim_fallback' }));
    return;
  }

  if (path === '/search-profiles') {
    sendJson(res, 200, envelope('partial', []));
    return;
  }

  if (path === '/activities' || path === '/tasks') {
    sendJson(res, 200, envelope('partial', { mode: 'shim', items: [] }));
    return;
  }

  if (path.startsWith('/origination/')) {
    sendJson(res, 200, envelope('partial', { name: 'Origination Intelligence Platform', scope: 'Brasil-only middle market tech', pipeline: 'Search Profile → Sources → Monitoring → Signals → Qualification → Patterns → Ranking → Pipeline', status: 'api_shim_ready' }));
    return;
  }

  sendJson(res, 404, { status: 'partial', generatedAt: generatedAt(), error: 'Route not implemented in self-contained backend shim.', path });
}

export default handler;
