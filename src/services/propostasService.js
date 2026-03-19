import { propostas } from '../data/propostas';

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

let propostasStore = [...propostas];

export async function getPropostas() {
  await wait();
  return [...propostasStore].sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));
}

export async function getPropostaById(id) {
  await wait();
  return propostasStore.find((proposta) => proposta.id === id) ?? null;
}

export async function criarProposta(payload) {
  await wait();

  const novaProposta = {
    id: `prop-${Date.now()}`,
    status: 'Nova',
    etapa: 'Triagem',
    score: 0,
    atualizadoEm: new Date().toISOString().slice(0, 10),
    criadoEm: new Date().toISOString().slice(0, 10),
    timeline: [
      {
        titulo: 'Proposta criada',
        data: new Date().toISOString().slice(0, 10),
        descricao: 'Cadastro realizado via formulário do frontend.',
      },
    ],
    ...payload,
  };

  propostasStore = [novaProposta, ...propostasStore];
  return novaProposta;
}
