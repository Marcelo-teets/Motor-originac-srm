import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';
import type { CompanyListItem } from '../lib/types';

type OutreachStatus = 'draft' | 'ready' | 'sent' | 'repositioned' | 'do_not_advance' | 'missing_data';
type LeadPriority = 'A' | 'B' | 'C' | 'Reciclar';

type DcmDailyLead = {
  id: string;
  generatedOn: string;
  companyId: string;
  companyName: string;
  legalName?: string;
  contactName: string;
  contactRole?: string;
  linkedinUrl?: string;
  productHypothesis: string;
  priority: LeadPriority;
  thesis: string;
  generatedMessage?: string;
  actualMessage?: string;
  outreachStatus: OutreachStatus;
  recommendedSkills: string[];
  sourceTrace: Array<Record<string, unknown>>;
  nextAction?: string;
  sentAt?: string;
  hasPendingFeedback: boolean;
};

type QueueBriefing = {
  total: number;
  ready: number;
  sent: number;
  drafts: number;
  repositioned: number;
  doNotAdvance: number;
  missingData: number;
  pendingFeedback: number;
  priorityA: number;
  nextActions: Array<{ id: string; companyName?: string; contactName?: string; nextAction?: string }>;
};

type NewLeadForm = {
  companyId: string;
  contactName: string;
  contactRole: string;
  linkedinUrl: string;
  productHypothesis: string;
  priority: LeadPriority;
  thesis: string;
  generatedMessage: string;
  nextAction: string;
};

type ComposerState = {
  generatedMessage: string;
  actualMessage: string;
  nextAction: string;
};

const emptyForm: NewLeadForm = {
  companyId: '',
  contactName: '',
  contactRole: '',
  linkedinUrl: '',
  productHypothesis: '',
  priority: 'B',
  thesis: '',
  generatedMessage: '',
  nextAction: 'Realizar follow-up após a abordagem inicial.',
};

const emptyBriefing: QueueBriefing = {
  total: 0,
  ready: 0,
  sent: 0,
  drafts: 0,
  repositioned: 0,
  doNotAdvance: 0,
  missingData: 0,
  pendingFeedback: 0,
  priorityA: 0,
  nextActions: [],
};

const asObject = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const objectArray = (value: unknown) => Array.isArray(value) ? value.map(asObject) : [];

const localDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeLead = (value: unknown): DcmDailyLead => {
  const raw = asObject(value);
  return {
    id: text(raw.id),
    generatedOn: text(raw.generated_on, raw.generatedOn),
    companyId: text(raw.company_id, raw.companyId),
    companyName: text(raw.company_name, raw.companyName, 'Empresa sem nome'),
    legalName: text(raw.legal_name, raw.legalName) || undefined,
    contactName: text(raw.contact_name, raw.contactName, 'Contato sem nome'),
    contactRole: text(raw.contact_role, raw.contactRole) || undefined,
    linkedinUrl: text(raw.linkedin_url, raw.linkedinUrl) || undefined,
    productHypothesis: text(raw.product_hypothesis, raw.productHypothesis),
    priority: (text(raw.priority, 'B') as LeadPriority),
    thesis: text(raw.thesis),
    generatedMessage: text(raw.generated_message, raw.generatedMessage) || undefined,
    actualMessage: text(raw.actual_message, raw.actualMessage) || undefined,
    outreachStatus: (text(raw.outreach_status, raw.outreachStatus, 'draft') as OutreachStatus),
    recommendedSkills: stringArray(raw.recommended_skills ?? raw.recommendedSkills),
    sourceTrace: objectArray(raw.source_trace ?? raw.sourceTrace),
    nextAction: text(raw.next_action, raw.nextAction) || undefined,
    sentAt: text(raw.sent_at, raw.sentAt) || undefined,
    hasPendingFeedback: raw.has_pending_feedback === true || raw.hasPendingFeedback === true,
  };
};

const statusLabel: Record<OutreachStatus, string> = {
  draft: 'Rascunho',
  ready: 'Pronto para enviar',
  sent: 'Enviado',
  repositioned: 'Reposicionar',
  do_not_advance: 'Não avançar',
  missing_data: 'Faltam dados',
};

const statusTone: Record<OutreachStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'default',
  ready: 'info',
  sent: 'success',
  repositioned: 'warning',
  do_not_advance: 'danger',
  missing_data: 'warning',
};

export function DcmDailyOutreachPage() {
  const { session } = useAuth();
  const [date, setDate] = useState(localDate());
  const [leads, setLeads] = useState<DcmDailyLead[]>([]);
  const [briefing, setBriefing] = useState<QueueBriefing>(emptyBriefing);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<NewLeadForm>(emptyForm);
  const [composer, setComposer] = useState<ComposerState>({ generatedMessage: '', actualMessage: '', nextAction: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const selected = useMemo(() => leads.find((lead) => lead.id === selectedId) ?? null, [leads, selectedId]);

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `Falha no runtime DCM (${response.status}).`);
    return payload;
  };

  const load = async () => {
    try {
      setLoading(true);
      const [queuePayload, companyState] = await Promise.all([
        request(`/origination/daily-leads?date=${encodeURIComponent(date)}`),
        api.getCompanies(session),
      ]);
      const data = asObject(queuePayload?.data);
      const rows = Array.isArray(data.items) ? data.items.map(normalizeLead) : [];
      const briefingRaw = asObject(data.briefing);
      setLeads(rows);
      setBriefing({
        total: numberValue(briefingRaw.total),
        ready: numberValue(briefingRaw.ready),
        sent: numberValue(briefingRaw.sent),
        drafts: numberValue(briefingRaw.drafts),
        repositioned: numberValue(briefingRaw.repositioned),
        doNotAdvance: numberValue(briefingRaw.doNotAdvance ?? briefingRaw.do_not_advance),
        missingData: numberValue(briefingRaw.missingData ?? briefingRaw.missing_data),
        pendingFeedback: numberValue(briefingRaw.pendingFeedback ?? briefingRaw.pending_feedback),
        priorityA: numberValue(briefingRaw.priorityA ?? briefingRaw.priority_a),
        nextActions: Array.isArray(briefingRaw.nextActions) ? briefingRaw.nextActions.map((item) => asObject(item) as QueueBriefing['nextActions'][number]) : [],
      });
      setCompanies(companyState.data);
      if (selectedId && !rows.some((lead) => lead.id === selectedId)) {
        setSelectedId(null);
        setComposer({ generatedMessage: '', actualMessage: '', nextAction: '' });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a rotina diária DCM.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [date, headers]);

  const selectLead = (lead: DcmDailyLead) => {
    setSelectedId(lead.id);
    setComposer({
      generatedMessage: lead.generatedMessage ?? '',
      actualMessage: lead.actualMessage ?? lead.generatedMessage ?? '',
      nextAction: lead.nextAction ?? 'Realizar follow-up após a abordagem inicial.',
    });
    setSuccess(null);
    setError(null);
  };

  const selectCompany = (companyId: string) => {
    const company = companies.find((item) => item.id === companyId);
    setForm((current) => ({
      ...current,
      companyId,
      productHypothesis: company?.suggestedStructure || current.productHypothesis,
      thesis: company?.thesis || current.thesis,
      nextAction: company?.nextAction || current.nextAction,
      priority: company?.leadBucket === 'A' ? 'A' : company?.leadBucket === 'C' ? 'C' : 'B',
    }));
  };

  const createLead = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await request('/origination/daily-leads', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          ...form,
          generatedOn: date,
          outreachStatus: form.generatedMessage.trim() ? 'ready' : 'draft',
          recommendedSkills: ['pesquisa contextual', 'diagnóstico de funding', 'CTA único'],
          sourceTrace: [{ source: 'manual_daily_outreach', observedAt: new Date().toISOString() }],
        }),
      });
      setForm(emptyForm);
      setShowCreate(false);
      setSuccess('Lead incluído na fila diária com origem, hipótese, prioridade e próxima ação.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar lead diário.');
    } finally {
      setSaving(false);
    }
  };

  const patchLead = async (updates: Record<string, unknown>, successMessage: string) => {
    if (!selected) return;
    try {
      setSaving(true);
      setError(null);
      await request('/origination/daily-leads', {
        method: 'PATCH',
        body: JSON.stringify({ id: selected.id, ...updates }),
      });
      setSuccess(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o lead.');
    } finally {
      setSaving(false);
    }
  };

  const saveComposer = () => patchLead({
    generatedMessage: composer.generatedMessage,
    nextAction: composer.nextAction,
    outreachStatus: composer.generatedMessage.trim() ? 'ready' : 'draft',
  }, 'Mensagem e próxima ação salvas no Supabase.');

  const syncPipelineAfterSend = async (lead: DcmDailyLead, actualMessage: string, nextAction: string) => {
    await api.createActivity(session, {
      companyId: lead.companyId,
      type: 'email',
      title: `Abordagem DCM enviada para ${lead.contactName}`,
      description: actualMessage,
      owner: 'Origination',
      status: 'done',
      dueDate: null,
    });
    const row = await api.getPipelineCompany(session, lead.companyId);
    if (!row || row.stage === 'Identified' || row.stage === 'Qualified') {
      await api.movePipelineStage(session, lead.companyId, 'Approach');
    }
    if (nextAction.trim()) await api.updateNextAction(session, lead.companyId, nextAction.trim());
  };

  const sendLead = async () => {
    if (!selected || !composer.actualMessage.trim()) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payload = await request('/origination/daily-leads', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send',
          id: selected.id,
          actualMessage: composer.actualMessage,
          nextAction: composer.nextAction,
          learnedRules: [],
        }),
      });
      let pipelineNote = ' Pipeline, atividade e próxima ação sincronizados.';
      try {
        await syncPipelineAfterSend(selected, composer.actualMessage, composer.nextAction);
      } catch {
        pipelineNote = ' O envio foi persistido, mas a sincronização do CRM ficou pendente para revisão.';
      }
      const feedbackCreated = asObject(payload?.data).feedbackCreated === true;
      setSuccess(`Abordagem marcada como enviada.${feedbackCreated ? ' Feedback de escrita criado para revisão.' : ''}${pipelineNote}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar o envio.');
    } finally {
      setSaving(false);
    }
  };

  const copyMessage = async () => {
    const message = composer.actualMessage || composer.generatedMessage;
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setSuccess('Mensagem copiada. Revise o texto final antes de enviar.');
    } catch {
      setError('O navegador não permitiu copiar automaticamente. Selecione o texto manualmente.');
    }
  };

  const updateForm = (field: keyof NewLeadForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="page dcm-daily-page">
      <PageIntro
        eyebrow="DCM · execução comercial diária"
        title="Fila diária de abordagem"
        description="Transforme ranking, sinais e teses em mensagens executáveis. Cada envio registra atividade, próxima ação e o delta entre a mensagem sugerida e a mensagem realmente utilizada."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Supabase real</Pill>
            <Pill tone="info">RLS por usuário</Pill>
            <button type="button" onClick={() => setShowCreate((current) => !current)}>{showCreate ? 'Fechar cadastro' : 'Adicionar lead'}</button>
          </div>
        )}
      />

      <DataStatusBanner source="real" note="Fila, mensagens, envio e feedback são persistidos no Supabase. O CRM é atualizado após o envio; nenhum lead estático do protótipo foi importado." />
      {error ? <Card title="Ação bloqueada" subtitle="Nenhuma alteração parcial deve ser assumida" tone="accent">{error}</Card> : null}
      {success ? <Card title="Operação concluída" subtitle="Resultado persistido e auditável" tone="success">{success}</Card> : null}

      <section className="dcm-daily-toolbar">
        <label>
          <span>Data da fila</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Atualizando...' : 'Atualizar fila'}</button>
      </section>

      <section className="stats-row">
        <Stat label="Leads do dia" value={String(briefing.total)} helper={`${briefing.priorityA} prioridade A`} />
        <Stat label="Prontos" value={String(briefing.ready)} helper={`${briefing.drafts} rascunhos`} />
        <Stat label="Enviados" value={String(briefing.sent)} helper="com atividade comercial" />
        <Stat label="Feedback pendente" value={String(briefing.pendingFeedback)} helper="mensagem gerada versus enviada" />
      </section>

      {showCreate ? (
        <Card title="Adicionar lead à fila" subtitle="Use apenas empresas já resolvidas no Company Master" tone="accent">
          <div className="form-grid two">
            <label><span>Empresa</span><select value={form.companyId} onChange={(event) => selectCompany(event.target.value)}><option value="">Selecione uma empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.leadBucket}</option>)}</select></label>
            <label><span>Prioridade</span><select value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="Reciclar">Reciclar</option></select></label>
            <label><span>Contato</span><input value={form.contactName} onChange={(event) => updateForm('contactName', event.target.value)} placeholder="Nome do decisor" /></label>
            <label><span>Cargo</span><input value={form.contactRole} onChange={(event) => updateForm('contactRole', event.target.value)} placeholder="CFO, CEO, Head de Crédito..." /></label>
            <label><span>LinkedIn</span><input value={form.linkedinUrl} onChange={(event) => updateForm('linkedinUrl', event.target.value)} placeholder="https://www.linkedin.com/in/..." /></label>
            <label><span>Produto hipótese</span><input value={form.productHypothesis} onChange={(event) => updateForm('productHypothesis', event.target.value)} placeholder="FIDC, debênture, nota comercial..." /></label>
          </div>
          <div className="form-grid top-gap">
            <label><span>Tese curta</span><textarea rows={4} value={form.thesis} onChange={(event) => updateForm('thesis', event.target.value)} placeholder="Por que a empresa pode precisar de funding, por que agora e qual evidência sustenta a hipótese." /></label>
            <label><span>Mensagem sugerida</span><textarea rows={7} value={form.generatedMessage} onChange={(event) => updateForm('generatedMessage', event.target.value)} placeholder="Observação concreta, apresentação curta, um produto hipótese e CTA leve." /></label>
            <label><span>Próxima ação</span><input value={form.nextAction} onChange={(event) => updateForm('nextAction', event.target.value)} /></label>
            <div className="pill-row"><button type="button" disabled={saving || !form.companyId || !form.contactName.trim() || !form.productHypothesis.trim() || !form.thesis.trim()} onClick={() => void createLead()}>{saving ? 'Salvando...' : 'Adicionar à fila'}</button></div>
          </div>
        </Card>
      ) : null}

      <section className="grid cols-2 detail-layout dcm-daily-layout">
        <Card title="Fila priorizada" subtitle={`${briefing.ready} prontos · ${briefing.missingData} com dados faltantes`} className="dense-card">
          {leads.length ? (
            <div className="dcm-lead-list">
              {leads.map((lead) => (
                <button type="button" key={lead.id} className={`dcm-lead-row ${selectedId === lead.id ? 'active' : ''}`} onClick={() => selectLead(lead)}>
                  <div className="row-between">
                    <span className="score-badge">{lead.priority}</span>
                    <Pill tone={statusTone[lead.outreachStatus]}>{statusLabel[lead.outreachStatus]}</Pill>
                  </div>
                  <strong>{lead.companyName}</strong>
                  <span>{lead.contactName}{lead.contactRole ? ` · ${lead.contactRole}` : ''}</span>
                  <small>{lead.productHypothesis} · {lead.nextAction || 'Próxima ação não definida'}</small>
                  {lead.hasPendingFeedback ? <small className="dcm-feedback-flag">feedback de escrita pendente</small> : null}
                </button>
              ))}
            </div>
          ) : <EmptyState title="Nenhum lead nesta data." description="Adicione um lead resolvido ou aguarde o motor alimentar a fila a partir do ranking e das teses." />}
        </Card>

        <Card title={selected ? `${selected.companyName} · ${selected.contactName}` : 'Composer de abordagem'} subtitle={selected ? `${selected.productHypothesis} · prioridade ${selected.priority}` : 'Selecione um lead para revisar a tese e a mensagem'} className="dense-card">
          {selected ? (
            <div className="stack-blocks">
              <div className="dcm-thesis-block">
                <div className="row-between"><Pill tone="warning">tese</Pill>{selected.linkedinUrl ? <a href={selected.linkedinUrl} target="_blank" rel="noreferrer" className="button secondary compact-button">Abrir LinkedIn</a> : null}</div>
                <p>{selected.thesis}</p>
              </div>
              <label>Mensagem gerada<textarea rows={8} value={composer.generatedMessage} onChange={(event) => setComposer((current) => ({ ...current, generatedMessage: event.target.value }))} /></label>
              <label>Mensagem realmente enviada<textarea rows={8} value={composer.actualMessage} onChange={(event) => setComposer((current) => ({ ...current, actualMessage: event.target.value }))} /></label>
              <label>Próxima ação<input value={composer.nextAction} onChange={(event) => setComposer((current) => ({ ...current, nextAction: event.target.value }))} /></label>
              {selected.recommendedSkills.length ? <div><p className="section-label">Skills recomendadas</p><div className="pill-row">{selected.recommendedSkills.map((skill) => <Pill key={skill} tone="info">{skill}</Pill>)}</div></div> : null}
              <div className="dcm-action-grid">
                <button type="button" disabled={saving} onClick={() => void saveComposer()}>{saving ? 'Salvando...' : 'Salvar e deixar pronto'}</button>
                <button type="button" className="secondary" onClick={() => void copyMessage()}>Copiar mensagem</button>
                <button type="button" className="secondary" disabled={saving || !composer.actualMessage.trim()} onClick={() => void sendLead()}>Registrar envio</button>
                <button type="button" className="secondary" disabled={saving} onClick={() => void patchLead({ outreachStatus: 'repositioned' }, 'Lead marcado para reposicionamento de tese ou contato.')}>Reposicionar</button>
                <button type="button" className="secondary" disabled={saving} onClick={() => void patchLead({ outreachStatus: 'missing_data' }, 'Lead marcado como pendente de dados adicionais.')}>Faltam dados</button>
                <button type="button" className="secondary" disabled={saving} onClick={() => void patchLead({ outreachStatus: 'do_not_advance' }, 'Lead retirado da fila ativa com registro auditável.')}>Não avançar</button>
              </div>
              {selected.sentAt ? <p className="table-helper">Enviado em {new Date(selected.sentAt).toLocaleString('pt-BR')}.</p> : null}
            </div>
          ) : <EmptyState title="Selecione um lead." description="A revisão deve confirmar tese, produto hipótese, mensagem final e próxima ação antes do envio." />}
        </Card>
      </section>

      <Card title="Briefing operacional" subtitle="Próximas ações registradas na fila">
        {briefing.nextActions.length ? (
          <ul className="list compact-list">
            {briefing.nextActions.map((item) => <li key={item.id}><strong>{item.companyName || item.contactName || 'Lead'}</strong><span>{item.nextAction}</span></li>)}
          </ul>
        ) : <EmptyState title="Sem próximas ações registradas." description="Defina a próxima ação em cada lead para tornar o briefing operacional." />}
      </Card>
    </div>
  );
}
