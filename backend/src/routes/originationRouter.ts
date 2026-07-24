import { Router } from 'express';
import {
  getOriginationBacklog,
  getOriginationChecklist,
  getOriginationExecutionPlan,
  getOriginationOperatingSystem,
  getOriginationTemplates,
} from '../modules/originationOperatingSystem.js';
import {
  getBusinessAnalystAgent,
  getDcmDailyOperatingLoop,
} from '../modules/dcmDailyOperatingLoop.js';

export const createOriginationRouter = () => {
  const router = Router();
  const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });

  router.get('/os', (_req, res) => {
    res.json(ok(getOriginationOperatingSystem()));
  });

  router.get('/skills', (_req, res) => {
    res.json(ok(getOriginationOperatingSystem().skills));
  });

  router.get('/flows', (_req, res) => {
    res.json(ok(getOriginationOperatingSystem().flows));
  });

  router.get('/backlog', (_req, res) => {
    res.json(ok(getOriginationBacklog()));
  });

  router.get('/templates', (_req, res) => {
    res.json(ok(getOriginationTemplates()));
  });

  router.get('/checklist', (_req, res) => {
    res.json(ok(getOriginationChecklist()));
  });

  router.get('/execution-plan', (_req, res) => {
    res.json(ok(getOriginationExecutionPlan()));
  });

  router.get('/daily-operating-loop', (_req, res) => {
    res.json(ok(getDcmDailyOperatingLoop()));
  });

  router.get('/business-analyst', (_req, res) => {
    res.json(ok(getBusinessAnalystAgent()));
  });

  return router;
};
