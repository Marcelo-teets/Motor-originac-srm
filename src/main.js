import { loadCompanyResources } from './lib/api.js';
import {
  createActionsPanel,
  createGeneralDataPanel,
  createMarketMapPanel,
  createMonitoringPanel,
  createScoreHistoryPanel,
  createThesisPanel,
} from './components/panels.js';
import { createElement } from './components/ui.js';

function getCompanyId() {
  const [, companiesSegment, companyId] = window.location.pathname.split('/');
  if (companiesSegment === 'companies' && companyId) {
    return companyId;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('companyId') || '1';
}

function createHero() {
  const hero = createElement('header', 'page-hero');
  const copy = createElement('div');
  copy.append(
    createElement('p', 'page-hero__eyebrow', 'Origination Intelligence Platform'),
    createElement('h1', null, 'Visão completa de inteligência da empresa'),
    createElement(
      'p',
      null,
      'Estrutura em blocos para análise executiva, score, tese de crédito, market map, monitoramento e ações.',
    ),
  );
  hero.append(copy);
  return hero;
}

async function bootstrap() {
  const app = document.querySelector('#app');
  const page = createElement('main', 'page-shell');
  const content = createElement('div', 'page-content');
  const companyId = getCompanyId();

  page.append(createHero());
  content.append(createElement('div', 'status-block', 'Carregando visão de inteligência…'));
  page.append(content);
  app.replaceChildren(page);

  const resources = await loadCompanyResources(companyId);

  const generalError = resources.thesis.error || resources.marketMap.error || resources.monitoring.error;

  content.replaceChildren(
    createGeneralDataPanel({
      companyId,
      thesis: resources.thesis.data,
      marketMap: resources.marketMap.data,
      monitoring: resources.monitoring.data,
      error: generalError,
    }),
    createScoreHistoryPanel(resources.scoreHistory),
    createThesisPanel(resources.thesis),
    createMarketMapPanel(resources.marketMap),
    createMonitoringPanel(resources.monitoring),
    createActionsPanel({ thesis: resources.thesis.data, monitoring: resources.monitoring.data }),
  );
}

bootstrap();
