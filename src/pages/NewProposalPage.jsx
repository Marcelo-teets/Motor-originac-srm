import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import FormSection from '../components/ui/FormSection';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Textarea from '../components/ui/Textarea';
import { getClientes } from '../services/clientesService';
import { criarProposta } from '../services/propostasService';

const initialForm = {
  clienteId: '',
  clienteNome: '',
  produto: '',
  valor: '',
  prazoMeses: '',
  origem: '',
  responsavel: '',
  taxaIndicativa: '',
  observacoes: '',
};

export default function NewProposalPage() {
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getClientes().then(setClientes);
  }, []);

  const produtoOptions = useMemo(
    () => ['Capital de Giro', 'Antecipação de Recebíveis', 'Financiamento de Equipamentos', 'Crédito Estruturado'],
    [],
  );

  function handleChange(field, value) {
    if (field === 'clienteId') {
      const cliente = clientes.find((item) => item.id === value);
      setForm((current) => ({
        ...current,
        clienteId: value,
        clienteNome: cliente?.nome ?? '',
      }));
      return;
    }

    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const nextErrors = {};

    ['clienteId', 'produto', 'valor', 'prazoMeses', 'origem', 'responsavel'].forEach((field) => {
      if (!String(form[field]).trim()) {
        nextErrors[field] = 'Campo obrigatório.';
      }
    });

    if (form.valor && Number(form.valor) <= 0) {
      nextErrors.valor = 'Informe um valor maior que zero.';
    }

    if (form.prazoMeses && Number(form.prazoMeses) <= 0) {
      nextErrors.prazoMeses = 'Informe um prazo válido.';
    }

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setFeedback('Preencha os campos destacados para criar a proposta.');
      return;
    }

    setSaving(true);
    const created = await criarProposta({
      ...form,
      valor: Number(form.valor),
      prazoMeses: Number(form.prazoMeses),
    });

    setSaving(false);
    setFeedback('Proposta criada com sucesso. Redirecionando para os detalhes...');
    setTimeout(() => navigate(`/propostas/${created.id}`), 500);
  }

  return (
    <PageContainer
      title="Nova proposta"
      description="Cadastre uma oportunidade com dados suficientes para iniciar triagem e fluxo de análise."
    >
      <Card title="Formulário de originação" subtitle="Campos essenciais para a entrada no pipeline.">
        <form className="proposal-form" onSubmit={handleSubmit}>
          <FormSection title="Dados principais" description="Informações iniciais da operação e vínculo com cliente.">
            <div className="form-grid">
              <Select
                id="clienteId"
                label="Cliente"
                value={form.clienteId}
                error={errors.clienteId}
                onChange={(event) => handleChange('clienteId', event.target.value)}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </Select>
              <Select
                id="produto"
                label="Produto"
                value={form.produto}
                error={errors.produto}
                onChange={(event) => handleChange('produto', event.target.value)}
              >
                <option value="">Selecione o produto</option>
                {produtoOptions.map((produto) => (
                  <option key={produto} value={produto}>
                    {produto}
                  </option>
                ))}
              </Select>
              <Input
                id="valor"
                label="Valor solicitado"
                type="number"
                min="0"
                placeholder="Ex.: 1500000"
                value={form.valor}
                error={errors.valor}
                onChange={(event) => handleChange('valor', event.target.value)}
              />
              <Input
                id="prazoMeses"
                label="Prazo (meses)"
                type="number"
                min="1"
                placeholder="Ex.: 24"
                value={form.prazoMeses}
                error={errors.prazoMeses}
                onChange={(event) => handleChange('prazoMeses', event.target.value)}
              />
            </div>
          </FormSection>

          <FormSection title="Contexto comercial" description="Campos para roteamento e acompanhamento da operação.">
            <div className="form-grid">
              <Input
                id="origem"
                label="Origem"
                placeholder="Ex.: Canal parceiro"
                value={form.origem}
                error={errors.origem}
                onChange={(event) => handleChange('origem', event.target.value)}
              />
              <Input
                id="responsavel"
                label="Responsável"
                placeholder="Ex.: Marina Rocha"
                value={form.responsavel}
                error={errors.responsavel}
                onChange={(event) => handleChange('responsavel', event.target.value)}
              />
              <Input
                id="taxaIndicativa"
                label="Taxa indicativa"
                placeholder="Ex.: 1,45% a.m."
                value={form.taxaIndicativa}
                onChange={(event) => handleChange('taxaIndicativa', event.target.value)}
              />
            </div>
            <Textarea
              id="observacoes"
              label="Observações"
              placeholder="Descreva o contexto, garantias ou necessidade do cliente."
              value={form.observacoes}
              onChange={(event) => handleChange('observacoes', event.target.value)}
            />
          </FormSection>

          {feedback && <div className={`form-feedback ${Object.keys(errors).length ? 'form-feedback--error' : 'form-feedback--success'}`}>{feedback}</div>}

          <div className="proposal-form__actions">
            <Button type="button" variant="secondary" onClick={() => navigate('/dashboard')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar proposta'}
            </Button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}
