import type { Express } from 'express';
import { registerMvpPersistenceBootstrap } from './registerMvpPersistenceBootstrap.js';
import { registerMvpIntelligenceSnapshot } from './registerMvpIntelligenceSnapshot.js';

export function registerAllMvpRoutes(app: Express) {
  registerMvpPersistenceBootstrap(app);
  registerMvpIntelligenceSnapshot(app);
}
