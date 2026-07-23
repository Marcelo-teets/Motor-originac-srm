import { type FormEvent, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import {
  getFidcMarketMap,
  type FidcMarketMapFilters,
  type FidcMarketMapRow,
  type FidcMarketMapSort,
  type FidcSilenceStatus,
} from '../lib/fidcMarketMapApi';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const compactCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const formatCurrency = (value: number | null | undefined, compact = true) => value === null || value === undefined
  ? '—'
  : (compact ? compactCurrency : fullCurrency).format(value);
const formatPercent = (ratio: number | null | undefined) => ratio === null || ratio === undefined ? '—' : `${percent.format(ratio * 100)}%`;
const formatDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(value))
  : '—';
const formatCnpj = (value: string | null | undefined) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return value || 'CNPJ indisponível';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const silenceLabel: Record<FidcSilenceStatus, string> = {
  EM_DIA: 'Em dia',
  DEFASADO: 'Defasado',
  SILENCIO: 'Silêncio',
};

const silenceTone = (status: FidcSilenceStatus | null) => status === 'EM_DIA' ? 'success' : status === 'SILENCIO' ? 'danger' : 'warning';

const attentionText = (row: FidcMarketMapRow) => {
  const items: string[] = [];
  if (row.highDelinquency) items.push('inadimplência ≥ 5%');
  if (row.lowSubordination) items.push('subordinação < 10%');
  if (row.operationalAttention) items.push('atenção operacional');
  if (row.ratioOutlier) items.push('razão fora da faixa usual');
  return items;
};

type FilterDraft = {
  search: string;
  manager: string;
  minNav: string;
  minDelinquencyPct: string;
  maxSubordinationPct: string;
  silenceStatus: FidcSilenceStatus | '';
  sort: FidcMarketMapSort;
  pageSize: number;
};

const initialDraft: FilterDraft = {
  search: '',
  manager: '',
  minNav: '',
  minDelinquencyPct: '',
  maxSubordinationPct: '',
  silenceStatus: '',
  sort: 'nav_desc',
  pageSize: 25,
};

const numericOrNull = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
const toFilters = (draft: FilterDraft): FidcMarketMapFilters => ({
  search: draft.search,
  manager: draft.manager,
  minNav: numericOrNull(draft.minNav),
  minDelinquencyPct: numericOrNull(draft.minDelinquencyPct),
  maxSubordinationPct: numericOrNull(draft.maxSubordinationPct),
  silenceStatus: draft.silenceStatus,
  sort: draft.sort,
  page: 1,
  pageSize: draft.pageSize,
});

export function FidcMarketMapPage() {
  const { session } = useAuth();
  const [draft, setDraft] = useState<FilterDraft>(initialDraft);
  const [filters, setFilters] = useState<FidcMarketMapFilters>(() => toFilters(initialDraft));
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const { data, loading, error } = useAsyncData(
    () => getFidcMarketMap(session, filters),
    [session?.access_token, filterKey],
  );

  if (loading && !data) return <LoadingState title="Market Map FIDC" subtitle="Carregando comparáveis, estrutura de reforço de crédito e qualidade operacional." />;
  if (error || !data) return <ErrorState title="Market Map FIDC" error={error} />;

  const snapshot = data.data;
  const summary = snapshot.summary;
  const pagination = snapshot.pagination;

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters(toFilters(draft));
  };

  const resetFilters = () => {
    setDraft(initialDraft);
    setFilters(toFilters(initialDraft));
  };

  const movePage = (page: number) => setFilters((current) => ({ ...current, page }));

  return (
    <div className="page fidc-market-map-page">
      <PageIntro
        eyebrow="Market intelligence · FIDC"
        title="Market Map FIDC"
        description="Comparáveis reais por fundo, gestor, patrimônio, inadimplência, subordinação e qualidade operacional. A leitura apoia tese, diligência e estruturação; não transforma fundos em leads nem altera score automaticamente."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Agentetome real</Pill>
            <Pill tone="info">CVM / FNET subjacentes</Pill>
            <Pill tone="warning">score impact: false</Pill>
          </div>
        )}
      />
      <DataStatusBanner source={data.source} note={data.note} />

      <section className="decision-strip fidc-kpi-strip">
        <div className="decision-card"><Pill tone="info">Fundos filtrados</Pill><strong>{integer.format(summary.totalFunds)}</strong><small>{integer.format(snapshot.universe.totalFunds)} no universo carregado.</small></div>
        <div className="decision-card"><Pill tone="success">PL agregado</Pill><strong>{formatCurrency(summary.totalNav)}</strong><small>PL mediano {formatCurrency(summary.medianNav)}.</small></div>
        <div className="decision-card"><Pill tone={summary.delinquencyAbove5Pct ? 'warning' : 'success'}>Inadimplência ≥ 5%</Pill><strong>{integer.format(summary.delinquencyAbove5Pct)}</strong><small>{integer.format(summary.delinquencyAbove10Pct)} fundos acima de 10%.</small></div>
        <div className="decision-card"><Pill tone={summary.subordinationBelow10Pct ? 'warning' : 'success'}>Subordinação &lt; 10%</Pill><strong>{integer.format(summary.subordinationBelow10Pct)}</strong><small>Comparável para reforço de crédito.</small></div>
        <div className="decision-card"><Pill tone={summary.operationalAttention ? 'warning' : 'success'}>Atenção operacional</Pill><strong>{integer.format(summary.operationalAttention)}</strong><small>Defasagem, silêncio ou violação vigente.</small></div>
      </section>

      <Card title="Filtros executivos" subtitle="Recorte o universo sem modificar dados, score ou pipeline" className="dense-card">
        <form className="fidc-filter-grid" onSubmit={applyFilters}>
          <label className="fidc-filter-wide">
            <span>Fundo, CNPJ, gestor ou administradora</span>
            <input value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Ex.: Seller, Agibank, 77Sol..." />
          </label>
          <label>
            <span>Gestor</span>
            <select value={draft.manager} onChange={(event) => setDraft((current) => ({ ...current, manager: event.target.value }))}>
              <option value="">Todos os gestores</option>
              {snapshot.facets.managers.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
            </select>
          </label>
          <label>
            <span>Qualidade operacional</span>
            <select value={draft.silenceStatus} onChange={(event) => setDraft((current) => ({ ...current, silenceStatus: event.target.value as FidcSilenceStatus | '' }))}>
              <option value="">Todos os estados</option>
              {snapshot.facets.silenceStatuses.map((status) => <option key={status} value={status}>{silenceLabel[status]}</option>)}
            </select>
          </label>
          <label>
            <span>PL mínimo (R$)</span>
            <input inputMode="decimal" value={draft.minNav} onChange={(event) => setDraft((current) => ({ ...current, minNav: event.target.value }))} placeholder="100000000" />
          </label>
          <label>
            <span>Inadimplência mínima (%)</span>
            <input inputMode="decimal" value={draft.minDelinquencyPct} onChange={(event) => setDraft((current) => ({ ...current, minDelinquencyPct: event.target.value }))} placeholder="5" />
          </label>
          <label>
            <span>Subordinação máxima (%)</span>
            <input inputMode="decimal" value={draft.maxSubordinationPct} onChange={(event) => setDraft((current) => ({ ...current, maxSubordinationPct: event.target.value }))} placeholder="10" />
          </label>
          <label>
            <span>Ordenação</span>
            <select value={draft.sort} onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value as FidcMarketMapSort }))}>
              <option value="nav_desc">Maior PL</option>
              <option value="nav_asc">Menor PL</option>
              <option value="delinquency_desc">Maior inadimplência</option>
              <option value="subordination_asc">Menor subordinação</option>
              <option value="reference_desc">Competência mais recente</option>
              <option value="fund_asc">Nome do fundo</option>
            </select>
          </label>
          <label>
            <span>Linhas por página</span>
            <select value={draft.pageSize} onChange={(event) => setDraft((current) => ({ ...current, pageSize: Number(event.target.value) }))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div className="fidc-filter-actions">
            <button type="submit" disabled={loading}>{loading ? 'Atualizando...' : 'Aplicar filtros'}</button>
            <button type="button" className="secondary" onClick={resetFilters}>Limpar</button>
          </div>
        </form>
      </Card>

      <section className="grid cols-3 fidc-use-grid">
        <Card title="Comparáveis de estrutura" subtitle="Benchmark para desenho da operação" className="dense-card">
          <div className="mini-metric-grid"><Stat label="PL mediano" value={formatCurrency(summary.medianNav)} helper="Tamanho do recorte selecionado" /></div>
          <p className="table-helper">Use PL, carteira, cotistas e subordinação para comparar escala, reforço de crédito e estágio do veículo.</p>
        </Card>
        <Card title="Atenção financeira" subtitle="Onde aprofundar diligência" className="dense-card">
          <div className="mini-metric-grid"><Stat label="Acima de 10%" value={String(summary.delinquencyAbove10Pct)} helper="Inadimplência sobre PL" /></div>
          <p className="table-helper">Razões extremas são preservadas e sinalizadas como anomalia; o sistema não corrige nem omite o valor reportado.</p>
        </Card>
        <Card title="Limite de uso" subtitle="Governança antes de qualificação" className="dense-card">
          <div className="mini-metric-grid"><Stat label="Sem resolução" value={String(summary.unresolvedFunds)} helper="Fundo ainda não ligado a empresa" /></div>
          <p className="table-helper">Nenhum evento desta tela entra em qualification, patterns, score, thesis, ranking ou pipeline sem resolução e corroboração.</p>
        </Card>
      </section>

      <Card
        title="Fundos comparáveis"
        subtitle={`${integer.format(pagination.total)} resultados · competência mais recente ${formatDate(summary.latestReferenceDate)}`}
        className="dense-card fidc-results-card"
        actions={<Pill tone="info">página {pagination.page} de {Math.max(1, pagination.totalPages)}</Pill>}
      >
        {snapshot.rows.length ? (
          <div className="fidc-table-wrap">
            <table className="dense-table fidc-table">
              <thead>
                <tr>
                  <th>Fundo</th>
                  <th>PL e carteira</th>
                  <th>Risco da carteira</th>
                  <th>Reforço de crédito</th>
                  <th>Prestadores</th>
                  <th>Operação</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((row) => {
                  const flags = attentionText(row);
                  return (
                    <tr key={row.eventId}>
                      <td className="fidc-fund-cell">
                        <strong>{row.fundName || 'Fundo sem denominação'}</strong>
                        <div className="table-helper mono">{formatCnpj(row.fundCnpj)}</div>
                        {flags.length ? <div className="fidc-row-flags">{flags.map((flag) => <Pill key={flag} tone={flag.includes('fora') ? 'danger' : 'warning'}>{flag}</Pill>)}</div> : <Pill tone="success">sem alerta do recorte</Pill>}
                      </td>
                      <td>
                        <strong className="mono">{formatCurrency(row.nav, false)}</strong>
                        <div className="table-helper">carteira {formatCurrency(row.portfolio)}</div>
                        <div className="table-helper">{integer.format(row.investors ?? 0)} cotistas</div>
                      </td>
                      <td>
                        <strong className="mono">{formatPercent(row.delinquencyToNav)}</strong>
                        <div className="table-helper">inad. {formatCurrency(row.delinquencyTotal)}</div>
                        <div className="table-helper">PDD {formatCurrency(row.pdd)}</div>
                      </td>
                      <td>
                        <strong className="mono">{formatPercent(row.subordinationPct)}</strong>
                        <div className="table-helper">subordinação reportada</div>
                        <div className="table-helper">resolução: {row.companyResolutionStatus}</div>
                      </td>
                      <td>
                        <strong>{row.managerName || 'Gestor não informado'}</strong>
                        <div className="table-helper">admin. {row.administratorName || 'não informado'}</div>
                        <div className="table-helper">custódia {row.custodianName || 'não informada'}</div>
                      </td>
                      <td>
                        <Pill tone={silenceTone(row.silenceStatus)}>{row.silenceStatus ? silenceLabel[row.silenceStatus] : 'sem status'}</Pill>
                        <div className="table-helper">competência {formatDate(row.referenceDate)}</div>
                        <div className="table-helper">{row.monthsWithoutReport ?? 0} meses sem informe · {row.currentViolations ?? 0} violações</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum fundo no recorte." description="Reduza os filtros para voltar ao universo disponível. Nenhum dado sintético será inserido para preencher a tabela." />
        )}
        <div className="fidc-pagination">
          <span>{pagination.total ? `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} de ${pagination.total}` : '0 resultados'}</span>
          <div className="actions">
            <button type="button" className="secondary compact-button" disabled={!pagination.hasPrevious || loading} onClick={() => movePage(Math.max(1, pagination.page - 1))}>Anterior</button>
            <button type="button" className="secondary compact-button" disabled={!pagination.hasNext || loading} onClick={() => movePage(pagination.page + 1)}>Próxima</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
