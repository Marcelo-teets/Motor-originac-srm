import type { PlatformService } from '../services/platformService.js';
import type { CompanyContextProvider } from './types.js';

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return '[dados indisponíveis para serialização]';
  }
};

const block = (title: string, value: unknown, fallback: string) => {
  if (value === null || value === undefined) return `## ${title}\n${fallback}`;
  if (typeof value === 'string') return `## ${title}\n${value}`;
  return `## ${title}\n${safeStringify(value)}`;
};

export class ContextBuilder implements CompanyContextProvider {
  constructor(private readonly platformService: PlatformService) {}

  async buildCompanyContext(companyId: string): Promise<string> {
    try {
      const detail = await this.platformService.getCompanyDetail(companyId);
      if (!detail) {
        return [
          '# Contexto Institucional',
          `Empresa ${companyId} não encontrada.`,
          'Use apenas informações públicas e peça confirmação antes de concluir qualquer tese.',
        ].join('\n\n');
      }

      const signals = detail.signals.slice(0, 5);
      const patterns = detail.patterns.slice(0, 5);

      return [
        '# Contexto Institucional',
        `Empresa: ${detail.company.name}`,
        block('Qualification', detail.qualification, 'Snapshot de qualification indisponível.'),
        block('Scores', detail.scores, 'Scores indisponíveis.'),
        block('Patterns Relevantes', patterns, 'Sem padrões detectados.'),
        block('Sinais Recentes', signals, 'Sem sinais recentes.'),
        `## Tese\n${detail.thesis?.summary ?? 'Sem tese registrada.'}`,
        '## Diretriz de Resposta\nExplique as evidências e sinalize explicitamente incertezas.',
      ].join('\n\n');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      return [
        '# Contexto Institucional',
        `Falha ao montar contexto para ${companyId}.`,
        `Motivo técnico: ${reason}.`,
      ].join('\n\n');
    }
  }
}
