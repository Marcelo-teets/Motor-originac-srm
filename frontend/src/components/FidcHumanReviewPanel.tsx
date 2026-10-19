import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card, EmptyState, Pill } from './UI';
import { buildApiUrl } from '../lib/runtimeConfig';
import { safeExternalUrl } from '../lib/safeUrl';
import {
  fidcDispositionLabel,
  mayReferFidcToIdentity,
  validateFidcReviewDraft,
  type FidcDisposition,
  type FidcReviewSource,
} from '../lib/fidcReviewSubmission';

type ReviewRow = {
  id: string;
  cnpj: string;
  disposition: FidcDisposition;
  rationale: string;
  next_action: string;
  reviewer_email: string;
  created_at: string;
};

type ReviewPanelProps = {
  headers: Record<string, string>;
  isGodMode: boolean;
};

type AuditStatus = 'checking' | 'ready' | 'unavailable' | 'error';

const auditPath = '/candidate-decision-queue/fidc-assignors/reviews';

const parseRows = <T,>(data: unknown): T[] => Array.isArray(data) ? data as T[] : [];

const cnpjLabel = (cnpj: string) => cnpj.replace(
  /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
  '$1.$2.$3/$4-$5',
);

const formatReviewedAt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'data indisponível' : date.toLocaleString('pt-BR');
};

export function FidcHumanReviewPanel({ headers, isGodMode }: ReviewPanelProps) {
  const [sources, setSources] = useState<FidcReviewSource[]>([]);
  const [latest, setLatest] = useState<ReviewRow[]>([]);
  const [history, setHistory] = useState<ReviewRow[]>([]);
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [disposition, setDisposition] = useState<FidcDisposition>('needs_evidence');
  const [rationale, setRationale] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [status, setStatus] = useState<AuditStatus>('checking');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => sources.find((item) => item.cnpj === selectedCnpj) ?? null,
    [sources, selectedCnpj],
  );
  const latestByCnpj = useMemo(
    () => new Map(latest.map((item) => [item.cnpj, item])),
    [latest],
  );
  const validation = selected
    ? validateFidcReviewDraft(selected, { disposition, rationale, nextAction, acknowledged })
    : 'Selecione um cedente com evidência de origem.';

  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
      throw Object.assign(new Error(reason), { statusCode: response.status });
    }
    return payload?.data as unknown;
  };

  useEffect(() => {
    if (!isGodMode) return undefined;
    let active = true;
    setStatus('checking');
    setError(null);
    const load = async () => {
      try {
        const sourcePayload = await request('/candidate-decision-queue/fidc-assignors');
        if (!active) return;
        const rows = (sourcePayload as { items?: unknown } | null)?.items;
        setSources(parseRows<FidcReviewSource>(rows));
        try {
          const reviews = await request(auditPath);
          if (!active) return;
          setLatest(parseRows<ReviewRow>(reviews));
          setStatus('ready');
        } catch (reviewError) {
          if (!active) return;
          const unavailable = (reviewError as { statusCode?: number }).statusCode === 404;
          setStatus(unavailable ? 'unavailable' : 'error');
          setError(unavailable
            ? 'A API auditável ainda não foi publicada. Aguarde a PR #614 e a migration no release oficial.'
            : reviewError instanceof Error ? reviewError.message : 'Falha ao carregar auditoria.');
        }
      } catch (sourceError) {
        if (!active) return;
        setStatus('error');
        setError(sourceError instanceof Error ? sourceError.message : 'Não foi possível carregar a fonte CVM.');
      }
    };
    void load();
    return () => { active = false; };
  }, [headers, isGodMode]);

  useEffect(() => {
    if (!selectedCnpj || status !== 'ready' || !isGodMode) {
      setHistory([]);
      return undefined;
    }
    let active = true;
    setLoadingHistory(true);
    const loadHistory = async () => {
      try {
        const rows = await request(`${auditPath}/${encodeURIComponent(selectedCnpj)}`);
        if (active) {
          setHistory(parseRows<ReviewRow>(rows));
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setHistory([]);
          setError(loadError instanceof Error ? loadError.message : 'Falha ao consultar histórico.');
        }
      } finally {
        if (active) setLoadingHistory(false);
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [selectedCnpj, status, isGodMode, headers]);

  const changeSelected = (cnpj: string) => {
    setSelectedCnpj(cnpj);
    setDisposition('needs_evidence');
    setRationale('');
    setNextAction('');
    setAcknowledged(false);
    setNotice(null);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || status !== 'ready' || saving) return;
    const invalid = validateFidcReviewDraft(selected, { disposition, rationale, nextAction, acknowledged });
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const data = await request(auditPath, {
        method: 'POST',
        body: JSON.stringify({
          cnpj: selected.cnpj, disposition,
          rationale: rationale.trim(), nextAction: nextAction.trim(),
        }),
      }) as { reviewRecorded?: boolean };
      if (data?.reviewRecorded !== true) throw new Error('O backend não confirmou a gravação.');
      setAcknowledged(false);
      setRationale('');
      setNextAction('');
      setDisposition('needs_evidence');
      setNotice('Parecer salvo no histórico auditável. A empresa NÃO foi promovida e o crédito NÃO foi aprovado.');
      // Read-after-write: prefer persisted records to optimistic UI.
      const [latestRows, historyRows] = await Promise.all([
        request(auditPath),
        request(`${auditPath}/${encodeURIComponent(selected.cnpj)}`),
      ]);
      setLatest(parseRows<ReviewRow>(latestRows));
      setHistory(parseRows<ReviewRow>(historyRows));
    } catch (saveError) {
      // If the write succeeded but refresh failed, the notice is kept: no fake state.
      setError(saveError instanceof Error ? saveError.message : 'Falha ao registrar ou atualizar o histórico.');
    } finally {
      setSaving(false);
    }
  };

  if (!isGodMode) {
    return (
      <Card title="Parecer comercial FIDC" subtitle="Registro auditável com revisão humana" className="dense-card">
        <p className="table-helper">Apenas o perfil administrador ativo pode registrar ou consultar pareceres da fila. Nenhuma ação automática foi executada.</p>
      </Card>
    );
  }

  return (
    <Card title="Parecer comercial FIDC" subtitle="Revisão humana com evidência CVM, sem promoção automática" className="dense-card">
      <p className="table-helper">
        O vínculo de um CNPJ a um FIDC NÃO comprova produto de crédito, recebíveis elegíveis, funding gap ou ICP.
        Este parecer é preliminar e não substitui a revisão de identidade nem a análise de crédito.
      </p>
      {status === 'checking' ? <p role="status">Verificando fontes e histórico auditável...</p> : null}
      {status === 'ready' ? <Pill tone="success">Registro auditável disponível</Pill> : null}
      {status === 'unavailable' ? <Pill tone="warning">Backend pendente de publicação</Pill> : null}
      {status === 'error' ? <Pill tone="danger">Serviço indisponível</Pill> : null}
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <form onSubmit={(event) => void submit(event)}>
        <div className="filters-row">
          <label htmlFor="fidc-human-review-cnpj">Cedente identificado na CVM
            <select
              id="fidc-human-review-cnpj"
              value={selectedCnpj}
              onChange={(event) => changeSelected(event.target.value)}
              disabled={status !== 'ready' || saving}
            >
              <option value="">Selecione o CNPJ para análise</option>
              {sources.map((item) => (
                <option key={item.cnpj} value={item.cnpj}>
                  {item.legal_name || 'Razão social pendente'} — {cnpjLabel(item.cnpj)}
                  {latestByCnpj.has(item.cnpj) ? ' • já revisado' : ''}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="fidc-human-review-disposition">Resultado da triagem
            <select
              id="fidc-human-review-disposition"
              value={disposition}
              onChange={(event) => setDisposition(event.target.value as FidcDisposition)}
              disabled={!selected || status !== 'ready' || saving}
            >
              {(Object.keys(fidcDispositionLabel) as FidcDisposition[]).map((key) => (
                <option
                  key={key}
                  value={key}
                  disabled={key === 'refer_to_identity_review' && (!selected || !mayReferFidcToIdentity(selected))}
                >
                  {fidcDispositionLabel[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected ? (
          <div className="summary-item">
            <strong>{selected.legal_name || 'Razão social não confirmada'}</strong>
            <p className="table-helper">CNPJ: {cnpjLabel(selected.cnpj)} · Cadastro: {selected.registration_status || 'desconhecido'} · Via: {selected.review_lane}</p>
            <p className="table-helper">Próxima diligência da fila: {selected.recommended_review_action}</p>
            {safeExternalUrl(selected.cvm_evidence_url) ? (
              <a href={safeExternalUrl(selected.cvm_evidence_url)} target="_blank" rel="noreferrer">Consultar origem CVM</a>
            ) : <p role="alert">Origem CVM não disponível: revisão bloqueada.</p>}
            {safeExternalUrl(selected.registry_url) ? (
              <a href={safeExternalUrl(selected.registry_url)} target="_blank" rel="noreferrer">Consultar cadastro</a>
            ) : null}
            {latestByCnpj.get(selected.cnpj) ? (
              <p className="table-helper">Último parecer: {fidcDispositionLabel[latestByCnpj.get(selected.cnpj)!.disposition]} · {formatReviewedAt(latestByCnpj.get(selected.cnpj)!.created_at)}</p>
            ) : <p className="table-helper">Nenhum parecer salvo anteriormente para este CNPJ.</p>}
          </div>
        ) : null}

        <div className="stack-blocks compact-gap top-gap">
          <label htmlFor="fidc-human-review-rationale">Justificativa fundamentada (mín. 30 caracteres)
            <textarea
              id="fidc-human-review-rationale"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Descreva o que foi observado nas fontes, o que é hipótese e o que ainda falta comprovar."
              rows={4}
              minLength={30}
              maxLength={3000}
              disabled={!selected || status !== 'ready' || saving}
            />
          </label>
          <label htmlFor="fidc-human-review-next-action">Próxima ação (mín. 10 caracteres)
            <textarea
              id="fidc-human-review-next-action"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Ex.: consultar site operacional e comprovantes de carteira de recebíveis."
              rows={2}
              minLength={10}
              maxLength={1000}
              disabled={!selected || status !== 'ready' || saving}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={!selected || status !== 'ready' || saving}
            />
            Li a evidência de origem e confirmo que este parecer NÃO autoriza promoção, score ou aprovação de crédito.
          </label>
          {selected && validation ? <p className="table-helper">{validation}</p> : null}
          <button
            type="submit"
            disabled={!selected || status !== 'ready' || saving || validation !== null}
          >
            {saving ? 'Registrando...' : 'Confirmar e registrar parecer'}
          </button>
        </div>
      </form>

      {selected && status === 'ready' ? (
        <section className="top-gap" aria-label="Histórico de revisões FIDC">
          <strong>Histórico de pareceres deste CNPJ</strong>
          {loadingHistory ? <p role="status">Carregando histórico...</p> : history.length ? (
            <ul className="list">
              {history.map((review) => (
                <li key={review.id}>
                  <Pill tone={review.disposition === 'no_go' ? 'warning' : 'info'}>
                    {fidcDispositionLabel[review.disposition] || 'Triagem'}
                  </Pill>
                  <div className="table-helper">{formatReviewedAt(review.created_at)} · {review.reviewer_email}</div>
                  <p>{review.rationale}</p>
                  <p className="table-helper">Próxima ação: {review.next_action}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Sem pareceres anteriores" description="A fila de origem não registra aprovação automática." />}
        </section>
      ) : null}
    </Card>
  );
}
