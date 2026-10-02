const base = process.env.NEON_AUTH_BASE_URL;
if (!base) throw new Error('NEON_AUTH_BASE_URL missing');
const response = await fetch(`${base.replace(/\/$/, '')}/open-api/generate-schema`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`OpenAPI HTTP ${response.status}`);
const schema = await response.json();
const interesting = Object.entries(schema.paths || {})
  .filter(([path]) => /sign-in|sign-up|get-session|sign-out|token|password|social|oauth|session|user/i.test(path))
  .map(([path, methods]) => ({
    path,
    methods: Object.fromEntries(Object.entries(methods).map(([method, def]) => [method, {
      operationId: def?.operationId,
      requestBody: def?.requestBody?.content?.['application/json']?.schema ?? null,
      responses: Object.fromEntries(Object.entries(def?.responses || {}).slice(0, 8).map(([status, responseDef]) => [status, {
        description: responseDef?.description,
        schema: responseDef?.content?.['application/json']?.schema ?? null,
      }])),
    }]))
  }));
console.log(JSON.stringify({ openapi: schema.openapi, endpoints: interesting }, null, 2));
