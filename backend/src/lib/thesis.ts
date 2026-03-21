import type { CompanyPattern, CompanySeed, QualificationSnapshot, ThesisOutput } from '../types/platform.js';

export const buildThesisOutput = (company: CompanySeed, qualification: QualificationSnapshot, patterns: CompanyPattern[]): ThesisOutput => {
  const strongestPatterns = patterns.slice(0, 2).map((pattern) => pattern.patternName).join(' + ');
  return {
    summary: `${company.tradeName} combina ${company.creditProduct.toLowerCase()} com ${company.receivables.join(', ').toLowerCase()}, exibindo gap de capital compatível com ${qualification.suggested_structure_type}. Padrões mais relevantes: ${strongestPatterns || 'sem padrões adicionais'}.`,
    structureType: qualification.suggested_structure_type,
    marketMapSummary: `Comparáveis sugerem trilha de ${qualification.fit_fidc ? 'warehouse para FIDC' : 'NC/debênture privada'} com preparação de governança e monitoramento recorrente.`,
    confidenceScore: Number(Math.min(0.95, qualification.confidence_score + patterns.length * 0.01).toFixed(2)),
  };
};
