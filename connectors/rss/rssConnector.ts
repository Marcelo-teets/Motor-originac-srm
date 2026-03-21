import { HttpConnector } from '../http/httpConnector';

export class RssConnector extends HttpConnector {
  override mapToSourceOutput(payload: unknown) {
    const xml = String(payload);
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g)].slice(0, 5).map((match) => ({
      title: match[1].replace(/<[^>]+>/g, '').trim(),
      link: match[2].replace(/<[^>]+>/g, '').trim(),
    }));

    return items.map((item) => ({
      sourceName: this.sourceName,
      collectedAt: new Date().toISOString(),
      payload: item,
      health: 'healthy' as const,
    }));
  }

  extractSignals(payload: unknown): string[] {
    return this.mapToSourceOutput(payload).map((item) => String(item.payload.title ?? item.payload.link ?? 'rss_signal'));
  }
}
