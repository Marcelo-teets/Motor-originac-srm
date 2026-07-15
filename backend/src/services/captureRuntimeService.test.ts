import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformRepository } from '../repositories/platformRepository.js';
import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';
import { CaptureRuntimeInputError, CaptureRuntimeService } from './captureRuntimeService.js';

const company = { id: 'company-1' } as CompanySeed;
const source = (overrides: Partial<SourceCatalogEntry> = {}): SourceCatalogEntry => ({
  id: 'source-1',
  name: 'Fonte catalogada',
  sourceType: 'dataset',
  category: 'Regulatório',
  status: 'partial',
  health: 'degraded',
  metadata: { code: 'src_catalog_only' },
  ...overrides,
});

const repositoryFor = (companies: CompanySeed[], sources: SourceCatalogEntry[]) => ({
  listCompanies: async () => companies,
  listSources: async () => sources,
  listPatternCatalog: async () => [],
}) as PlatformRepository;

test('capture runtime rejects an unknown company before running connectors', async () => {
  const runtime = new CaptureRuntimeService(repositoryFor([company], [source()]));
  await assert.rejects(
    runtime.run({ companyId: 'missing-company' }),
    (error: unknown) => error instanceof CaptureRuntimeInputError && error.statusCode === 404,
  );
});

test('capture runtime rejects an unknown source before running connectors', async () => {
  const runtime = new CaptureRuntimeService(repositoryFor([company], [source()]));
  await assert.rejects(
    runtime.run({ sourceId: 'missing-source' }),
    (error: unknown) => error instanceof CaptureRuntimeInputError && error.statusCode === 404,
  );
});

test('capture runtime reports catalog-only sources as not operational', async () => {
  const runtime = new CaptureRuntimeService(repositoryFor([company], [source()]));
  await assert.rejects(
    runtime.run({ sourceId: 'src_catalog_only' }),
    (error: unknown) => error instanceof CaptureRuntimeInputError && error.statusCode === 422,
  );
});
