import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAgentetomeRuntime,
  queueAgentetomeRefresh,
  validateAgentetomeXml,
  type AgentetomeRuntimeStatus,
  type AgentetomeValidationResult,
} from '../lib/agentetomeApi';
import { useAuth } from '../lib/auth';
import { Card, EmptyState, Pill, Stat } from './UI';

const number = new Intl.NumberFormat('pt-BR');
const formatNumber = (value: number) => number.format(value);
const formatDate = (value?: string | null) => {
  if (!value) return 'nunca';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Não foi possível ler o XML.'));
  reader.onload = () => {
    const value = String(reader.result ?? '');
    const separator = value.indexOf(',');
    if (separator < 0) reject(new Error('Não foi possível converter o XML.'));
    else resolve(value.slice(separator + 1));
  };
  reader.readAsDataURL(file);
});

const validationCounters = (result: AgentetomeValidationResult | null) => {
  const counters = result?.data?.contadores;
  return counters && typeof counters === 'object' ? counters as Record<string, unknown> : {};
};

export function AgentetomeOperationsPanel() {
  const { session, isGodMode } = useAuth();
  const [runtime, setRuntime] = useState<AgentetomeRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<AgentetomeValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadRuntime = async () => {
    setError(null);
    try { setRuntime(await getAgentetomeRuntime(session)); }
    catch (currentError) { setError(currentError instanceof Error ? currentError.message : String(currentError)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadRuntime(); }, [session?.access_token]);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await queueAgentetomeRefresh(session);
      setRefreshMessage(result.status === 'failed'
        ? `Falha ao enfileirar: ${result.error ?? 'erro desconhecido'}`
        : 'Refresh real enfileirado. O control plane validará o pacote e atualizará o Market Map automaticamente.');
      await loadRuntime();
    } catch (currentError) {
      setRefreshMessage(currentError instanceof Error ? currentError.message : String(currentError));
    } finally {
      setRefreshing(false);
    }
  };

  const validateXml = async () => {
    if (!xmlFile) return;
    setValidating(true);
    setValidation(null);
    setValidationError(null);
    try {
      if (xmlFile.size > 5 * 1024 * 1024) throw new Error('O XML excede o limite de 5 MB.');
      const result = await validateAgentetomeXml(session, await fileToBase64(xmlFile));
      setValidation(result);
    } catch (currentError) {
      setValidationError(currentError instanceof Error ? currentError.message : String(currentError));
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <Card title="Agentetome" subtitle="Carregando control plane, ingestão e Market Map">Consultando runtime seguro no Supabase...</Card>;
  if (error || !runtime) {
    return (
      <Card title="Agentetome" subtitle="Falha controlada ao consultar a integração" actions={<Pill tone="warning">atenção</Pill>}>
        <p>{error ?? 'Status indisponível.'}</p>
      </Card>
    );
  }

  const healthy = runtime.status === 'real' && runtime.health === 'healthy' && runtime.blockers.length === 0;
  const counters = validationCounters(validation);

  return (
    <Card
      title="Agentetome · operação real"
      subtitle="Exportação por administradora, bronze, silver FIDC, comparáveis e validação preventiva de XML"
      actions={<Pill tone={healthy ? 'success' : 'warning'}>{healthy ? '100% operacional' : `${runtime.blockers.length} pendência(s)`}</Pill>}
      className="dense-card"
    >
      <div className="mini-metric-grid">
        <Stat label="Targets ativos" value={String(runtime.activeTargets)} helper={runtime.automaticRefresh ? 'refresh automático ativo' : 'agendamento inativo'} />
        <Stat label="Pacotes validados" value={String(runtime.parsedPackages)} helper={`${runtime.failedPackages} falhas históricas auditadas`} />
        <Stat label="Bronze" value={formatNumber(runtime.bronzeRows)} helper="linhas com lineage e hash" />
        <Stat label="Silver FIDC" value={formatNumber(runtime.fidcEvents)} helper="fundos no Market Map" />
        <Stat label="Competência" value={runtime.latestReferenceDate ?? '-'} helper="última referência disponível" />
        <Stat label="Última verificação" value={formatDate(runtime.lastCheckAt)} helper={`segredo: ${runtime.secretMode}`} />
      </div>

      <div className="pill-row top-gap">
        <Pill tone={runtime.configured ? 'success' : 'warning'}>{runtime.configured ? 'Vault configurado' : 'Vault pendente'}</Pill>
        <Pill tone={runtime.marketMapReady ? 'success' : 'warning'}>{runtime.marketMapReady ? 'Market Map pronto' : 'Silver vazio'}</Pill>
        <Pill tone={runtime.automaticRefresh ? 'success' : 'warning'}>{runtime.automaticRefresh ? 'pg_cron ativo' : 'pg_cron inativo'}</Pill>
        <Pill tone="info">score automático desativado</Pill>
      </div>

      {runtime.blockers.length ? (
        <div className="top-gap">
          <strong>Bloqueios operacionais</strong>
          <ul className="list compact-list">
            {runtime.blockers.map((blocker) => (
              <li key={blocker.code}><strong>{blocker.title}</strong><span>{blocker.nextAction}</span></li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pill-row top-gap">
        <Link to="/market-map" className="button secondary">Abrir Market Map FIDC</Link>
        {isGodMode ? (
          <button className="button primary" type="button" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Enfileirando...' : 'Atualizar Agentetome agora'}
          </button>
        ) : null}
      </div>
      {refreshMessage ? <p className="table-helper top-gap">{refreshMessage}</p> : null}

      <div className="top-gap">
        <strong>Validação preventiva de informe mensal FIDC</strong>
        <p className="table-helper">O XML é enviado ao Agentetome somente em memória, não é persistido e não é enviado à CVM. Limite de 5 MB.</p>
        <div className="pill-row top-gap">
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={(event) => {
              setXmlFile(event.target.files?.[0] ?? null);
              setValidation(null);
              setValidationError(null);
            }}
          />
          <button className="button secondary" type="button" onClick={() => void validateXml()} disabled={!xmlFile || validating}>
            {validating ? 'Validando...' : 'Validar XML'}
          </button>
        </div>
        {xmlFile ? <p className="table-helper">{xmlFile.name} · {formatNumber(xmlFile.size)} bytes</p> : null}
        {validationError ? <p className="table-helper">Erro: {validationError}</p> : null}
        {validation ? (
          <div className="summary-item top-gap">
            <div className="stack-blocks compact-gap">
              <Pill tone={validation.data?.ok === true ? 'success' : 'warning'}>{validation.data?.ok === true ? 'estrutura aprovada' : 'revisão necessária'}</Pill>
              <strong>Leiaute {String(validation.data?.leiaute ?? 'não identificado')}</strong>
              <span>Bloqueantes: {String(counters.qt_bloqueante ?? 0)} · conferir: {String(counters.qt_conferir ?? 0)} · checks OK: {String(counters.qt_ok ?? 0)}</span>
              <span>XML persistido: não · enviado à CVM: não</span>
            </div>
          </div>
        ) : null}
      </div>

      {!runtime.capabilities.length ? (
        <EmptyState title="Sem capacidades declaradas" description="Reaplique o control plane Agentetome." />
      ) : null}
    </Card>
  );
}
