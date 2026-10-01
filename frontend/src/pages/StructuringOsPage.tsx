import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/structuring-os.css';

type DecisionTone = 'go' | 'conditions' | 'hold' | 'rework' | 'nogo';

type Deal = {
  id: string;
  name: string;
  company: string;
  product: 'FIDC' | 'CRI' | 'CRA' | 'Debênture';
  volume: string;
  stage: string;
  dataQuality: number;
  decision: string;
  tone: DecisionTone;
  updated: string;
};

const demoDeals: Deal[] = [
  { id: 'BD-001', name: 'Projeto Aurora', company: 'Originador A', product: 'FIDC', volume: 'R$ 120,0 mi', stage: 'Estruturação', dataQuality: 88, decision: 'GO WITH CONDITIONS', tone: 'conditions', updated: 'Hoje · 09:42' },
  { id: 'BD-002', name: 'Projeto Horizonte', company: 'Companhia B', product: 'Debênture', volume: 'R$ 95,0 mi', stage: 'Análise', dataQuality: 71, decision: 'HOLD', tone: 'hold', updated: 'Hoje · 08:15' },
  { id: 'BD-003', name: 'Projeto Prisma', company: 'Originador C', product: 'FIDC', volume: 'R$ 82,0 mi', stage: 'Análise', dataQuality: 84, decision: 'GO WITH CONDITIONS', tone: 'conditions', updated: 'Ontem · 18:20' },
  { id: 'BD-004', name: 'Projeto Atlas', company: 'Companhia D', product: 'CRI', volume: 'R$ 68,0 mi', stage: 'Modelagem', dataQuality: 93, decision: 'GO', tone: 'go', updated: 'Ontem · 17:06' },
  { id: 'BD-005', name: 'Projeto Norte', company: 'Originador E', product: 'CRA', volume: 'R$ 54,0 mi', stage: 'Intake', dataQuality: 64, decision: 'REWORK', tone: 'rework', updated: '30 set · 16:11' },
];

const processSteps = [
  ['01', 'Funding need', 'Empresa, necessidade e ativo'],
  ['02', 'Data room', 'Documentos, gaps e consistência'],
  ['03', 'Credit', 'Originador, cedente e servicer'],
  ['04', 'Portfolio', 'Performance e concentração'],
  ['05', 'Modeling', 'Perdas, cash flow e economics'],
  ['06', 'Structure', 'Tranches, waterfall e triggers'],
  ['07', 'Stress', 'Base, downside, severe e break-even'],
  ['08', 'Decision', 'Condições, riscos e parecer'],
];

const riskBars = [
  { name: 'Aurora', loss: 3.2, enhancement: 22 },
  { name: 'Horizonte', loss: 5.8, enhancement: 14 },
  { name: 'Prisma', loss: 4.6, enhancement: 18 },
  { name: 'Atlas', loss: 2.9, enhancement: 20 },
  { name: 'Norte', loss: 6.2, enhancement: 16 },
];

const health = [
  ['Documentação', 76],
  ['Data Quality', 88],
  ['Credit Analysis', 91],
  ['Modeling', 84],
  ['Legal / Reg.', 72],
] as const;

const modules = ['Overview', 'Deals', 'Análise', 'Carteira', 'Modelagem', 'Documentos'] as const;
type Module = typeof modules[number];

export function StructuringOsPage() {
  const [activeModule, setActiveModule] = useState<Module>('Overview');
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('Todos');

  const filteredDeals = useMemo(() => demoDeals.filter((deal) => {
    const matchesQuery = `${deal.name} ${deal.company}`.toLowerCase().includes(query.toLowerCase());
    const matchesProduct = product === 'Todos' || deal.product === product;
    return matchesQuery && matchesProduct;
  }), [product, query]);

  return (
    <div className="page structuring-os-page">
      <section className="sos-hero">
        <div>
          <div className="sos-overline">BASE.DCM · STRUCTURING OPERATING SYSTEM</div>
          <h1>Crédito estruturado com decisão rastreável.</h1>
          <p>
            Workspace para analisar, modelar, estruturar e revisar operações de DCM sem assumir previamente o veículo.
          </p>
        </div>
        <div className="sos-hero-actions">
          <span className="sos-demo-badge"><i /> Demonstração de interface · sem dados reais</span>
          <button type="button" className="button">Novo deal</button>
        </div>
      </section>

      <nav className="sos-module-nav" aria-label="Módulos do Structuring OS">
        {modules.map((module) => (
          <button
            key={module}
            type="button"
            className={activeModule === module ? 'active' : ''}
            onClick={() => setActiveModule(module)}
          >
            {module}
          </button>
        ))}
      </nav>

      {activeModule === 'Overview' ? (
        <>
          <section className="sos-kpi-grid" aria-label="Resumo do pipeline">
            <article><span>Pipeline demonstrativo</span><strong>R$ 486,0 mi</strong><small>5 operações na visão atual</small></article>
            <article><span>Deals ativos</span><strong>12</strong><small>7 em análise · 5 estruturação</small></article>
            <article><span>Pendências críticas</span><strong>6</strong><small>3 documentais · 3 dados</small></article>
            <article><span>Health score</span><strong>82<span>/100</span></strong><small>processo completo</small></article>
          </section>

          <section className="sos-grid sos-grid-main">
            <article className="sos-panel">
              <header className="sos-panel-head">
                <div><span>PIPELINE</span><h2>Operações em andamento</h2></div>
                <button type="button" onClick={() => setActiveModule('Deals')}>Ver todas →</button>
              </header>
              <div className="sos-table-wrap">
                <table className="sos-table">
                  <thead><tr><th>Operação</th><th>Produto</th><th>Volume</th><th>Etapa</th><th>Decisão</th><th>Atualização</th></tr></thead>
                  <tbody>
                    {demoDeals.map((deal) => (
                      <tr key={deal.id}>
                        <td><div className="sos-deal-name"><span>{deal.name.slice(-2).toUpperCase()}</span><div><strong>{deal.name}</strong><small>{deal.company}</small></div></div></td>
                        <td><em className="sos-tag">{deal.product}</em></td>
                        <td>{deal.volume}</td>
                        <td><em className="sos-tag">{deal.stage}</em></td>
                        <td><em className={`sos-decision ${deal.tone}`}>{deal.decision}</em></td>
                        <td>{deal.updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="sos-panel sos-attention">
              <header className="sos-panel-head"><div><span>ATTENTION</span><h2>Fila crítica</h2></div><strong>06</strong></header>
              <div className="sos-attention-list">
                <button type="button"><b>!</b><span><strong>Data tape inconsistente</strong><small>Projeto Aurora · 3 validações falharam</small></span><i>›</i></button>
                <button type="button"><b>!</b><span><strong>Missing legal docs</strong><small>Projeto Horizonte · 2 documentos</small></span><i>›</i></button>
                <button type="button"><b>!</b><span><strong>Concentração elevada</strong><small>Projeto Prisma · limite demonstrativo</small></span><i>›</i></button>
                <button type="button"><b>!</b><span><strong>Stress case incompleto</strong><small>Projeto Atlas · severe pendente</small></span><i>›</i></button>
              </div>
            </aside>
          </section>

          <section className="sos-grid sos-grid-secondary">
            <article className="sos-panel">
              <header className="sos-panel-head">
                <div><span>RISK VIEW</span><h2>Perda esperada x proteção de crédito</h2></div>
                <div className="sos-legend"><span><i className="loss" />Expected Loss</span><span><i className="enhancement" />Credit Enhancement</span></div>
              </header>
              <div className="sos-risk-chart">
                {riskBars.map((item) => (
                  <div className="sos-risk-group" key={item.name}>
                    <div className="sos-risk-columns">
                      <span className="loss" style={{ height: `${Math.max(7, item.loss * 4)}%` }}><small>{item.loss}%</small></span>
                      <span className="enhancement" style={{ height: `${Math.max(7, item.enhancement * 4)}%` }}><small>{item.enhancement}%</small></span>
                    </div>
                    <strong>{item.name}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="sos-panel">
              <header className="sos-panel-head"><div><span>PROCESS</span><h2>Health check</h2></div><strong className="sos-score">82<span>/100</span></strong></header>
              <div className="sos-health-list">
                {health.map(([label, value]) => (
                  <div key={label}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>
                ))}
              </div>
            </article>
          </section>

          <section className="sos-panel sos-process-panel">
            <header className="sos-panel-head"><div><span>METHODOLOGY</span><h2>Fluxo mínimo da análise</h2></div><Link to="/sources">Fontes & normas →</Link></header>
            <div className="sos-process-grid">
              {processSteps.map(([number, title, description]) => (
                <article key={number}><span>{number}</span><strong>{title}</strong><small>{description}</small></article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {activeModule === 'Deals' ? (
        <section className="sos-panel sos-deals-module">
          <header className="sos-panel-head sos-module-head">
            <div><span>DEAL PIPELINE</span><h2>Operações</h2><p>Originação, análise, estruturação e decisão em uma única visão.</p></div>
            <div className="sos-filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar operação..." />
              <select value={product} onChange={(event) => setProduct(event.target.value)}>
                <option>Todos</option><option>FIDC</option><option>CRI</option><option>CRA</option><option>Debênture</option>
              </select>
            </div>
          </header>
          <div className="sos-table-wrap">
            <table className="sos-table sos-table-large">
              <thead><tr><th>Operação</th><th>Empresa / Originador</th><th>Produto</th><th>Volume</th><th>Data Quality</th><th>Etapa</th><th>Decisão</th></tr></thead>
              <tbody>
                {filteredDeals.map((deal) => (
                  <tr key={deal.id}>
                    <td><div className="sos-deal-name"><span>{deal.id.slice(-2)}</span><div><strong>{deal.name}</strong><small>{deal.id}</small></div></div></td>
                    <td>{deal.company}</td>
                    <td><em className="sos-tag">{deal.product}</em></td>
                    <td>{deal.volume}</td>
                    <td><div className="sos-quality"><i><b style={{ width: `${deal.dataQuality}%` }} /></i><span>{deal.dataQuality}%</span></div></td>
                    <td><em className="sos-tag">{deal.stage}</em></td>
                    <td><em className={`sos-decision ${deal.tone}`}>{deal.decision}</em></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeModule === 'Análise' ? (
        <section className="sos-analysis-grid">
          {[
            ['01', 'Company / Originator', 'Crédito corporativo, capacidade operacional, governança, concentração e funding need.', '18 / 21'],
            ['02', 'Asset & Portfolio', 'Composição, vintages, aging, roll/cure, FPD, recoveries, dilution e concentração.', '26 / 30'],
            ['03', 'Structure & Enhancement', 'Tranches, OC, reservas, excess spread, triggers, covenants e waterfall.', '14 / 19'],
            ['04', 'Scenarios & Break-even', 'Base, downside, severe e thresholds de perda suportável com reconciliação.', '9 / 12'],
          ].map(([number, title, description, checks]) => (
            <article className="sos-panel sos-analysis-card" key={number}>
              <span>{number}</span><h2>{title}</h2><p>{description}</p><div><small>Checks concluídos</small><strong>{checks}</strong></div><button type="button">Abrir módulo →</button>
            </article>
          ))}
          <article className="sos-panel sos-decision-engine">
            <div><span>DECISION ENGINE</span><h2>Parecer preliminar</h2><p>As opções abaixo representam o workflow metodológico; nenhuma decisão é calculada nesta tela demo.</p></div>
            <div className="sos-decision-options"><button>GO</button><button className="active">GO WITH CONDITIONS</button><button>REWORK</button><button>HOLD</button><button>NO-GO</button></div>
          </article>
        </section>
      ) : null}

      {activeModule === 'Carteira' ? (
        <>
          <section className="sos-kpi-grid sos-portfolio-kpis">
            <article><span>Saldo elegível</span><strong>R$ 82,4 mi</strong><small>demo</small></article>
            <article><span>Ticket médio</span><strong>R$ 6,8 mil</strong><small>demo</small></article>
            <article><span>WA prazo</span><strong>71 dias</strong><small>demo</small></article>
            <article><span>Top 10</span><strong>24,6%</strong><small>demo</small></article>
          </section>
          <section className="sos-grid sos-grid-secondary">
            <article className="sos-panel"><header className="sos-panel-head"><div><span>AGING</span><h2>Distribuição por faixa</h2></div></header>
              <div className="sos-aging">{[['0–30d',58],['31–60d',24],['61–90d',11],['91–120d',5],['120d+',2]].map(([label,value]) => <div key={label}><span>{label}</span><i><b style={{width:`${value}%`}} /></i><strong>{value}%</strong></div>)}</div>
            </article>
            <article className="sos-panel"><header className="sos-panel-head"><div><span>CONCENTRATION</span><h2>Principais concentrações</h2></div></header>
              <div className="sos-concentration">{[['Sacado A','8,9%'],['Sacado B','6,2%'],['Sacado C','4,8%'],['Sacado D','3,1%'],['Demais','77,0%']].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
            </article>
          </section>
        </>
      ) : null}

      {activeModule === 'Modelagem' ? (
        <section className="sos-model-grid">
          <article className="sos-panel sos-assumptions"><header className="sos-panel-head"><div><span>INPUTS</span><h2>Premissas principais</h2></div><em>● demo</em></header>
            {['Volume da carteira','Taxa média ativo','Perda base','Prepayment','Subordinação','Reserva'].map((label,index) => <label key={label}><span>{label}</span><input readOnly value={['82.400.000','2,35% a.m.','3,20%','7,50%','22,00%','3,00%'][index]} /></label>)}
          </article>
          <article className="sos-panel"><header className="sos-panel-head"><div><span>SCENARIOS</span><h2>Stress testing</h2></div></header>
            <div className="sos-table-wrap"><table className="sos-table"><thead><tr><th>Métrica</th><th>Base</th><th>Downside</th><th>Severe</th></tr></thead><tbody>
              <tr><td>Loss rate</td><td>3,2%</td><td>6,5%</td><td>11,0%</td></tr><tr><td>Prepayment</td><td>7,5%</td><td>10,0%</td><td>15,0%</td></tr><tr><td>Excess spread</td><td>6,8%</td><td>4,1%</td><td>1,2%</td></tr><tr><td>Senior coverage</td><td>1,42x</td><td>1,23x</td><td>1,07x</td></tr>
            </tbody></table></div>
            <div className="sos-reconcile"><b>✓</b><span><strong>Cash flows reconciliados</strong><small>Placeholder visual para o check determinístico.</small></span></div>
          </article>
        </section>
      ) : null}

      {activeModule === 'Documentos' ? (
        <section className="sos-doc-grid">
          <article className="sos-panel sos-upload"><div>⇧</div><h2>Adicionar data room</h2><p>PDF, XLSX, DOCX, CSV e ZIP</p><button type="button" className="button secondary">Selecionar arquivos</button></article>
          <article className="sos-panel"><header className="sos-panel-head"><div><span>COVERAGE</span><h2>Checklist documental</h2></div><strong className="sos-score">76<span>%</span></strong></header>
            <div className="sos-doc-checks">
              <div className="done"><b>✓</b><span><strong>Financeiro</strong><small>DFs, balancetes, dívida e extratos</small></span><em>8 / 8</em></div>
              <div className="done"><b>✓</b><span><strong>Carteira</strong><small>Data tape, histórico e reconciliação</small></span><em>6 / 6</em></div>
              <div><b>!</b><span><strong>Jurídico</strong><small>Contratos, garantias e instrumentos</small></span><em>5 / 8</em></div>
              <div><b>!</b><span><strong>Operacional</strong><small>Políticas, servicing e cobrança</small></span><em>3 / 5</em></div>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
