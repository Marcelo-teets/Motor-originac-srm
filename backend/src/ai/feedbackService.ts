import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import type { AnalystFeedbackRecorder } from './types.js';

const MAX_FEEDBACK_LENGTH = 4000;

export class FeedbackService implements AnalystFeedbackRecorder {
  private readonly client = getSupabaseClient();

  async recordFeedback(conversationId: string, userId: string, text: string): Promise<void> {
    const content = text.trim();
    if (!content) throw new Error('Feedback vazio nao e permitido.');
    if (content.length > MAX_FEEDBACK_LENGTH) throw new Error('Feedback excede limite de 4000 caracteres.');

    if (!this.client) {
      // TODO: trocar por armazenamento estruturado em ambiente de teste quando necessario.
      console.info(`Feedback gravado (mock) para conversa ${conversationId} por ${userId}: ${content}`);
      return;
    }

    const createdAt = new Date().toISOString();
    await this.client.upsert('ai_conversations', [{
      id: conversationId,
      owner_name: userId ?? null,
      context_type: 'feedback',
      context_id: null,
      title: 'Feedback do analista',
      metadata: { source: 'feedback_service' },
      updated_at: createdAt,
    }], 'id');
    await this.client.insert('ai_messages', [{
      id: randomUUID(),
      conversation_id: conversationId,
      role: 'analyst',
      content,
      tokens_in: 0,
      tokens_out: 0,
      model: 'analyst-feedback',
      metadata: { ownerName: userId },
      created_at: createdAt,
    }]);
  }
}
