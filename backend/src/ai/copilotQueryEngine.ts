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

const DEFAULT_TOP_K = 3;
const COPILOT_MODEL = 'motor-copilot';

const buildConversationTitle = (question: string) => {
  const compact = question.trim().replace(/\s+/g, ' ');
  return compact.length ? compact.slice(0, 120) : 'Copilot conversation';
};

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
      : '- Nenhuma referencia vetorial encontrada.';

    return [
      'Voce e o Copilot institucional do Motor Originacao SRM.',
      'Use apenas o contexto fornecido e explicite limitacoes quando houver lacunas.',
      baseContext,
      `## Referencias Vetoriais\n${refsBlock}`,
      `## Pergunta\n${question}`,
      '## Resposta',
    ].join('\n\n');
  }

  async askCompanyQuestion(input: CopilotAskInput): Promise<CopilotAskOutput> {
    const { companyId, question, userId, topK } = input;
    const conversationId = input.conversationId ?? randomUUID();
    const normalizedTopK = topK ?? DEFAULT_TOP_K;

    const baseContext = await this.contextBuilder.buildCompanyContext(companyId);
    const references = await this.vectorService.search(question, normalizedTopK);
    const referenceIds = references.map((reference) => reference.id);
    const initialPrompt = this.composePrompt(baseContext, references, question);

    let agentContext: AgentContext = {
      conversationId,
      companyId,
      userId,
      question,
      baseContext,
      retrievedReferences: references,
      prompt: initialPrompt,
    };

    agentContext = await this.agentRegistry.runPreProcessors(agentContext);

    if (this.client) {
      const createdAt = new Date().toISOString();
      await this.client.upsert('ai_conversations', [{
        id: conversationId,
        owner_name: userId ?? null,
        owner_user_id: userId ?? null,
        context_type: 'company',
        context_id: companyId,
        title: buildConversationTitle(question),
        metadata: {
          source: 'copilot_query_engine',
          topK: normalizedTopK,
          referenceIds,
        },
        updated_at: createdAt,
      }], 'id');
      await this.client.insert('ai_messages', [{
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'system',
        content: agentContext.baseContext,
        tokens_in: 0,
        tokens_out: 0,
        model: 'context-builder',
        metadata: { source: 'context_builder' },
        created_at: createdAt,
      }, {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content: question,
        tokens_in: 0,
        tokens_out: 0,
        model: 'user-input',
        metadata: { ownerName: userId ?? null },
        created_at: createdAt,
      }]);
    }

    const answer = await this.aiGateway.generateCompletion(agentContext.prompt);
    agentContext = { ...agentContext, answer };
    agentContext = await this.agentRegistry.runPostProcessors(agentContext);

    if (this.client) {
      const finishedAt = new Date().toISOString();
      const plugins = this.agentRegistry.listIds();
      const finalAnswer = agentContext.answer ?? answer;

      await this.client.insert('ai_messages', [{
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'assistant',
        content: finalAnswer,
        tokens_in: 0,
        tokens_out: 0,
        model: COPILOT_MODEL,
        metadata: { referenceIds, plugins },
        created_at: finishedAt,
      }]);

      if (plugins.length) {
        await this.client.insert('ai_agent_runs', [{
          id: randomUUID(),
          conversation_id: conversationId,
          context_type: 'company',
          context_id: companyId,
          agent_key: 'copilot_query_engine',
          plugins,
          input: {
            question,
            topK: normalizedTopK,
            referenceIds,
          },
          output: { answer: finalAnswer },
          metadata: {
            ownerName: userId ?? null,
            source: 'copilot_query_engine',
          },
          created_at: finishedAt,
        }]).catch(() => undefined);
      }
    }

    return {
      conversationId,
      answer: agentContext.answer ?? answer,
      references: agentContext.retrievedReferences,
      agentTrace: this.agentRegistry.listIds(),
    };
  }

  async submitFeedback(conversationId: string, userId: string, text: string): Promise<void> {
    await this.feedbackService.recordFeedback(conversationId, userId, text);
  }
}
