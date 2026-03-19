import { useMemo, useState } from 'react';
import SectionCard from '../components/SectionCard';
import { proposalDefaults } from '../services/mockData';

function NewProposalPage() {
  const [formData, setFormData] = useState(proposalDefaults);
  const [submittedProposal, setSubmittedProposal] = useState(null);

  const summary = useMemo(
    () => [
      { label: 'Cliente', value: formData.clientName || 'Não informado' },
      { label: 'Produto', value: formData.product },
      { label: 'Valor', value: formData.amount || 'R$ 0,00' },
      { label: 'Prazo', value: `${formData.term} meses` },
    ],
    [formData],
  );

  const handleChange = ({ target }) => {
    const { name, value } = target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmittedProposal({
      ...formData,
      protocol: `PROP-${Date.now().toString().slice(-4)}`,
    });
  };

  return (
    <div className="page-stack page-two-columns">
      <SectionCard
        title="Cadastrar proposta"
        description="Formulário com estado local, preparado para futura integração com backend."
      >
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Nome do cliente
            <input name="clientName" value={formData.clientName} onChange={handleChange} required />
          </label>
          <label>
            CPF / CNPJ
            <input name="document" value={formData.document} onChange={handleChange} required />
          </label>
          <label>
            Produto
            <select name="product" value={formData.product} onChange={handleChange}>
              <option>Capital de giro</option>
              <option>Financiamento</option>
              <option>Antecipação</option>
              <option>Crédito consignado</option>
            </select>
          </label>
          <label>
            Valor solicitado
            <input name="amount" value={formData.amount} onChange={handleChange} placeholder="R$ 100.000" required />
          </label>
          <label>
            Prazo (meses)
            <input name="term" type="number" min="1" value={formData.term} onChange={handleChange} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" value={formData.email} onChange={handleChange} />
          </label>
          <label>
            Telefone
            <input name="phone" value={formData.phone} onChange={handleChange} />
          </label>
          <label className="field-span-full">
            Observações
            <textarea name="notes" rows="5" value={formData.notes} onChange={handleChange} />
          </label>
          <button className="primary-button" type="submit">
            Salvar proposta
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Pré-visualização"
        description="Resumo instantâneo dos dados digitados."
      >
        <div className="summary-list">
          {summary.map((item) => (
            <div key={item.label} className="summary-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        {submittedProposal ? (
          <div className="success-box">
            <strong>Proposta salva localmente</strong>
            <p>
              Protocolo {submittedProposal.protocol} gerado para {submittedProposal.clientName}.
            </p>
          </div>
        ) : (
          <div className="info-box">Nenhuma proposta enviada até o momento.</div>
        )}
      </SectionCard>
    </div>
  );
}

export default NewProposalPage;
