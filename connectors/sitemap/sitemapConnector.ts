import { HttpConnector } from '../http/httpConnector';

export class SitemapConnector extends HttpConnector {
  override mapToSourceOutput(payload: unknown) {
    const html = String(payload);
    const title = html.match(/<title>(.*?)<\/title>/i)?.[1] ?? 'homepage';
    const headings = [...html.matchAll(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/gi)].slice(0, 4).map((match) => match[1].replace(/<[^>]+>/g, '').trim());
    return [{
      sourceName: this.sourceName,
      collectedAt: new Date().toISOString(),
      payload: { title, headings },
      health: 'healthy' as const,
    }];
  }
}
