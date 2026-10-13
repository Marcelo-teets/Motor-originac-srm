import { parseCliArgs } from './args.js';
import { FIDCRegistryIdentityService } from '../services/fidcRegistryIdentityService.js';

const { valueFor } = parseCliArgs();
const limit = Number(valueFor('limit') ?? '10');
if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
  throw new Error('--limit must be an integer from 1 to 20');
}
const result = await new FIDCRegistryIdentityService().run({ limit });
console.log(JSON.stringify(result, null, 2));
if (result.invalidRegistry > 0) {
  console.error('Some registry responses did not corroborate their target CNPJ.');
}
if (result.unavailable > 0) {
  console.warn('Registry returned temporary unavailability; no invented identity was stored.');
}
