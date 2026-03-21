export interface SourceOutput {
  sourceName: string;
  collectedAt: string;
  payload: Record<string, unknown>;
  health: 'healthy' | 'degraded' | 'down';
}

export interface Connector {
  fetch(): Promise<unknown>;
  normalize(payload: unknown): SourceOutput[];
  healthCheck(): Promise<'healthy' | 'degraded' | 'down'>;
  mapToSourceOutput(payload: unknown): SourceOutput[];
  extractSignals?(payload: unknown): string[];
}
