import { chromium } from 'playwright';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const OUTPUT_DIR = process.env.ANBIMA_PROBE_OUTPUT_DIR || 'artifacts/anbima-probe';
const BASE_URL = 'https://data.anbima.com.br';
const TARGETS = [
  { code: 'home', url: `${BASE_URL}/` },
  { code: 'datasets_offers', url: `${BASE_URL}/datasets/ofertas-publicas-series?pre-filtro=resumo`, clickDownload: true },
  { code: 'datasets_debenture_pricing', url: `${BASE_URL}/datasets/data-debentures-precificacao-anbima`, clickDownload: true },
  { code: 'debenture_search', url: `${BASE_URL}/busca/debentures` },
  { code: 'debenture_characteristics', url: `${BASE_URL}/debentures/STCL13/caracteristicas` },
  { code: 'debenture_prices', url: `${BASE_URL}/debentures/STCL13/precos?page=0&size=20` },
  { code: 'fidc_about', url: `${BASE_URL}/fundos/S0001393049/sobre-o-fundo` },
  { code: 'fidc_periodic', url: `${BASE_URL}/fundos/S0001393049/dados-periodicos` },
];

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 500;
const SENSITIVE_KEY = /(token|authorization|cookie|secret|password|email|cpf|phone|telefone)/i;

const normalizeUrl = (raw) => {
  try {
    const url = new URL(raw);
    const names = [...url.searchParams.keys()].sort();
    url.search = names.length ? `?${names.map((name) => `${encodeURIComponent(name)}={value}`).join('&')}` : '';
    return url.toString();
  } catch {
    return raw;
  }
};

const isRelevantResponse = (response) => {
  const request = response.request();
  const type = request.resourceType();
  const url = response.url();
  if (!['document', 'xhr', 'fetch'].includes(type)) return false;
  if (!/^https:\/\//i.test(url)) return false;
  return /anbima\.com\.br|amazonaws\.com|cloudfront\.net|azureedge\.net/i.test(url);
};

const primitiveType = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const jsonShape = (value, depth = 0) => {
  if (depth >= 3) return primitiveType(value);
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      item: value.length ? jsonShape(value[0], depth + 1) : null,
    };
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 60)
      .map(([key, child]) => [key, jsonShape(child, depth + 1)]);
    return { type: 'object', keys: Object.fromEntries(entries) };
  }
  return primitiveType(value);
};

const safeScalar = (value, url) => {
  const eligibleEndpoint = /verificar-dataset-restrito|\/info(?:\?|$)/i.test(url);
  if (!eligibleEndpoint) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string' && value.length <= 160) return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value)
      .filter(([key, child]) => !SENSITIVE_KEY.test(key) && ['string', 'number', 'boolean'].includes(typeof child))
      .slice(0, 20);
    return Object.fromEntries(entries);
  }
  return null;
};

const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const interactiveLabels = async (page) => page.locator('button, a, input, select, [role="dialog"]').evaluateAll((elements) => elements
  .slice(0, 220)
  .map((element) => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role'),
    text: String(element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    href: element instanceof HTMLAnchorElement ? element.href : null,
    type: element instanceof HTMLInputElement ? element.type : null,
  }))
  .filter((item) => item.text || item.href));

await mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 OriginationIntelligencePlatform/1.0',
  viewport: { width: 1440, height: 1000 },
});

const result = {
  status: 'real',
  source: 'ANBIMA Data public website',
  startedAt: new Date().toISOString(),
  targets: [],
  uniqueRelevantEndpoints: [],
};
const endpointIndex = new Map();

for (const target of TARGETS) {
  const page = await context.newPage();
  const targetResult = {
    code: target.code,
    requestedUrl: target.url,
    finalUrl: null,
    title: null,
    status: null,
    bodyText: null,
    interactiveLabels: [],
    responses: [],
    downloads: [],
    postDownloadClick: null,
    consoleErrors: [],
    pageErrors: [],
    screenshot: null,
    error: null,
  };

  page.on('console', (message) => {
    if (message.type() === 'error') targetResult.consoleErrors.push(cleanText(message.text()));
  });
  page.on('pageerror', (error) => targetResult.pageErrors.push(cleanText(error.message)));
  page.on('response', async (response) => {
    if (!isRelevantResponse(response)) return;
    const request = response.request();
    const headers = await response.allHeaders().catch(() => ({}));
    const contentType = headers['content-type'] || '';
    const contentLength = Number(headers['content-length'] || 0);
    const entry = {
      method: request.method(),
      resourceType: request.resourceType(),
      url: normalizeUrl(response.url()),
      status: response.status(),
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      contentDisposition: headers['content-disposition'] || null,
      jsonShape: null,
      safeScalar: null,
      bodyInspection: null,
    };

    if (/application\/json|text\/json|\+json/i.test(contentType) && (!contentLength || contentLength <= MAX_JSON_BYTES)) {
      try {
        const body = await response.body();
        if (body.length <= MAX_JSON_BYTES) {
          const parsed = JSON.parse(body.toString('utf8'));
          entry.jsonShape = jsonShape(parsed);
          entry.safeScalar = safeScalar(parsed, response.url());
          entry.bodyInspection = { bytes: body.length, parsed: true };
        }
      } catch (error) {
        entry.bodyInspection = { parsed: false, error: cleanText(error.message) };
      }
    }

    targetResult.responses.push(entry);
    const endpointKey = `${entry.method} ${entry.url}`;
    if (!endpointIndex.has(endpointKey)) endpointIndex.set(endpointKey, entry);
  });

  try {
    const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    targetResult.status = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(4_000);

    const cookieButton = page.getByRole('button', { name: /^Prosseguir$/i });
    if (await cookieButton.count().catch(() => 0)) {
      await cookieButton.first().click({ timeout: 5_000 }).catch(() => null);
      await page.waitForTimeout(700);
    }

    targetResult.finalUrl = page.url();
    targetResult.title = cleanText(await page.title());
    targetResult.bodyText = cleanText(await page.locator('body').innerText().catch(() => ''));
    targetResult.interactiveLabels = await interactiveLabels(page);

    const screenshotPath = join(OUTPUT_DIR, `${target.code}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    targetResult.screenshot = screenshotPath;

    if (target.clickDownload) {
      const candidates = page.getByRole('button', { name: /^Download$/i });
      const count = await candidates.count().catch(() => 0);
      if (count > 0) {
        const button = candidates.first();
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await button.click({ timeout: 10_000 }).catch((error) => {
          targetResult.downloads.push({ triggered: false, error: cleanText(error.message) });
        });
        await page.waitForTimeout(1_500);
        const dialogScreenshot = join(OUTPUT_DIR, `${target.code}-download-dialog.png`);
        await page.screenshot({ path: dialogScreenshot, fullPage: true });
        targetResult.postDownloadClick = {
          bodyText: cleanText(await page.locator('body').innerText().catch(() => '')),
          interactiveLabels: await interactiveLabels(page),
          screenshot: dialogScreenshot,
        };
        const download = await downloadPromise;
        if (download) {
          const fileName = download.suggestedFilename();
          const filePath = join(OUTPUT_DIR, `${target.code}-${basename(fileName)}`);
          await download.saveAs(filePath);
          const metadata = await stat(filePath);
          targetResult.downloads.push({
            triggered: true,
            suggestedFilename: fileName,
            sourceUrl: normalizeUrl(download.url()),
            bytes: metadata.size,
            failure: await download.failure(),
          });
          await rm(filePath, { force: true });
        } else if (!targetResult.downloads.length) {
          targetResult.downloads.push({ triggered: false, reason: 'download_event_not_observed_after_public_button_click' });
        }
      } else {
        targetResult.downloads.push({ triggered: false, reason: 'download_control_not_found' });
      }
    }
  } catch (error) {
    targetResult.error = cleanText(error.stack || error.message);
  } finally {
    targetResult.responses = targetResult.responses.slice(0, 300);
    targetResult.consoleErrors = [...new Set(targetResult.consoleErrors)].slice(0, 30);
    targetResult.pageErrors = [...new Set(targetResult.pageErrors)].slice(0, 30);
    result.targets.push(targetResult);
    await page.close();
  }
}

result.finishedAt = new Date().toISOString();
result.uniqueRelevantEndpoints = [...endpointIndex.values()].sort((a, b) => a.url.localeCompare(b.url));
result.summary = {
  targetsRequested: TARGETS.length,
  targetsLoaded: result.targets.filter((target) => !target.error && target.status && target.status < 400).length,
  relevantEndpointCount: result.uniqueRelevantEndpoints.length,
  jsonEndpointCount: result.uniqueRelevantEndpoints.filter((endpoint) => endpoint.jsonShape).length,
  restrictionSignals: result.uniqueRelevantEndpoints.filter((endpoint) => endpoint.safeScalar !== null).length,
  downloadsObserved: result.targets.reduce((total, target) => total + target.downloads.filter((download) => download.triggered).length, 0),
  downloadDialogsObserved: result.targets.filter((target) => target.postDownloadClick).length,
  targetErrors: result.targets.filter((target) => target.error).length,
};

await browser.close();
await writeFile(join(OUTPUT_DIR, 'anbima-public-probe.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));

if (result.summary.targetsLoaded < 5 || result.summary.relevantEndpointCount === 0) process.exitCode = 1;
