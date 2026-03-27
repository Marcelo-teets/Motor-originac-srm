import type { Express } from 'express';
import { createMvpCheckpointRouter } from '../routes/mvpCheckpointRouter.js';

export function registerMvpCheckpoint(app: Express) {
  app.use('/mvp/checkpoint', createMvpCheckpointRouter());
}
