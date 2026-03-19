import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { StateBlock } from '../components/StateBlock'

const initialForm = { name: '', cnpj: '', sector: 'logistics', stage: 'lead' }
const initialSignal = { signal_type: 'expansion', strength: 60, summary: 'Sinal inicial validado' }

export function CompaniesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [companies, setCompanies] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState(initialForm)
  const [signalForm, setSignalForm] = useState(initialSignal)
  const [details, setDetails] = useState({ score: null, history: [], thesis: null, signals: [] })

  const selected = useMemo(() => companies.find((item) => item.id === selectedId), [companies, selectedId])

  const refresh = async (preserveId) => {
    const data = await api.listCompanies()
    setCompanies(data.items)
    if (data.items.length && (!preserveId || !data.items.some((item) => item.id === preserveId))) {
      setSelectedId(data.items[0].id)
    } else if (preserveId) {
      setSelectedId(preserveId)
    }
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    Promise.all([
      api.getScore(selectedId),
      api.getScoreHistory(selectedId),
      api.getThesis(selectedId),
      api.listSignals(selectedId),
    ])
      .then(([score, history, thesis, signals]) => setDetails({ score, history: history.items, thesis, signals: signals.items }))
      .catch((err) => setError(err.message))
  }, [selectedId])

  const handleCreateCompany = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const created = await api.createCompany(form)
      setForm(initialForm)
      await refresh(created.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateSignal = async (event) => {
    event.preventDefault()
    if (!selectedId) return
    setError('')
    try {
      await api.createSignal({ company_id: selectedId, source_id: 'cvm', ...signalForm })
      const [score, history, thesis, signals] = await Promise.all([
        api.getScore(selectedId),
        api.getScoreHistory(selectedId),
        api.getThesis(selectedId),
        api.listSignals(selectedId),
      ])
      setDetails({ score, history: history.items, thesis, signals: signals.items })
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <StateBlock title="Carregando empresas" message="Sincronizando pipeline consolidado..." />

  return (
    <div className="grid two-up">
      <section className="card">
        <h2>Cadastrar empresa</h2>
        <form className="stack" onSubmit={handleCreateCompany}>
          <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="CNPJ" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          <input placeholder="Setor" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} required />
          <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
            <option value="lead">Lead</option>
            <option value="prospect">Prospect</option>
            <option value="qualified">Qualified</option>
          </select>
          <button type="submit">Salvar empresa</button>
        </form>

        <h3>Carteira</h3>
        {companies.length === 0 ? <StateBlock title="Sem empresas" message="Cadastre a primeira empresa para ativar o fluxo." /> : (
          <ul className="list">
            {companies.map((company) => (
              <li key={company.id}>
                <button className={selectedId === company.id ? 'list-button active' : 'list-button'} onClick={() => setSelectedId(company.id)}>
                  <strong>{company.name}</strong>
                  <span>{company.sector} · {company.stage}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Operação</h2>
        {error && <StateBlock title="Erro" message={error} tone="error" />}
        {!selected ? <StateBlock title="Selecione uma empresa" message="Escolha uma empresa para consultar score, thesis e sinais." /> : (
          <>
            <p><strong>{selected.name}</strong> · {selected.sector}</p>
            <div className="metrics-row">
              <div><span>Score atual</span><strong>{details.score?.score ?? '-'}</strong></div>
              <div><span>Histórico</span><strong>{details.history.length}</strong></div>
              <div><span>Sinais</span><strong>{details.signals.length}</strong></div>
            </div>
            <article className="nested-card">
              <h3>Thesis</h3>
              <p>{details.thesis?.summary ?? 'Aguardando dados.'}</p>
            </article>
            <article className="nested-card">
              <h3>Registrar sinal</h3>
              <form className="stack" onSubmit={handleCreateSignal}>
                <input value={signalForm.signal_type} onChange={(e) => setSignalForm({ ...signalForm, signal_type: e.target.value })} required />
                <input type="number" min="1" max="100" value={signalForm.strength} onChange={(e) => setSignalForm({ ...signalForm, strength: Number(e.target.value) })} required />
                <textarea value={signalForm.summary} onChange={(e) => setSignalForm({ ...signalForm, summary: e.target.value })} required />
                <button type="submit">Registrar sinal</button>
              </form>
            </article>
            <article className="nested-card">
              <h3>Histórico de score</h3>
              <ul>
                {details.history.map((item, index) => <li key={`${item.calculated_at}-${index}`}>{item.score} pontos · diversidade {item.breakdown.source_diversity}</li>)}
              </ul>
            </article>
          </>
        )}
      </section>
    </div>
  )
}
