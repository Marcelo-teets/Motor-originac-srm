import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgenteTomeError,
  decodeAgenteTomeXmlBase64,
  summarizeAgenteTomePayload,
} from './agenteTome.js';

test('Agentetome XML decoder accepts valid base64 XML and returns only metadata', () => {
  const xml = Buffer.from('<?xml version="1.0"?><informe><pl>100</pl></informe>', 'utf8');
  const result = decodeAgenteTomeXmlBase64(xml.toString('base64'));

  assert.equal(result.bytes, xml.length);
  assert.equal(result.normalizedBase64, xml.toString('base64'));
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal('xml' in result, false);
});

test('Agentetome XML decoder rejects base64 that is not XML', () => {
  assert.throws(
    () => decodeAgenteTomeXmlBase64(Buffer.from('not xml', 'utf8').toString('base64')),
    (error: unknown) => error instanceof AgenteTomeError && error.statusCode === 422,
  );
});

test('Agentetome export audit summary never persists the temporary signed link', () => {
  const summary = summarizeAgenteTomePayload('admin_export', {
    arquivo: 'tome-export.zip',
    formato: 'zip_de_csvs',
    tamanho_bytes: 1234,
    link_download: 'https://www.agentetome.com/api/export/download?t=secret-token',
    expira_em: '2026-07-23T18:00:00.000Z',
    manifest: {
      schema_versao: 1,
      filtro: { admin: 'oliveira trust' },
      arquivos: { fundos: { linhas: 10 } },
    },
  });

  assert.equal(JSON.stringify(summary).includes('secret-token'), false);
  assert.equal(summary.arquivo, 'tome-export.zip');
  assert.equal((summary.manifest as Record<string, unknown>).schema_versao, 1);
});

test('Agentetome XML validation audit stores counters but not the report body', () => {
  const summary = summarizeAgenteTomePayload('validate_fidc_xml', {
    ok: false,
    leiaute: '6.6',
    contadores: { qt_bloqueante: 1, qt_conferir: 2 },
    provavel_recusa: [{ detalhe: 'sensitive report detail' }],
  });

  assert.deepEqual(summary, {
    ok: false,
    leiaute: '6.6',
    contadores: { qt_bloqueante: 1, qt_conferir: 2 },
  });
});
