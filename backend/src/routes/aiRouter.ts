import { Router } from 'express';
import { AgentRegistry } from '../ai/agentRegistry.js';
import { AIGateway } from '../ai/aiGateway.js';
import { ContextBuilder } from '../ai/contextBuilder.js';
import { CopilotQueryEngine } from '../ai/copilotQueryEngine.js';
import { FeedbackService } from '../ai/feedbackService.js';
import { VectorIndexService } from '../ai/vectorIndexService.js';
import type { PlatformService } from '../services/platformService.js';

const MAX_TOP_K = 20;
const clampTopK = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(MAX_TOP_K, Math.trunc(parsed)) : undefined;
};

export const createAiRouter = (platformService: PlatformService) => {
  const aiRouter = Router();

  // Registro preparado para plugins de agentes (pre/post-process).
  // TODO: registrar plugins reais via DI/config sem alterar o engine.
  const agentRegistry = new AgentRegistry();

  const queryEngine = new CopilotQueryEngine(
    new AIGateway(),
    new ContextBuilder(platformService),
    new VectorIndexService(),
    new FeedbackService(),
    agentRegistry,
  );

  aiRouter.post('/query', async (req, res) => {
    try {
      const {
        companyId,
        question,
        conversationId,
        topK,
      } = (req.body ?? {}) as {
        companyId?: string;
        question?: string;
        conversationId?: string;
        topK?: number;
      };
      // Identity comes from the verified token, never from the request body.
      const userId = req.authUser?.id;

      if (!companyId || !question) {
        res.status(400).json({ error: 'companyId e question sao obrigatorios' });
        return;
      }

      const response = await queryEngine.askCompanyQuestion({
        companyId,
        question,
        userId,
        conversationId,
        topK: clampTopK(topK),
      });

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao processar query de IA';
      res.status(500).json({ error: message });
    }
  });

  aiRouter.post('/feedback', async (req, res) => {
    try {
      const { conversationId, text } = (req.body ?? {}) as { conversationId?: string; text?: string };
      const userId = req.authUser?.id;

      if (!conversationId || !userId || !text) {
        res.status(400).json({ error: 'conversationId, userId e text sao obrigatorios' });
        return;
      }

      await queryEngine.submitFeedback(conversationId, userId, text);
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gravar feedback de IA';
      res.status(500).json({ error: message });
    }
  });

  return aiRouter;
};
