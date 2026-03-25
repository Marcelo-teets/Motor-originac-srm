import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import type { AnalystFeedbackRecorder } from './types.js';

const MAX_FEEDBACK_LENGTH = 4000;

export class FeedbackService implements AnalystFeedbackRecorder {
  private readonly client = getSupabaseClient();

  async recordFeedback(sessionId: string, userId: string, text: string): Promise<void> {
    const content = text.trim();
    if (!content) throw new Error('Feedback vazio não é permitido.');
    if (content.length > MAX_FEEDBACK_LENGTH) throw new Error('Feedback excede limite de 4000 caracteres.');

    if (!this.client) {
      // TODO: trocar por armazenamento estruturado em ambiente de teste quando necessário.
      console.info(`Feedback gravado (mock) para sessão ${sessionId} por ${userId}: ${content}`);
      return;
    }

    await this.client.upsert('ai_sessions', [{ id: sessionId, user_id: userId }], 'id');
    await this.client.insert('ai_messages', [{
      id: randomUUID(),
      session_id: sessionId,
      role: 'analyst',
      content,
    }]);
  }
}
