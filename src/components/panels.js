import { asArray, asRecord, formatPrimitive, toDisplayLabel } from '../lib/api.js';
import {
  createDefinitionGrid,
  createElement,
  createSectionList,
  createStatusBlock,
  createSummaryMetric,
  createSurfaceCard,
} from './ui.js';

function withStatus({ error, hasData, emptyMessage, content }) {
  if (error) {
    return createStatusBlock(error, true);
  }
  if (!hasData) {
    return createStatusBlock(emptyMessage);
  }
  return content;
}

export function createGeneralDataPanel({ companyId, thesis, marketMap, monitoring, error }) {
  const thesisRecord = asRecord(thesis);
  const marketMapRecord = asRecord(marketMap);
  const monitoringRecord = asRecord(monitoring);
  const tags = asArray(thesisRecord.tags || marketMapRecord.tags || monitoringRecord.tags);

  const content = createElement('div', 'stack-lg');
  content.append(
    createDefinitionGrid(
      [
        { label: 'Empresa', value: thesisRecord.company_name || marketMapRecord.company_name || monitoringRecord.company_name },
        { label: 'Setor', value: marketMapRecord.sector || thesisRecord.sector },
        { label: 'Subsetor', value: marketMapRecord.subsector },
        { label: 'Coverage', value: thesisRecord.coverage_status || monitoringRecord.coverage_status },
        { label: 'Origem', value: monitoringRecord.source || thesisRecord.source },
        { label: 'Região', value: marketMapRecord.primary_region || monitoringRecord.region },
        { label: 'Último evento', value: monitoringRecord.last_event_at },
        { label: 'Próxima ação', value: thesisRecord.next_step || monitoringRecord.next_action },
      ],
      4,
    ),
  );

  if (tags.length) {
    const tagRow = createElement('div', 'tag-row');
    tags.forEach((tag) => tagRow.append(createElement('span', 'tag-chip', formatPrimitive(tag))));
    content.append(tagRow);
  }

  return createSurfaceCard({
    title: 'Dados gerais',
    subtitle: 'Consolidação dos metadados mais relevantes da empresa e do processo de originação.',
    asideText: `Company ID: ${companyId}`,
    body: withStatus({
      error,
      hasData: Object.keys(thesisRecord).length > 0 || Object.keys(marketMapRecord).length > 0 || Object.keys(monitoringRecord).length > 0,
      emptyMessage: 'Os dados gerais serão exibidos assim que os serviços retornarem informações da empresa.',
      content,
    }),
  });
}

export function createScoreHistoryPanel(resource) {
  const record = asRecord(resource.data);
  const history = asArray(record.history || record.results || record.items || resource.data);
  const content = createElement('div');
  const summary = createElement('div', 'score-summary');
  summary.append(
    createSummaryMetric('Score atual', record.current_score || record.score || history[0]?.score),
    createSummaryMetric('Última atualização', record.updated_at || history[0]?.created_at || history[0]?.date),
    createSummaryMetric('Registros', history.length),
  );
  content.append(summary);

  if (history.length) {
    const timeline = createElement('div', 'timeline');
    history.forEach((entry) => {
      const point = asRecord(entry);
      const item = createElement('article', 'timeline__item');
      const contentBox = createElement('div', 'timeline__content');
      const meta = createElement('div', 'timeline__meta');
      meta.append(
        createElement('strong', null, formatPrimitive(point.score || point.value || point.result)),
        createElement('span', null, formatPrimitive(point.created_at || point.date || point.reference_date)),
      );
      const details = createElement('div', 'timeline__details');
      Object.entries(point)
        .filter(([key]) => !['score', 'value', 'result', 'created_at', 'date', 'reference_date'].includes(key))
        .slice(0, 4)
        .forEach(([key, value]) => details.append(createElement('span', null, `${toDisplayLabel(key)}: ${formatPrimitive(value)}`)));
      contentBox.append(meta, details);
      item.append(createElement('div', 'timeline__marker'), contentBox);
      timeline.append(item);
    });
    content.append(timeline);
  }

  return createSurfaceCard({
    title: 'Score e histórico',
    subtitle: 'Evolução de score, mudanças recentes e contexto temporal.',
    asideText: `Atual: ${formatPrimitive(record.current_score || record.score || history[0]?.score)}`,
    body: withStatus({
      error: resource.error,
      hasData: history.length > 0 || Boolean(record.current_score || record.score),
      emptyMessage: 'Nenhum histórico de score encontrado para esta empresa.',
      content,
    }),
  });
}

export function createThesisPanel(resource) {
  const thesis = asRecord(resource.data);
  const content = createElement('div', 'stack-lg');
  content.append(createElement('p', 'narrative', formatPrimitive(thesis.summary || thesis.executive_summary || thesis.thesis)));
  content.append(
    createDefinitionGrid(
      [
        { label: 'Recomendação', value: thesis.recommendation },
        { label: 'Rating', value: thesis.rating },
        { label: 'Horizonte', value: thesis.horizon },
        { label: 'Analista', value: thesis.owner || thesis.analyst },
        { label: 'Última revisão', value: thesis.updated_at },
        { label: 'Convicção', value: thesis.conviction },
      ],
      3,
    ),
  );

  const columns = createElement('div', 'triple-grid');
  columns.append(
    createSectionList('Pilares', asArray(thesis.pillars || thesis.highlights), 'Sem pilares informados.'),
    createSectionList('Riscos', asArray(thesis.risks), 'Sem riscos informados.'),
    createSectionList('Mitigantes', asArray(thesis.mitigants), 'Sem mitigantes informados.'),
  );
  content.append(columns);

  return createSurfaceCard({
    title: 'Tese de crédito',
    subtitle: 'Resumo executivo da tese, fatores de suporte e pontos de atenção.',
    asideText: `Rating: ${formatPrimitive(thesis.rating || thesis.recommendation)}`,
    body: withStatus({
      error: resource.error,
      hasData: Object.keys(thesis).length > 0,
      emptyMessage: 'A tese de crédito ainda não está disponível.',
      content,
    }),
  });
}

export function createMarketMapPanel(resource) {
  const marketMap = asRecord(resource.data);
  const content = createElement('div', 'stack-lg');
  content.append(
    createDefinitionGrid(
      [
        { label: 'Segmento', value: marketMap.segment },
        { label: 'Posição', value: marketMap.position },
        { label: 'Market share', value: marketMap.market_share },
        { label: 'Região foco', value: marketMap.primary_region },
      ],
      4,
    ),
  );

  const columns = createElement('div', 'triple-grid');
  columns.append(
    createSectionList('Peers', asArray(marketMap.peers), 'Sem pares cadastrados.'),
    createSectionList('Oportunidades', asArray(marketMap.opportunities), 'Sem oportunidades mapeadas.'),
    createSectionList('Ameaças', asArray(marketMap.threats), 'Sem ameaças mapeadas.'),
  );
  content.append(columns);

  return createSurfaceCard({
    title: 'Market map',
    subtitle: 'Posicionamento competitivo, comparação com pares e espaço de captura.',
    asideText: `Segmento: ${formatPrimitive(marketMap.segment)}`,
    body: withStatus({
      error: resource.error,
      hasData: Object.keys(marketMap).length > 0,
      emptyMessage: 'Market map indisponível para esta empresa.',
      content,
    }),
  });
}

export function createMonitoringPanel(resource) {
  const monitoring = asRecord(resource.data);
  const outputs = asArray(monitoring.outputs || monitoring.monitoring_outputs);
  const latestResults = asArray(monitoring.latest_results || monitoring.results);
  const triggers = asArray(monitoring.triggers);
  const rankingContext = asRecord(monitoring.ranking_context);
  const content = createElement('div', 'stack-lg');

  content.append(
    createDefinitionGrid(
      [
        { label: 'Último monitoramento', value: monitoring.last_run_at },
        { label: 'Status', value: monitoring.status },
        { label: 'Prioridade', value: monitoring.priority },
        { label: 'Owner', value: monitoring.owner },
      ],
      4,
    ),
  );

  const firstRow = createElement('div', 'double-grid');
  firstRow.append(
    createSectionList('Monitoring Outputs', outputs, 'Sem outputs retornados.'),
    createSectionList('Latest Results', latestResults, 'Sem resultados recentes.'),
  );

  const secondRow = createElement('div', 'double-grid');
  secondRow.append(
    createSectionList('Triggers', triggers, 'Sem triggers ativos.'),
    createSectionList('Ranking Context', Object.entries(rankingContext).map(([key, value]) => `${toDisplayLabel(key)}: ${formatPrimitive(value)}`), 'Sem contexto de ranking.'),
  );

  content.append(firstRow, secondRow);

  return createSurfaceCard({
    title: 'Monitoramento',
    subtitle: 'Sinais recentes, saídas do motor de monitoramento e contexto de ranking.',
    asideText: `Outputs: ${outputs.length}`,
    body: withStatus({
      error: resource.error,
      hasData: Object.keys(monitoring).length > 0,
      emptyMessage: 'Sem dados de monitoramento disponíveis.',
      content,
    }),
  });
}

export function createActionsPanel({ thesis, monitoring }) {
  const thesisRecord = asRecord(thesis);
  const monitoringRecord = asRecord(monitoring);
  const content = createElement('div', 'double-grid');
  content.append(
    createSectionList('Próximas ações', asArray(thesisRecord.next_actions || monitoringRecord.next_actions), 'Sem ações propostas.'),
    createSectionList('Responsáveis', asArray(monitoringRecord.owners || thesisRecord.approvers), 'Sem responsáveis definidos.'),
  );

  return createSurfaceCard({
    title: 'Ações',
    subtitle: 'Próximos passos para avanço comercial e manutenção da cobertura.',
    body: content,
  });
}

