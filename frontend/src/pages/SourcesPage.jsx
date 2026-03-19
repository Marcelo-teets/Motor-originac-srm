import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { StateBlock } from '../components/StateBlock'

export function SourcesPage() {
  const [state, setState] = useState({ loading: true, error: '', items: [] })

  useEffect(() => {
    api.listSources()
      .then((data) => setState({ loading: false, error: '', items: data.items }))
      .catch((err) => setState({ loading: false, error: err.message, items: [] }))
  }, [])

  if (state.loading) return <StateBlock title="Carregando fontes" message="Buscando catálogo real do backend..." />
  if (state.error) return <StateBlock title="Erro" message={state.error} tone="error" />
  if (state.items.length === 0) return <StateBlock title="Sem dados" message="Nenhuma fonte ativa encontrada." />

  return (
    <section className="card">
      <h2>Fontes</h2>
      <table>
        <thead><tr><th>Nome</th><th>Categoria</th><th>Região</th><th>Confiabilidade</th></tr></thead>
        <tbody>
          {state.items.map((item) => (
            <tr key={item.id}><td>{item.name}</td><td>{item.category}</td><td>{item.region}</td><td>{item.reliability}/5</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
