import type { Connector, SourceOutput } from '../base/connector';

export class HttpConnector implements Connector {
  constructor(private readonly sourceName: string) {}

  async fetch(): Promise<unknown> {
    return { status: 'mock-http-fetch', sourceName: this.sourceName };
  }

  normalize(payload: unknown): SourceOutput[] {
    return this.mapToSourceOutput(payload);
  }

  async healthCheck(): Promise<'healthy' | 'degraded' | 'down'> {
    return 'healthy';
  }

  mapToSourceOutput(payload: unknown): SourceOutput[] {
    return [{ sourceName: this.sourceName, collectedAt: new Date().toISOString(), payload: { payload }, health: 'healthy' }];
  }
}
