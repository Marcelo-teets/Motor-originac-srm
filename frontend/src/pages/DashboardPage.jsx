import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { StateBlock } from '../components/StateBlock'

export function DashboardPage() {
  const [health, setHealth] = useState(null)
  const [sources, setSources] = useState([])
  const [marketMap, setMarketMap] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.health(), api.listSources(), api.getMarketMap()])
      .then(([healthData, sourceData, marketData]) => {
        setHealth(healthData)
        setSources(sourceData.items)
        setMarketMap(marketData.items)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <StateBlock title="Falha na integração" message={error} tone="error" />
  }

  if (!health) {
    return <StateBlock title="Carregando" message="Consultando backend consolidado..." />
  }

  return (
    <div>
      <section className="hero">
        <div>
          <p className="eyebrow">Plataforma consolidada</p>
          <h2>Pipeline de originação com backend FastAPI e frontend React integrados</h2>
          <p>Healthcheck: <strong>{health.status}</strong> · Serviço: {health.service}</p>
        </div>
      </section>
      <section className="grid two-up">
        <article className="card">
          <h3>Fontes monitoradas</h3>
          <p className="metric">{sources.length}</p>
          <ul>
            {sources.slice(0, 4).map((source) => <li key={source.id}>{source.name} · {source.category}</li>)}
          </ul>
        </article>
        <article className="card">
          <h3>Mapa de mercado</h3>
          {marketMap.length === 0 ? <p>Sem empresas suficientes para o mapa.</p> : (
            <ul>
              {marketMap.map((entry) => (
                <li key={entry.sector}>{entry.sector}: {entry.company_count} empresa(s), score médio {entry.average_score}</li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  )
}
