import { createHash, randomUUID } from 'node:crypto';

export const KNOWLEDGE_LEARNING_RUNTIME = 'knowledge-learning-agent-v14-vercel';
export const DEFAULT_KNOWLEDGE_LEARNING_MODEL = 'openai/gpt-5.4';

const BRANCH_KEYS = [
  'funding',
  'receivables',
  'capital-structure',
  'timing',
  'patterns',
  'risks',
  'stakeholders',
  'structure-fit',
] as const;

export type KnowledgeLearningBranchKey = typeof BRANCH_KEYS[number];
export type EvidenceType = 'company_signal' | 'monitoring_output' | 'qualification_snapshot';
export type KnowledgeRelationType = 'supports' | 'challenges' | 'related' | 'evidence';
export type KnowledgeLearningNodeType = 'note' | 'thesis' | 'signal' | 'structure';

export type KnowledgeLearningEvidence = {
  type: EvidenceType;
  id: string;
  label: string;
};

export type KnowledgeLearningFact = {
  statement: string;
  confidence: number;
  evidence: KnowledgeLearningEvidence[];
};

export type KnowledgeLearningHypothesis = {
  statement: string;
  confidence: number;
  whyItMatters: string;
  validationQuestion: string;
};

export type KnowledgeLearningBranch = {
  key: KnowledgeLearningBranchKey;
  title: string;
  nodeType: KnowledgeLearningNodeType;
  summary: string;
  facts: KnowledgeLearningFact[];
  hypotheses: KnowledgeLearningHypothesis[];
  tags: string[];
  suggestedActions: string[];
};

export type KnowledgeLearningRelationship = {
  fromKey: 'root' | KnowledgeLearningBranchKey;
  toKey: KnowledgeLearningBranchKey;
  relationType: KnowledgeRelationType;
  rationale: string;
  confidence: number;
};

export type KnowledgeLearningResult = {
  overview: string;
  whyNow: string;
  overallConfidence: number;
  branches: KnowledgeLearningBranch[];
  relationships: KnowledgeLearningRelationship[];
  globalValidationQuestions: string[];
};

type LearningJob = {
  jobId: string;
  companyId: string;
  sourceType: string;
  sourceId: string;
  sourceFingerprint: string;
  priority: number;
  attempt: number;
  maxAttempts: number;
};

type ClaimResponse = {
  status: 'claimed' | 'empty' | 'budget_exhausted';
  workerId: string;
  dailyLimit: number;
  completedToday: number;
  jobs: LearningJob[];
};

type LearningContext = {
  company?: { id?: string; name?: string } & Record<string, unknown>;
  jobs?: Array<Record<string, unknown>>;
  monitoringOutputs?: Array<Record<string, unknown>>;
  signals?: Array<Record<string, unknown>>;
  qualification?: Record<string, unknown> | null;
  patterns?: Array<Record<string, unknown>>;
  existingKnowledge?: Array<Record<string, unknown>>;
  error?: string;
};

type GatewayResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  usage?: Record<string, unknown>;
  error?: { message?: string; code?: string };
};

type UpsertResult = {
  nodeId: string;
  agentKey: string;
  action: 'created' | 'updated' | 'unchanged';
  referencesApplied: number;
};

type RunOptions = {
  batchSize?: number;
  dailyLimit?: number;
  leaseSeconds?: number;
  workerId?: string;
  deployment?: Record<string, unknown>;
};

type Rpc = <T>(name: string, body: Record<string, unknown>) => Promise<T>;

const clamp = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
};

const cleanText = (value: unknown, max = 4000) => String(value ?? '')
  .replace(/\u0000/g, '')
  .trim()
  .slice(0, max);

const cleanTags = (values: unknown) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => cleanText(value, 50).toLocaleLowerCase('pt-BR'))
    .filter(Boolean),
)).slice(0, 16);

const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const contentFromGateway = (payload: GatewayResponse) => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? '').join('');
  return '';
};

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'whyNow', 'overallConfidence', 'branches', 'relationships', 'globalValidationQuestions'],
  properties: {
    overview: { type: 'string', maxLength: 2000 },
    whyNow: { type: 'string', maxLength: 1500 },
    overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
    branches: {
      type: 'array',
      minItems: 4,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'title', 'nodeType', 'summary', 'facts', 'hypotheses', 'tags', 'suggestedActions'],
        properties: {
          key: { type: 'string', enum: BRANCH_KEYS },
          title: { type: 'string', maxLength: 180 },
          nodeType: { type: 'string', enum: ['note', 'thesis', 'signal', 'structure'] },
          summary: { type: 'string', maxLength: 2000 },
          facts: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['statement', 'confidence', 'evidence'],
              properties: {
                statement: { type: 'string', maxLength: 1000 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                evidence: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'id', 'label'],
                    properties: {
                      type: { type: 'string', enum: ['company_signal', 'monitoring_output', 'qualification_snapshot'] },
                      id: { type: 'string' },
                      label: { type: 'string', maxLength: 300 },
                    },
                  },
                },
              },
            },
          },
          hypotheses: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['statement', 'confidence', 'whyItMatters', 'validationQuestion'],
              properties: {
                statement: { type: 'string', maxLength: 1000 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                whyItMatters: { type: 'string', maxLength: 1000 },
                validationQuestion: { type: 'string', maxLength: 500 },
              },
            },
          },
          tags: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 50 } },
          suggestedActions: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 500 } },
        },
      },
    },
    relationships: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fromKey', 'toKey', 'relationType', 'rationale', 'confidence'],
        properties: {
          fromKey: { type: 'string', enum: ['root', ...BRANCH_KEYS] },
          toKey: { type: 'string', enum: BRANCH_KEYS },
          relationType: { type: 'string', enum: ['supports', 'challenges', 'related', 'evidence'] },
          rationale: { type: 'string', maxLength: 1000 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    globalValidationQuestions: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 500 } },
  },
};

const systemPrompt = `Você é o Knowledge Learning Agent da Origination Intelligence Platform.
Atue como especialista sênior em originação, crédito estruturado, FIDC e DCM no Brasil.
Sua tarefa é transformar somente o contexto fornecido em um mapa vivo de conhecimento por empresa.
Regras obrigatórias:
1. Separe fato observado, inferência e ausência de dado.
2. Todo fato precisa citar ao menos um ID de evidência existente no contexto.
3. Não invente CNPJ, valores, operações, pessoas ou causalidade.
4. Relevância, sinal ou similaridade não são decisão de crédito.
5. Não proponha mutação de qualification, patterns, lead score, ranking ou pipeline.
6. Priorize funding gap, recebíveis estruturáveis, estrutura de capital, timing, riscos, stakeholders, fit FIDC/DCM e perguntas de validação.
7. Conflitos entre fontes devem aparecer como hipótese ou risco, nunca como fato consolidado.
8. Escreva em português do Brasil, com linguagem executiva e direta.`;

export const sanitizeLearningResult = (raw: unknown, context: LearningContext): KnowledgeLearningResult => {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const validEvidence = new Map<string, { type: EvidenceType; label: string; snapshot: Record<string, unknown> }>();

  for (const signal of context.signals ?? []) {
    if (isUuid(signal.id)) validEvidence.set(`company_signal:${signal.id}`, {
      type: 'company_signal',
      label: cleanText(signal.label ?? signal.type, 300),
      snapshot: signal,
    });
  }
  for (const output of context.monitoringOutputs ?? []) {
    if (isUuid(output.id)) validEvidence.set(`monitoring_output:${output.id}`, {
      type: 'monitoring_output',
      label: cleanText(output.title ?? output.type, 300),
      snapshot: output,
    });
  }
  if (context.qualification && isUuid(context.qualification.id)) {
    validEvidence.set(`qualification_snapshot:${context.qualification.id}`, {
      type: 'qualification_snapshot',
      label: 'Snapshot de qualificação mais recente',
      snapshot: context.qualification,
    });
  }

  const rawBranches = Array.isArray(input.branches) ? input.branches : [];
  const seen = new Set<KnowledgeLearningBranchKey>();
  const branches: KnowledgeLearningBranch[] = [];

  for (const branchValue of rawBranches) {
    if (!branchValue || typeof branchValue !== 'object') continue;
    const branch = branchValue as Record<string, unknown>;
    const key = cleanText(branch.key, 64) as KnowledgeLearningBranchKey;
    if (!BRANCH_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);

    const facts: KnowledgeLearningFact[] = [];
    const hypotheses: KnowledgeLearningHypothesis[] = [];
    const rawFacts = Array.isArray(branch.facts) ? branch.facts : [];
    for (const factValue of rawFacts) {
      if (!factValue || typeof factValue !== 'object') continue;
      const fact = factValue as Record<string, unknown>;
      const evidence: KnowledgeLearningEvidence[] = [];
      for (const evidenceValue of Array.isArray(fact.evidence) ? fact.evidence : []) {
        if (!evidenceValue || typeof evidenceValue !== 'object') continue;
        const candidate = evidenceValue as Record<string, unknown>;
        const id = cleanText(candidate.id, 64);
        const type = cleanText(candidate.type, 40) as EvidenceType;
        const resolved = validEvidence.get(`${type}:${id}`);
        if (!resolved) continue;
        evidence.push({ type: resolved.type, id, label: cleanText(candidate.label, 300) || resolved.label });
      }
      const statement = cleanText(fact.statement, 1000);
      if (!statement) continue;
      if (evidence.length) {
        facts.push({ statement, confidence: clamp(fact.confidence), evidence: evidence.slice(0, 8) });
      } else {
        hypotheses.push({
          statement,
          confidence: Math.min(0.49, clamp(fact.confidence)),
          whyItMatters: 'A afirmação não possui evidência válida no snapshot atual.',
          validationQuestion: `Qual fonte primária confirma: ${statement}?`,
        });
      }
    }

    for (const hypothesisValue of Array.isArray(branch.hypotheses) ? branch.hypotheses : []) {
      if (!hypothesisValue || typeof hypothesisValue !== 'object') continue;
      const hypothesis = hypothesisValue as Record<string, unknown>;
      const statement = cleanText(hypothesis.statement, 1000);
      if (!statement) continue;
      hypotheses.push({
        statement,
        confidence: clamp(hypothesis.confidence),
        whyItMatters: cleanText(hypothesis.whyItMatters, 1000),
        validationQuestion: cleanText(hypothesis.validationQuestion, 500) || `Como validar: ${statement}?`,
      });
    }

    const nodeType = cleanText(branch.nodeType, 40) as KnowledgeLearningNodeType;
    branches.push({
      key,
      title: cleanText(branch.title, 180) || key,
      nodeType: ['note', 'thesis', 'signal', 'structure'].includes(nodeType) ? nodeType : 'note',
      summary: cleanText(branch.summary, 2000),
      facts: facts.slice(0, 12),
      hypotheses: hypotheses.slice(0, 10),
      tags: cleanTags(branch.tags),
      suggestedActions: (Array.isArray(branch.suggestedActions) ? branch.suggestedActions : [])
        .map((value) => cleanText(value, 500)).filter(Boolean).slice(0, 8),
    });
  }

  const fallbackKeys = BRANCH_KEYS.filter((key) => !seen.has(key));
  for (const key of fallbackKeys.slice(0, Math.max(0, 4 - branches.length))) {
    branches.push({
      key,
      title: key,
      nodeType: key === 'structure-fit' ? 'structure' : 'note',
      summary: 'Sem evidência suficiente no snapshot atual.',
      facts: [],
      hypotheses: [],
      tags: [key],
      suggestedActions: ['Coletar fonte primária e revisar este ramo do mapa.'],
    });
  }

  const branchKeys = new Set(branches.map((branch) => branch.key));
  const relationships: KnowledgeLearningRelationship[] = [];
  for (const value of Array.isArray(input.relationships) ? input.relationships : []) {
    if (!value || typeof value !== 'object') continue;
    const relation = value as Record<string, unknown>;
    const fromKey = cleanText(relation.fromKey, 64) as KnowledgeLearningRelationship['fromKey'];
    const toKey = cleanText(relation.toKey, 64) as KnowledgeLearningBranchKey;
    const relationType = cleanText(relation.relationType, 40) as KnowledgeRelationType;
    if ((fromKey !== 'root' && !branchKeys.has(fromKey as KnowledgeLearningBranchKey)) || !branchKeys.has(toKey) || fromKey === toKey) continue;
    relationships.push({
      fromKey,
      toKey,
      relationType: ['supports', 'challenges', 'related', 'evidence'].includes(relationType) ? relationType : 'related',
      rationale: cleanText(relation.rationale, 1000),
      confidence: clamp(relation.confidence),
    });
  }

  for (const branch of branches) {
    if (!relationships.some((relation) => relation.fromKey === 'root' && relation.toKey === branch.key)) {
      relationships.push({
        fromKey: 'root',
        toKey: branch.key,
        relationType: 'related',
        rationale: 'Ramo do mapa vivo da empresa.',
        confidence: clamp(input.overallConfidence, 0.5),
      });
    }
  }

  return {
    overview: cleanText(input.overview, 2000),
    whyNow: cleanText(input.whyNow, 1500),
    overallConfidence: clamp(input.overallConfidence, 0.5),
    branches,
    relationships: relationships.slice(0, 24),
    globalValidationQuestions: (Array.isArray(input.globalValidationQuestions) ? input.globalValidationQuestions : [])
      .map((value) => cleanText(value, 500)).filter(Boolean).slice(0, 16),
  };
};

const evidenceForBranch = (branch: KnowledgeLearningBranch, context: LearningContext) => {
  const snapshots = new Map<string, Record<string, unknown>>();
  for (const item of context.signals ?? []) if (isUuid(item.id)) snapshots.set(`company_signal:${item.id}`, item);
  for (const item of context.monitoringOutputs ?? []) if (isUuid(item.id)) snapshots.set(`monitoring_output:${item.id}`, item);
  if (context.qualification && isUuid(context.qualification.id)) snapshots.set(`qualification_snapshot:${context.qualification.id}`, context.qualification);
  const unique = new Map<string, Record<string, unknown>>();
  for (const fact of branch.facts) for (const evidence of fact.evidence) {
    const key = `${evidence.type}:${evidence.id}`;
    unique.set(key, { ...evidence, snapshot: snapshots.get(key) ?? {} });
  }
  return [...unique.values()];
};

export const renderBranchMarkdown = (companyName: string, branch: KnowledgeLearningBranch) => {
  const facts = branch.facts.length
    ? branch.facts.map((fact) => `- **Fato observado (${Math.round(fact.confidence * 100)}%)** — ${fact.statement}\n  - Evidências: ${fact.evidence.map((item) => `${item.type}:${item.id}`).join(', ')}`).join('\n')
    : '- Nenhum fato consolidado com evidência válida.';
  const hypotheses = branch.hypotheses.length
    ? branch.hypotheses.map((item) => `- **Hipótese (${Math.round(item.confidence * 100)}%)** — ${item.statement}\n  - Por que importa: ${item.whyItMatters}\n  - Validar: ${item.validationQuestion}`).join('\n')
    : '- Nenhuma hipótese relevante neste snapshot.';
  const actions = branch.suggestedActions.length
    ? branch.suggestedActions.map((item) => `- ${item}`).join('\n')
    : '- Validar o ramo em fonte primária antes de decisão comercial ou de crédito.';

  return `# ${companyName} — ${branch.title}\n\n> Mapa vivo atualizado pelo Knowledge Learning Agent. Fatos, hipóteses e lacunas permanecem separados. Esta nota não altera score, qualification ou pipeline.\n\n## Leitura atual\n${branch.summary || 'Sem síntese suficiente.'}\n\n## Fatos observados\n${facts}\n\n## Hipóteses e lacunas\n${hypotheses}\n\n## Próximas validações\n${actions}\n`;
};

export const renderRootMarkdown = (companyName: string, result: KnowledgeLearningResult) => {
  const branches = result.branches.map((branch) => `- [[${companyName} — ${branch.title}]]`).join('\n');
  const questions = result.globalValidationQuestions.length
    ? result.globalValidationQuestions.map((question) => `- ${question}`).join('\n')
    : '- Confirmar informações materiais nas fontes primárias.';
  return `# Mapa vivo — ${companyName}\n\n> Síntese institucional continuamente atualizada a partir de buscas e capturas governadas. Confiança global: ${Math.round(result.overallConfidence * 100)}%.\n\n## Visão integrada\n${result.overview || 'Sem visão consolidada.'}\n\n## Por que agora\n${result.whyNow || 'Timing ainda não validado.'}\n\n## Ramos do mapa\n${branches}\n\n## Perguntas globais de validação\n${questions}\n\n## Governança\n- Fatos exigem evidence ID válido.\n- Inferências ficam marcadas como hipóteses.\n- A IA atualiza somente a memória e o grafo do Vault.\n- Score, qualification, patterns, ranking e pipeline não são alterados.\n`;
};

const callGateway = async (context: LearningContext, model: string) => {
  const token = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? '';
  if (!token) throw new Error('AI Gateway credential unavailable. Configure AI_GATEWAY_API_KEY or enable Vercel OIDC.');
  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Atualize o mapa vivo usando exclusivamente este snapshot JSON:\n${JSON.stringify(context)}` },
    ],
    temperature: 0.1,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'origination_knowledge_map',
        description: 'Mapa vivo de conhecimento de uma empresa de originação.',
        strict: true,
        schema: jsonSchema,
      },
    },
  };
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(45_000),
  });
  const raw = await response.text();
  let payload: GatewayResponse;
  try { payload = JSON.parse(raw) as GatewayResponse; } catch { throw new Error(`AI Gateway returned invalid JSON (${response.status}).`); }
  if (!response.ok) throw new Error(`AI Gateway ${response.status}: ${payload.error?.message ?? raw.slice(0, 1200)}`);
  const content = contentFromGateway(payload);
  if (!content) throw new Error('AI Gateway returned an empty structured response.');
  let output: unknown;
  try { output = JSON.parse(content); } catch { throw new Error('AI Gateway structured content is not valid JSON.'); }
  return { output, usage: payload.usage ?? {}, requestHash: sha256(JSON.stringify(requestBody)) };
};

const groupJobsByCompany = (jobs: LearningJob[]) => {
  const map = new Map<string, LearningJob[]>();
  for (const job of jobs) map.set(job.companyId, [...(map.get(job.companyId) ?? []), job]);
  return map;
};

export const runKnowledgeLearningAgent = async (rpc: Rpc, options: RunOptions = {}) => {
  const workerId = cleanText(options.workerId, 160) || `learning-${randomUUID().slice(0, 12)}`;
  const claim = await rpc<ClaimResponse>('knowledge_claim_learning_jobs', {
    p_worker_id: workerId,
    p_batch_size: Math.max(1, Math.min(128, Math.trunc(Number(options.batchSize ?? 32)))),
    p_lease_seconds: Math.max(60, Math.min(3600, Math.trunc(Number(options.leaseSeconds ?? 900)))),
    p_daily_limit: Math.max(1, Math.min(1000, Math.trunc(Number(options.dailyLimit ?? 48)))),
  });
  if (claim.status !== 'claimed' || !claim.jobs.length) return { ...claim, runtime: KNOWLEDGE_LEARNING_RUNTIME, companies: [] };

  const model = cleanText(process.env.KNOWLEDGE_LEARNING_MODEL, 200) || DEFAULT_KNOWLEDGE_LEARNING_MODEL;
  const companies: Array<Record<string, unknown>> = [];

  for (const [companyId, jobs] of groupJobsByCompany(claim.jobs)) {
    const jobIds = jobs.map((job) => job.jobId);
    let runId: string | null = null;
    try {
      const context = await rpc<LearningContext>('knowledge_learning_context', { p_company_id: companyId, p_job_ids: jobIds });
      if (!context.company?.id || context.error) throw new Error(context.error ?? 'Knowledge learning context unavailable.');
      const contextJson = JSON.stringify(context);
      const inputHash = sha256(contextJson);
      const gateway = await callGateway(context, model);
      const result = sanitizeLearningResult(gateway.output, context);
      runId = await rpc<string>('knowledge_start_learning_run', {
        p_company_id: companyId,
        p_worker_id: workerId,
        p_model: model,
        p_job_ids: jobIds,
        p_input_hash: inputHash,
        p_prompt_hash: gateway.requestHash,
        p_context_snapshot: context,
        p_deployment: options.deployment ?? {},
      });

      const companyName = cleanText(context.company.name, 240) || companyId;
      let nodesCreated = 0;
      let nodesUpdated = 0;
      let referencesApplied = 0;
      const upserts: UpsertResult[] = [];

      const root = await rpc<UpsertResult>('knowledge_agent_upsert_node', {
        p_run_id: runId,
        p_company_id: companyId,
        p_agent_key: 'root',
        p_title: `Mapa vivo — ${companyName}`,
        p_node_type: 'thesis',
        p_content_markdown: renderRootMarkdown(companyName, result),
        p_excerpt: result.overview,
        p_tags: ['mind-map', 'origination', 'ai-learning'],
        p_confidence: result.overallConfidence,
        p_input_hash: inputHash,
        p_evidence: [],
      });
      upserts.push(root);

      for (const branch of result.branches) {
        const saved = await rpc<UpsertResult>('knowledge_agent_upsert_node', {
          p_run_id: runId,
          p_company_id: companyId,
          p_agent_key: branch.key,
          p_title: `${companyName} — ${branch.title}`,
          p_node_type: branch.nodeType,
          p_content_markdown: renderBranchMarkdown(companyName, branch),
          p_excerpt: branch.summary,
          p_tags: [...branch.tags, branch.key, 'ai-learning'],
          p_confidence: branch.facts.length
            ? branch.facts.reduce((sum, fact) => sum + fact.confidence, 0) / branch.facts.length
            : result.overallConfidence,
          p_input_hash: inputHash,
          p_evidence: evidenceForBranch(branch, context),
        });
        upserts.push(saved);
      }

      for (const saved of upserts) {
        if (saved.action === 'created') nodesCreated += 1;
        if (saved.action === 'updated') nodesUpdated += 1;
        referencesApplied += Number(saved.referencesApplied ?? 0);
      }

      const linkResult = await rpc<{ linksApplied: number }>('knowledge_agent_sync_links', {
        p_run_id: runId,
        p_company_id: companyId,
        p_links: result.relationships,
      });
      await rpc('knowledge_finish_learning_run', {
        p_run_id: runId,
        p_worker_id: workerId,
        p_job_ids: jobIds,
        p_result: result,
        p_usage: gateway.usage,
        p_nodes_created: nodesCreated,
        p_nodes_updated: nodesUpdated,
        p_links_applied: Number(linkResult.linksApplied ?? 0),
        p_references_applied: referencesApplied,
      });
      companies.push({ companyId, companyName, status: 'completed', runId, nodesCreated, nodesUpdated, linksApplied: linkResult.linksApplied, referencesApplied });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await rpc('knowledge_fail_learning_run', {
        p_run_id: runId,
        p_worker_id: workerId,
        p_job_ids: jobIds,
        p_error: message,
        p_retry_after_seconds: 900,
      }).catch(() => undefined);
      companies.push({ companyId, status: 'failed', runId, error: message });
    }
  }

  const completed = companies.filter((company) => company.status === 'completed').length;
  return {
    status: completed === companies.length ? 'completed' : completed ? 'partial' : 'failed',
    workerId,
    model,
    claimed: claim.jobs.length,
    companies,
    runtime: KNOWLEDGE_LEARNING_RUNTIME,
  };
};

export const __testables = { clamp, cleanTags, isUuid, jsonSchema };
