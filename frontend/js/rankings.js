import { apiGet } from './api.js';

async function loadRankings() {
  const rows = await apiGet('/api/v1/rankings/v2');
  document.querySelector('#ranking-table-body').innerHTML = rows
    .map((row) => `
      <tr>
        <td><a href="./company.html?companyId=${row.company_id}">${row.company_name}</a></td>
        <td>${row.current_ors_v2}</td>
        <td>${row.score_delta}</td>
        <td>${row.trigger_strength}</td>
        <td>${row.source_confidence_score}</td>
        <td>${row.market_fit_score}</td>
        <td>${row.ranking_v2}</td>
        <td>${row.tier}</td>
      </tr>
    `)
    .join('');
}

loadRankings().catch((error) => {
  document.body.insertAdjacentHTML('beforeend', `<p class="error">${error.message}</p>`);
});
