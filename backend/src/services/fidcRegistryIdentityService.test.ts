import assert from 'node:assert/strict';
import test from 'node:test';
import { FIDCRegistryIdentityService, normalizeFIDCRegistryIdentity } from './fidcRegistryIdentityService.js';

const CNPJ = '19540550000121';
const endpoint = `https://brasilapi.com.br/api/cnpj/v1/${CNPJ}`;
const valid = (cnpj = CNPJ) => ({
  status: 'real' as const,
  endpoint: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  data: {
    cnpj, razao_social: 'EXEMPLO SERVICOS DIGITAIS LTDA',
    nome_fantasia: 'EXEMPLO', descricao_situacao_cadastral: 'ATIVA',
    municipio: 'SAO PAULO', uf: 'SP',
  },
});

test('only exact valid CNPJ and legal name can be stored', () => {
  const now = new Date('2026-10-13T13:00:00.000Z');
  assert.equal(normalizeFIDCRegistryIdentity(CNPJ, valid('11111111000111'), now), null);
  assert.equal(normalizeFIDCRegistryIdentity(CNPJ, { ...valid(), data: { cnpj: CNPJ, razao_social: '' } }, now), null);
  assert.equal(normalizeFIDCRegistryIdentity(CNPJ, { status: 'partial' as const, endpoint, data: { fallback: true, cnpj: CNPJ, error: 'temporary_unavailable' } }, now), null);
  const r = normalizeFIDCRegistryIdentity(CNPJ, valid(), now);
  assert.equal(r?.cnpj, CNPJ);
  assert.equal(r?.legal_name, 'EXEMPLO SERVICOS DIGITAIS LTDA');
  assert.equal(r?.registry_provider, 'brasilapi_receita_proxy');
  assert.equal(r?.registry_url, endpoint);
});

test('bounded service stores one registry identity, not a company or candidate', async () => {
  const tableWrites: Array<{ table: string; rows: unknown[]; conflict?: string }> = [];
  const fetched: string[] = [];
  const client = {
    select: async () => [{
      cnpj: CNPJ, evidence_links: 2,
      identity_next_step: 'needs_registry_identity',
      registry_legal_name: null, registry_checked_at: null,
    }],
    upsert: async (table: string, rows: unknown[], conflict?: string) => {
      tableWrites.push({ table, rows, conflict });
      return rows;
    },
  };
  const s = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async (cnpj) => { fetched.push(cnpj); return valid(); },
    now: () => new Date('2026-10-13T13:00:00.000Z'),
    sleep: async () => undefined,
  });
  const r = await s.run({ limit: 1 });
  assert.deepEqual(fetched, [CNPJ]);
  assert.equal(r.stored, 1);
  assert.equal(r.reviewRequired, true);
  assert.deepEqual(tableWrites.map(x => x.table), ['fidc_assignor_registry_identities']);
  assert.equal(tableWrites[0].conflict, 'cnpj');
  assert.equal((tableWrites[0].rows[0] as { cnpj: string }).cnpj, CNPJ);
});

test('fresh registry identities are skipped and unavailable results do not persist', async () => {
  let writes = 0;
  let queries = 0;
  const client = {
    select: async () => [{
      cnpj: CNPJ, identity_next_step: 'needs_registry_identity',
      registry_legal_name: 'EXEMPLO SERVICOS DIGITAIS LTDA',
      registry_checked_at: '2026-10-12T13:00:00.000Z',
    }],
    upsert: async () => { writes += 1; return []; },
  };
  const service = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async () => { queries += 1; return valid(); },
    now: () => new Date('2026-10-13T13:00:00.000Z'),
  });
  const result = await service.run();
  assert.equal(result.status, 'no_targets');
  assert.equal(result.skippedCached, 1);
  assert.equal(writes, 0);
  assert.equal(queries, 0);
  await assert.rejects(() => service.run({ limit: 21 }), /integer from 1 to 20/);
});

test('mismatched registry response cannot produce a false identity', async () => {
  let writes = 0;
  const client = {
    select: async () => [{
      cnpj: CNPJ, identity_next_step: 'needs_registry_identity',
      registry_legal_name: null, registry_checked_at: null,
    }],
    upsert: async () => { writes += 1; return []; },
  };
  const service = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async () => valid('11111111000111'),
    now: () => new Date('2026-10-13T13:00:00.000Z'),
  });
  const result = await service.run({ limit: 1 });
  assert.equal(result.invalidRegistry, 1);
  assert.equal(result.stored, 0);
  assert.equal(writes, 0);
});

test('Minha Receita fallback is used only after BrasilAPI denies and keeps actual source URL', async () => {
  const stored: Array<Record<string, unknown>> = [];
  let fallbackCalls = 0;
  const client = {
    select: async () => [{
      cnpj: CNPJ, identity_next_step: 'needs_registry_identity',
      registry_legal_name: null, registry_checked_at: null,
    }],
    upsert: async (_table: string, rows: Record<string, unknown>[]) => {
      stored.push(...rows);
      return rows;
    },
  };
  const service = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async (cnpj) => ({
      status: 'partial' as const, endpoint: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      data: { fallback: true, cnpj, error: 'BrasilAPI status 403' },
    }),
    fetchFallback: async (cnpj) => {
      fallbackCalls += 1;
      return {
        status: 'real' as const,
        endpoint: `https://minhareceita.org/${cnpj}`,
        data: { cnpj, razao_social: 'EMPRESA TESTE CADASTRAL LTDA', nome_fantasia: 'TESTE' },
      };
    },
    now: () => new Date('2026-10-13T15:00:00.000Z'),
  });
  const result = await service.run({ limit: 1 });
  assert.equal(fallbackCalls, 1);
  assert.equal(result.stored, 1);
  assert.equal(stored[0].registry_provider, 'minhareceita_receita_proxy');
  assert.equal(stored[0].registry_url, `https://minhareceita.org/${CNPJ}`);
  assert.equal(result.reviewRequired, true);
});

test('offset skips an unavailable CNPJ batch without repeating it', async () => {
  const ids = ['00288948000194','01789121000127','19540550000121'];
  const fetched: string[] = [];
  const client = {
    select: async () => ids.map(cnpj => ({
      cnpj, identity_next_step: 'needs_registry_identity',
      registry_legal_name: null, registry_checked_at: null,
    })),
    upsert: async () => [],
  };
  const service = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async (cnpj) => { fetched.push(cnpj); return valid(cnpj); },
    now: () => new Date('2026-10-13T15:00:00Z'),
  });
  const result = await service.run({ limit: 1, offset: 2 });
  assert.deepEqual(fetched, [ids[2]]);
  assert.equal(result.offset, 2);
  assert.equal(result.stored, 1);
  await assert.rejects(() => service.run({ offset: 201 }), /offset must be an integer/);
});

test('unavailable HTTP response is classified without keeping raw CNPJ payload', async () => {
  const client = {
    select: async () => [{
      cnpj: CNPJ, identity_next_step: 'needs_registry_identity',
      registry_legal_name: null, registry_checked_at: null,
    }],
    upsert: async () => {throw Error('not called');},
  };
  const service = new FIDCRegistryIdentityService({
    client: client as never,
    fetchRegistry: async cnpj => ({
      status: 'partial' as const, endpoint: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      data: { fallback: true, cnpj, error: 'HTTP 403' },
    }),
    fetchFallback: async cnpj => ({
      status: 'partial' as const, endpoint: `https://minhareceita.org/${cnpj}`,
      data: { fallback: true, cnpj, error: 'HTTP 404 not found' },
    }),
    fetchTertiary: async cnpj => ({
      status: 'partial' as const, endpoint: `https://publica.cnpj.ws/cnpj/${cnpj}`,
      data: { fallback: true, cnpj, error: 'HTTP 404 not found' },
    }),
    now: () => new Date('2026-10-13T15:00:00Z'),
  });
  const result = await service.run({ limit: 1 });
  assert.equal(result.unavailable, 1);
  assert.equal(result.unavailableByReason.not_found, 1);
  assert.equal(result.stored, 0);
  assert.equal(JSON.stringify(result).includes(CNPJ), false);
});

test('CNPJ.ws public response must corroborate full office CNPJ, never only root', () => {
  const now = new Date('2026-10-13T15:00:00Z');
  const endpoint = `https://publica.cnpj.ws/cnpj/${CNPJ}`;
  const data = { razao_social: 'EMPRESA PUBLICA DOIS LTDA', estabelecimento: {
    cnpj: CNPJ, nome_fantasia: 'PUBLICA', situacao_cadastral:'Ativa',
    cidade:{nome:'Sao Paulo'}, estado:{sigla:'SP'},
  }};
  const real = normalizeFIDCRegistryIdentity(CNPJ,{status:'real',endpoint,data},now);
  assert.equal(real?.registry_provider,'cnpjws_publica_proxy');
  assert.equal(real?.cnpj,CNPJ);
  assert.equal(real?.legal_name,'EMPRESA PUBLICA DOIS LTDA');
  assert.equal(real?.municipality,'Sao Paulo');
  assert.equal(real?.state_code,'SP');
  assert.equal(normalizeFIDCRegistryIdentity(CNPJ,{
    status:'real',endpoint,
    data:{razao_social:'EMPRESA PUBLICA DOIS LTDA',cnpj:'19540550',estabelecimento:{cnpj:'11111111000111'}},
  },now),null);
});

test('third provider is rate-limited to less than 3/minute and stores only verified identity', async () => {
  const cnpjs = [CNPJ,'00288948000194'];
  const saved: Record<string,unknown>[] = [];
  const sleeps: number[] = [];
  const client={
    select: async () => cnpjs.map(cnpj=>({
      cnpj,identity_next_step:'needs_registry_identity',registry_legal_name:null,registry_checked_at:null,
    })),
    upsert: async (_table:string,rows:Record<string,unknown>[])=>{saved.push(...rows);return rows;},
  };
  const service=new FIDCRegistryIdentityService({
    client:client as never,
    fetchRegistry: async cnpj=>({
      status:'partial' as const,endpoint:`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      data:{fallback:true,cnpj,error:'HTTP 403'},
    }),
    fetchFallback: async cnpj=>({
      status:'partial' as const,endpoint:`https://minhareceita.org/${cnpj}`,
      data:{fallback:true,cnpj,error:'HTTP 502'},
    }),
    fetchTertiary: async cnpj=>({
      status:'real' as const,endpoint:`https://publica.cnpj.ws/cnpj/${cnpj}`,
      data:{razao_social:'EMPRESA DE TESTE LTDA',estabelecimento:{cnpj}},
    }),
    sleep: async (ms)=>{sleeps.push(ms);},
  });
  const result=await service.run({limit:2});
  assert.equal(result.stored,2);
  assert.equal(result.reviewRequired,true);
  assert.equal(saved[0].registry_provider,'cnpjws_publica_proxy');
  assert.ok(sleeps.some(ms=>ms>=20000),'required spacing for public API absent');
});
