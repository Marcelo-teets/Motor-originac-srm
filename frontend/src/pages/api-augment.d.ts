declare module '../lib/api' {
  export const api: {
    getMvpQuickActions: (session: unknown) => Promise<{ source: 'real' | 'partial' | 'mock'; note: string; data: Array<{ id: string; title: string; owner: string; priority: 'high' | 'medium' | 'low' }> }>;
  };
}
