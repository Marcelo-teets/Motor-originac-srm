import { createPlatformRepository } from '../../repositories/platformRepository.js';
import { env } from '../../lib/env.js';
import { DataEnginesPersistence } from '../data-engines/persistence.js';

export class PaperclipBrainService {
  private readonly repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  private readonly persistence = new DataEnginesPersistence();

  async snapshot() {
    const [companies, sources, monitoringOutputs, signals, enrichments, learningEvents] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listSources(),
      this.repository.listMonitoringOutputs(),
      this.repository.listCompanySignals(),
      this.repository.listEnrichments(),
      this.persistence.listLearningEvents(),
    ]);

    const lowConfidenceOutputs = monitoringOutputs.filter((item) => item.confidenceScore < 0.65).length;
    const weakCoverageCompanies = companies.filter((company) => monitoringOutputs.every((output) => output.companyId !== company.id)).length;
    const criticalLearning = learningEvents.filter((event) => event.severity === 'critical').length;

    return {
      entity: 'Origination Intelligence Platform',
      operatingMode: env.useSupabase ? 'real' : 'partial',
      companyView: {
        monitoredUniverse: companies.length,
        activeSources: sources.length,
        outputs: monitoringOutputs.length,
        signals: signals.length,
        enrichments: enrichments.length,
      },
      health: {
        score: Math.max(0, 100 - lowConfidenceOutputs * 2 - weakCoverageCompanies * 5 - criticalLearning * 10),
        lowConfidenceOutputs,
        weakCoverageCompanies,
        criticalLearning,
      },
      managementAgenda: [
        lowConfidenceOutputs > 0 ? 'Reduzir outputs de baixa confiança no capture engine.' : 'Manter estabilidade da camada de captura.',
        weakCoverageCompanies > 0 ? 'Aumentar cobertura de empresas sem monitoring outputs.' : 'Cobertura básica do universo monitorado adequada.',
        criticalLearning > 0 ? 'Priorizar eventos críticos de aprendizado e melhoria.' : 'Sem eventos críticos de aprendizado no momento.',
      ],
    };
  }
}
