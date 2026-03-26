import type { Express } from 'express';
import { createMvpIntelligenceSnapshotRouter } from '../routes/mvpIntelligenceSnapshotRouter.js';

export function registerMvpIntelligenceSnapshot(app: Express) {
  app.use('/mvp/intelligence-snapshot', createMvpIntelligenceSnapshotRouter());
}
