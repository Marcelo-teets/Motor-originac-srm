import type { Express } from 'express';
import { createMvpPersistenceBootstrapRouter } from '../routes/mvpPersistenceBootstrapRouter.js';

export function registerMvpPersistenceBootstrap(app: Express) {
  app.use('/mvp/persistence-bootstrap', createMvpPersistenceBootstrapRouter());
}
