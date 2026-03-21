import type { Connector, SourceOutput } from '../base/connector';

export class HttpConnector implements Connector {
  constructor(
    protected readonly sourceName: string,
    protected readonly endpoint: string,
    protected readonly headers: Record<string, string> = { accept: 'application/json, text/plain, */*' },
  ) {}

  async fetch(): Promise<unknown> {
    const response = await fetch(this.endpoint, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`${this.sourceName} returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? response.json() : response.text();
  }

  normalize(payload: unknown): SourceOutput[] {
    return this.mapToSourceOutput(payload);
  }

  async healthCheck(): Promise<'healthy' | 'degraded' | 'down'> {
    try {
      await this.fetch();
      return 'healthy';
    } catch {
      return 'degraded';
    }
  }

  mapToSourceOutput(payload: unknown): SourceOutput[] {
    return [{ sourceName: this.sourceName, collectedAt: new Date().toISOString(), payload: { payload }, health: 'healthy' }];
  }
}
