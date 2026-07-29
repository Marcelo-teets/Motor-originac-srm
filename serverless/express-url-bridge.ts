import type { IncomingMessage } from 'node:http';

type ExpressParsedUrlCache = {
  protocol: null;
  slashes: null;
  auth: null;
  host: null;
  port: null;
  hostname: null;
  hash: string | null;
  search: string | null;
  query: string | null;
  pathname: string;
  path: string;
  href: string;
  _raw: string;
};

type ExpressIncomingMessage = IncomingMessage & {
  url?: string;
  originalUrl?: string;
  _parsedUrl?: ExpressParsedUrlCache;
  _parsedOriginalUrl?: ExpressParsedUrlCache;
};

const normalizeRawUrl = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : '/';

const requestHost = (req: IncomingMessage) => {
  const value = req.headers.host;
  return Array.isArray(value) ? value[0] ?? 'localhost' : value ?? 'localhost';
};

export const toExpressParsedUrl = (rawValue: unknown, req: IncomingMessage): ExpressParsedUrlCache => {
  const rawUrl = normalizeRawUrl(rawValue);
  const parsed = new URL(rawUrl, `https://${requestHost(req)}`);
  const search = parsed.search || null;

  return {
    protocol: null,
    slashes: null,
    auth: null,
    host: null,
    port: null,
    hostname: null,
    hash: parsed.hash || null,
    search,
    query: search ? search.slice(1) : null,
    pathname: parsed.pathname,
    path: `${parsed.pathname}${parsed.search}`,
    href: rawUrl,
    _raw: rawUrl,
  };
};

/**
 * Express 4 usa `parseurl`, que ainda chama `url.parse()` e gera DEP0169 no
 * Node 24. O bridge mantém os caches privados esperados pelo Express sempre
 * sincronizados com `req.url`, inclusive quando routers internos reescrevem a
 * URL. Assim preservamos o comportamento legado sem silenciar warnings globais.
 */
export const installExpressUrlBridge = (req: IncomingMessage, initialUrl: string) => {
  const expressRequest = req as ExpressIncomingMessage;
  let currentUrl = normalizeRawUrl(initialUrl);

  const syncCurrentUrl = (nextValue: unknown) => {
    currentUrl = normalizeRawUrl(nextValue);
    expressRequest._parsedUrl = toExpressParsedUrl(currentUrl, expressRequest);
  };

  syncCurrentUrl(currentUrl);
  expressRequest.originalUrl = currentUrl;
  expressRequest._parsedOriginalUrl = toExpressParsedUrl(currentUrl, expressRequest);

  try {
    Object.defineProperty(expressRequest, 'url', {
      configurable: true,
      enumerable: true,
      get: () => currentUrl,
      set: syncCurrentUrl,
    });
  } catch {
    expressRequest.url = currentUrl;
    expressRequest._parsedUrl = toExpressParsedUrl(currentUrl, expressRequest);
  }

  return expressRequest;
};
