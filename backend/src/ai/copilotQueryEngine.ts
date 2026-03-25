import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { AgentRegistry } from './agentRegistry.js';
import type {
  AgentContext,
  AnalystFeedbackRecorder,
  CompanyContextProvider,
  CopilotAskInput,
  CopilotAskOutput,
  LLMGateway,
  VectorRetriever,
} from './types.js';

export class CopilotQueryEngine {
  private readonly client = getSupabaseClient();

  constructor(
    private readonly aiGateway: LLMGateway,
    private readonly contextBuilder: CompanyContextProvider,
    private readonly vectorService: VectorRetriever,
    private readonly feedbackService: AnalystFeedbackRecorder,
    private readonly agentRegistry: AgentRegistry = new AgentRegistry(),
  ) {}

  private composePrompt(baseContext: string, references: Array<{ id: string; content: string }>, question: string) {
    const refsBlock = references.length
      ? references.map((doc) => `- [${doc.id}] ${doc.content}`).join('\n')
      : '- Nenhuma referência vetorial encontrada.';

    return [
      'Você é o Copilot institucional do Motor Originação SRM.',
      'Use apenas o contexto fornecido e explicite limitações quando houver lacunas.',
      baseContext,
      `## Referências Vetoriais\n${refsBlock}`,
      `## Pergunta\n${question}`,
      '## Resposta',
    ].join('\n\n');
  }

  async askCompanyQuestion(input: CopilotAskInput): Promise<CopilotAskOutput> {
    const { companyId, question, userId, topK } = input;
    const sessionId = input.sessionId ?? randomUUID();

    const baseContext = await this.contextBuilder.buildCompanyContext(companyId);
    const references = await this.vectorService.search(question, topK ?? 3);
    const initialPrompt = this.composePrompt(baseContext, references, question);

    let agentContext: AgentContext = {
      sessionId,
      companyId,
      userId,
      question,
      baseContext,
      retrievedReferences: references,
      prompt: initialPrompt,
    };

    agentContext = await this.agentRegistry.runPreProcessors(agentContext);

    if (this.client) {
      await this.client.upsert('ai_sessions', [{ id: sessionId, company_id: companyId, user_id: userId ?? null }], 'id');
      await this.client.insert('ai_messages', [{
        id: randomUUID(),
        session_id: sessionId,
        role: 'system',
        content: agentContext.baseContext,
      }, {
        id: randomUUID(),
        session_id: sessionId,
        role: 'user',
        content: question,
      }]);
    }

    const answer = await this.aiGateway.generateCompletion(agentContext.prompt);
    agentContext = { ...agentContext, answer };
    agentContext = await this.agentRegistry.runPostProcessors(agentContext);

    if (this.client) {
      await this.client.insert('ai_messages', [{
        id: randomUUID(),
        session_id: sessionId,
        role: 'assistant',
        content: agentContext.answer ?? answer,
      }]);

      if (this.agentRegistry.listIds().length) {
        await this.client.insert('ai_agent_runs', [{
          id: randomUUID(),
          session_id: sessionId,
          company_id: companyId,
          plugins: this.agentRegistry.listIds(),
          created_at: new Date().toISOString(),
        }]).catch(() => undefined);
      }
    }

    return {
      sessionId,
      answer: agentContext.answer ?? answer,
      references: agentContext.retrievedReferences,
      agentTrace: this.agentRegistry.listIds(),
    };
  }

  async submitFeedback(sessionId: string, userId: string, text: string): Promise<void> {
    await this.feedbackService.recordFeedback(sessionId, userId, text);
  }
}
