import { HttpConnector } from '../http/httpConnector';

export class ScraperConnector extends HttpConnector {
  override async healthCheck(): Promise<'healthy' | 'degraded' | 'down'> {
    try {
      await this.fetch();
      return 'healthy';
    } catch {
      return 'down';
    }
  }
}
