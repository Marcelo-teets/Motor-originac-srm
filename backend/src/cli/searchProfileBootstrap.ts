import { createPlatformRepository } from '../repositories/platformRepository.js';
import { SearchProfileCaptureService } from '../services/searchProfileCaptureService.js';
import { SearchProfileCaptureRuntime } from '../services/searchProfileCaptureRuntime.js';
import { runSearchProfileBootstrap } from '../services/searchProfileBootstrapRunner.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();
const profileIds = args
  .flatMap((arg, index) => arg === '--profile-id' ? [args[index + 1]] : [])
  .filter((value): value is string => Boolean(value));
const parsedMaxProfiles = Number(valueFor('max-profiles') ?? 100);
const maxProfiles = Number.isFinite(parsedMaxProfiles) ? Math.max(1, Math.trunc(parsedMaxProfiles)) : 100;

if (!process.env.MOTOR_NEON_DATABASE_URL && !process.env.DATABASE_URL) {
  throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required for Search Profile bootstrap.');
}

const repository = createPlatformRepository('database');
const runtime = new SearchProfileCaptureRuntime(repository);
const captureService = new SearchProfileCaptureService(runtime);

const result = await runSearchProfileBootstrap({
  listSearchProfiles: () => repository.listSearchProfiles(),
  runCapture: (searchProfileId) => captureService.runCapture(searchProfileId, 'bootstrap'),
}, {
  profileIds,
  maxProfiles,
});

console.log(JSON.stringify(result, null, 2));
if (result.failed > 0) process.exitCode = 1;
