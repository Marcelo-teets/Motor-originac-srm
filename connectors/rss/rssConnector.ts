import { HttpConnector } from '../http/httpConnector';

export class RssConnector extends HttpConnector {
  extractSignals(payload: unknown): string[] {
    return ['news_velocity', 'expansion_announcement', JSON.stringify(payload).slice(0, 48)];
  }
}
