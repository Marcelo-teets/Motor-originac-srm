import { Router } from 'express';
import { AgentRegistry } from '../ai/agentRegistry.js';
import { AIGateway } from '../ai/aiGateway.js';
import { ContextBuilder } from '../ai/contextBuilder.js';
import { CopilotQueryEngine } from '../ai/copilotQueryEngine.js';
import { FeedbackService } from '../ai/feedbackService.js';
import { VectorIndexService } from '../ai/vectorIndexService.js';
import type { PlatformService } from '../services/platformService.js';

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
        userId,
        sessionId,
        topK,
      } = req.body as {
        companyId?: string;
        question?: string;
        userId?: string;
        sessionId?: string;
        topK?: number;
      };

      if (!companyId || !question) {
        res.status(400).json({ error: 'companyId e question são obrigatórios' });
        return;
      }

      const response = await queryEngine.askCompanyQuestion({
        companyId,
        question,
        userId,
        sessionId,
        topK,
      });

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao processar query de IA';
      res.status(500).json({ error: message });
    }
  });

  aiRouter.post('/feedback', async (req, res) => {
    try {
      const { sessionId, userId, text } = req.body as { sessionId?: string; userId?: string; text?: string };

      if (!sessionId || !userId || !text) {
        res.status(400).json({ error: 'sessionId, userId e text são obrigatórios' });
        return;
      }

      await queryEngine.submitFeedback(sessionId, userId, text);
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gravar feedback de IA';
      res.status(500).json({ error: message });
    }
  });

  return aiRouter;
};
