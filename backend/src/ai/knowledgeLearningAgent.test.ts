import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBranchMarkdown, renderRootMarkdown, sanitizeLearningResult } from './knowledgeLearningAgent.js';

const signalId = '11111111-1111-4111-8111-111111111112';
const outputId = '11111111-1111-4111-8111-111111111113';
const qualificationId = '11111111-1111-4111-8111-111111111114';
const context = {
  signals: [{ id: signalId, label: 'Funding gap', evidence: 'Empresa acelerou originação.' }],
  monitoringOutputs: [{ id: outputId, title: 'Captação', summary: 'Nova rodada anunciada.' }],
  qualification: { id: qualificationId, fitFidc: true },
};

test('mantém fatos somente quando a evidência pertence ao contexto', () => {
  const result = sanitizeLearningResult({
    overview: 'Visão',
    whyNow: 'Agora',
    overallConfidence: 0.8,
    branches: [{
      key: 'funding',
      title: 'Funding',
      nodeType: 'thesis',
      summary: 'Pressão de capital.',
      facts: [
        { statement: 'Fato válido', confidence: 0.9, evidence: [{ type: 'company_signal', id: signalId, label: 'sinal' }] },
        { statement: 'Fato inventado', confidence: 0.95, evidence: [{ type: 'company_signal', id: '22222222-2222-4222-8222-222222222222', label: 'inválido' }] },
      ],
      hypotheses: [],
      tags: ['Funding', 'FIDC'],
      suggestedActions: ['Validar carteira'],
    }, {
      key: 'receivables', title: 'Recebíveis', nodeType: 'note', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [],
    }, {
      key: 'timing', title: 'Timing', nodeType: 'signal', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [],
    }, {
      key: 'structure-fit', title: 'Estrutura', nodeType: 'structure', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [],
    }],
    relationships: [{ fromKey: 'root', toKey: 'funding', relationType: 'supports', rationale: 'teste', confidence: 0.8 }],
    globalValidationQuestions: ['Qual o volume?'],
  }, context);

  const funding = result.branches.find((branch) => branch.key === 'funding');
  assert.equal(funding?.facts.length, 1);
  assert.equal(funding?.facts[0].statement, 'Fato válido');
  assert.equal(funding?.hypotheses.some((item) => item.statement === 'Fato inventado'), true);
  assert.equal(funding?.tags.includes('funding'), true);
});

test('cria links raiz para ramos não relacionados explicitamente', () => {
  const result = sanitizeLearningResult({ overview: '', whyNow: '', overallConfidence: 0.5, branches: [], relationships: [], globalValidationQuestions: [] }, context);
  assert.equal(result.branches.length, 4);
  assert.equal(result.relationships.filter((link) => link.fromKey === 'root').length, 4);
});

test('renderiza markdown com governança e WikiLinks', () => {
  const result = sanitizeLearningResult({
    overview: 'Síntese', whyNow: 'Timing', overallConfidence: 0.7,
    branches: [{ key: 'funding', title: 'Funding', nodeType: 'thesis', summary: 'Resumo', facts: [], hypotheses: [], tags: [], suggestedActions: [] },
      { key: 'receivables', title: 'Recebíveis', nodeType: 'note', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [] },
      { key: 'timing', title: 'Timing', nodeType: 'signal', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [] },
      { key: 'structure-fit', title: 'Estrutura', nodeType: 'structure', summary: '', facts: [], hypotheses: [], tags: [], suggestedActions: [] }],
    relationships: [], globalValidationQuestions: [],
  }, context);
  const root = renderRootMarkdown('Empresa Teste', result);
  const branch = renderBranchMarkdown('Empresa Teste', result.branches[0]);
  assert.match(root, /\[\[Empresa Teste — Funding\]\]/);
  assert.match(root, /Score, qualification, patterns, ranking e pipeline não são alterados/);
  assert.match(branch, /Fatos observados/);
});
