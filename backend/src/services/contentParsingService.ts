export type ParsedContent = {
  title?: string;
  text: string;
  publishedAt?: string;
  metadata: Record<string, unknown>;
};

const stripHtml = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const firstMatch = (input: string, regex: RegExp) => input.match(regex)?.[1]?.trim();

export class ContentParsingService {
  parseJsonPayload(payload: Record<string, unknown>): ParsedContent {
    const title = String(payload.title ?? payload.nome ?? payload.razao_social ?? payload.name ?? '').trim() || undefined;
    const publishedAt = String(payload.published_at ?? payload.date ?? payload.updated_at ?? '').trim() || undefined;
    const text = JSON.stringify(payload);
    return {
      title,
      text,
      publishedAt,
      metadata: { parser: 'json' },
    };
  }

  parseRssXml(xml: string): ParsedContent[] {
    const items = xml.split(/<item>|<entry>/i).slice(1);
    return items.map((chunk) => {
      const title = firstMatch(chunk, /<title>(<!\[CDATA\[)?([\s\S]*?)(\]\]>)?<\/title>/i) ?? undefined;
      const description = firstMatch(chunk, /<description>(<!\[CDATA\[)?([\s\S]*?)(\]\]>)?<\/description>/i)
        ?? firstMatch(chunk, /<summary>(<!\[CDATA\[)?([\s\S]*?)(\]\]>)?<\/summary>/i)
        ?? '';
      const link = firstMatch(chunk, /<link>(<!\[CDATA\[)?([\s\S]*?)(\]\]>)?<\/link>/i)
        ?? firstMatch(chunk, /href="([^"]+)"/i)
        ?? undefined;
      const publishedAt = firstMatch(chunk, /<pubDate>([\s\S]*?)<\/pubDate>/i)
        ?? firstMatch(chunk, /<updated>([\s\S]*?)<\/updated>/i)
        ?? undefined;

      return {
        title,
        text: `${title ?? ''} ${stripHtml(description)}`.trim(),
        publishedAt,
        metadata: { parser: 'rss', link },
      };
    }).filter((item) => item.text);
  }

  parseHtmlDocument(html: string): ParsedContent {
    const title = firstMatch(html, /<title>([\s\S]*?)<\/title>/i)
      ?? firstMatch(html, /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
      ?? undefined;
    const publishedAt = firstMatch(html, /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)
      ?? firstMatch(html, /<time[^>]+datetime="([^"]+)"/i)
      ?? undefined;

    return {
      title,
      text: stripHtml(html),
      publishedAt,
      metadata: { parser: 'html' },
    };
  }

  parseByStrategy(strategy: 'json' | 'rss' | 'html' | 'mixed', payload: string | Record<string, unknown>) {
    if (strategy === 'json' && typeof payload !== 'string') return [this.parseJsonPayload(payload)];
    if (strategy === 'rss' && typeof payload === 'string') return this.parseRssXml(payload);
    if (strategy === 'html' && typeof payload === 'string') return [this.parseHtmlDocument(payload)];
    if (strategy === 'mixed') {
      if (typeof payload === 'string' && payload.includes('<rss')) return this.parseRssXml(payload);
      if (typeof payload === 'string' && payload.includes('<html')) return [this.parseHtmlDocument(payload)];
      if (typeof payload !== 'string') return [this.parseJsonPayload(payload)];
    }
    return [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload), metadata: { parser: 'fallback' } }];
  }
}
