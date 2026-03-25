import type { LLMGateway } from './types.js';

export type CompletionOptions = {
  model?: string;
  temperature?: number;
};

export class AIGateway implements LLMGateway {
  async generateCompletion(prompt: string, _options?: CompletionOptions): Promise<string> {
    // TODO: integrar com provedor real de LLM (OpenAI/Ollama/etc.) via env
    // incluindo timeout, retry, telemetria e redação de dados sensíveis.
    const normalizedPrompt = prompt.trim();
    return `Resposta simulada para: ${normalizedPrompt}`;
  }
}
