import cors from 'cors';
import express from 'express';
import { env } from './lib/env.js';
import { createPlatformRepository } from './repositories/platformRepository.js';
import { createPaperclipRouter } from './routes/paperclipRouter.js';
import { PlatformService } from './services/platformService.js';

const app = express();
app.use(cors());
app.use(express.json());

const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
const service = new PlatformService(repository);
const platformMode = env.useSupabase ? 'real' : 'partial';
const paperclipPort = Number(process.env.PAPERCLIP_PORT ?? 4010);

await service.bootstrap().catch((error) => {
  console.warn('Paperclip runtime bootstrap warning:', error instanceof Error ? error.message : error);
});

app.get('/health', (_req, res) => {
  res.json({
    status: platformMode,
    generatedAt: new Date().toISOString(),
    data: {
      service: 'paperclip-runtime-sidecar',
      mode: platformMode,
      uptime: process.uptime(),
    },
  });
});

app.get('/platform/status', (_req, res) => {
  res.json({
    status: platformMode,
    generatedAt: new Date().toISOString(),
    data: {
      paperclipControlPlane: 'active',
      persistence: platformMode,
      targetApiBaseUrl: process.env.PAPERCLIP_TARGET_API_BASE_URL || `http://localhost:${env.port}`,
      port: paperclipPort,
    },
  });
});

app.use('/paperclip', createPaperclipRouter(service));

app.listen(paperclipPort, () => {
  console.log(`Paperclip runtime sidecar listening on http://localhost:${paperclipPort}`);
});
