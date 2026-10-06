import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';

delete process.env.MOTOR_NEON_DATABASE_URL;
delete process.env.DATABASE_URL;
const { createWatchlistRouter } = await import('./watchlistRouter.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).authUser = { id: String(req.headers['x-user'] ?? 'anonymous'), raw: {} };
  next();
});
app.use('/watchlists', createWatchlistRouter({ listCompanies: async () => [], listCompanySignals: async () => [], listLeadScoreSnapshots: async () => [] }));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/watchlists`;
test.after(() => server.close());

const call = async (user: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-user': user },
  });
  return { status: response.status, body: await response.json() as any };
};

test('private watch lists are hidden from and immutable by other users', async () => {
  const created = await call('alice', '', { method: 'POST', body: JSON.stringify({ name: 'Alice private', isShared: false }) });
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  assert.ok((await call('alice', '')).body.data.some((list: any) => list.id === id));
  assert.ok(!(await call('bob', '')).body.data.some((list: any) => list.id === id));
  assert.equal((await call('bob', `/${id}/items`)).status, 404);
  assert.equal((await call('bob', `/${id}`, { method: 'PATCH', body: JSON.stringify({ name: 'hijack' }) })).status, 403);
  assert.equal((await call('bob', `/${id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await call('bob', `/${id}/items`, { method: 'POST', body: JSON.stringify({ companyId: 'c1' }) })).status, 403);

  assert.equal((await call('alice', `/${id}/items`, { method: 'POST', body: JSON.stringify({ companyId: 'c1' }) })).status, 201);
  assert.equal((await call('alice', `/${id}`, { method: 'DELETE' })).status, 200);
});

test('shared watch lists are visible to everyone but still owned by their creator', async () => {
  const created = await call('alice', '', { method: 'POST', body: JSON.stringify({ name: 'Team list', isShared: true }) });
  const id = created.body.data.id;
  assert.ok((await call('bob', '')).body.data.some((list: any) => list.id === id));
  assert.equal((await call('bob', `/${id}/items`)).status, 200);
  assert.equal((await call('bob', `/${id}`, { method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) })).status, 403);
});
