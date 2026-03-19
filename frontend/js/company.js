import { apiGet, apiPost } from './api.js';

const companyId = Number(new URLSearchParams(window.location.search).get('companyId') || 1);

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function renderRankingContext(scoreHistory) {
  const entries = [
    ['ORS v2', scoreHistory.current_ors_v2],
    ['Delta', scoreHistory.score_delta],
    ['Trigger Strength', scoreHistory.trigger_strength],
    ['Source Confidence', scoreHistory.source_confidence_score],
    ['Market Fit', scoreHistory.market_fit_score],
    ['Ranking V2', scoreHistory.ranking_v2],
  ];
  document.querySelector('#ranking-kpis').innerHTML = entries
    .map(([label, value]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong></article>`)
    .join('');
}

async function loadCompanyView() {
  const [monitoring, thesis, marketMap, scoreHistory] = await Promise.all([
    apiGet(`/api/v1/companies/${companyId}/monitoring-output`),
    apiGet(`/api/v1/companies/${companyId}/thesis`),
    apiGet(`/api/v1/companies/${companyId}/market-map`),
    apiGet(`/api/v1/score-history/companies/${companyId}`),
  ]);

  const latestScore = scoreHistory[0];

  document.querySelector('#company-name').textContent = thesis.headline.split(' is ')[0];
  document.querySelector('#company-meta').textContent = `Company ID ${companyId} • Latest thesis updated at ${new Date(thesis.created_at).toLocaleString()}`;

  renderRankingContext(latestScore);

  document.querySelector('#score-history-list').innerHTML = scoreHistory
    .map((item) => `<li><strong>${item.ranking_v2}</strong> ranking_v2 • delta ${item.score_delta} • ${new Date(item.created_at).toLocaleString()}</li>`)
    .join('');

  document.querySelector('#thesis-content').innerHTML = `
    <h3>Latest Thesis</h3>
    <p>${thesis.headline}</p>
    <h4>Why now</h4>
    ${renderList(thesis.why_now_json)}
    <h4>Recommended structures</h4>
    ${renderList(thesis.recommended_structures_json)}
    <h4>Key risks</h4>
    ${renderList(thesis.key_risks_json)}
    <p><strong>Outreach angle:</strong> ${thesis.suggested_outreach_angle}</p>
  `;

  document.querySelector('#market-map-content').innerHTML = `
    <h3>Latest Market Map</h3>
    <p><strong>Primary asset type:</strong> ${marketMap.primary_asset_type}</p>
    <p><strong>Primary structure:</strong> ${marketMap.primary_structure}</p>
    <p><strong>Investor hint:</strong> ${marketMap.investor_profile_hint}</p>
    <p><strong>Market fit score:</strong> ${marketMap.market_fit_score}</p>
    <h4>Secondary structures</h4>
    ${renderList(marketMap.secondary_structures_json)}
  `;

  document.querySelector('#monitoring-content').innerHTML = `
    <h3>Monitoring output</h3>
    <p><strong>Source:</strong> ${monitoring.source_name} (${monitoring.source_type})</p>
    <pre>${JSON.stringify(monitoring.output_json, null, 2)}</pre>
    <h4>Observed signals</h4>
    ${renderList(monitoring.observed_signals_json)}
  `;
}

document.querySelector('#run-pipeline').addEventListener('click', async () => {
  await apiPost(`/api/v1/orchestration/companies/${companyId}/full-pipeline-v2`);
  await loadCompanyView();
});

loadCompanyView().catch((error) => {
  document.body.insertAdjacentHTML('beforeend', `<p class="error">${error.message}</p>`);
});
