import { Router } from 'express';
import { AccountStakeholderService } from '../services/accountStakeholderService.js';
import { TouchpointService } from '../services/touchpointService.js';
import { ObjectionIntelligenceService } from '../services/objectionIntelligenceService.js';
import { CommercialMomentumService } from '../services/commercialMomentumService.js';
import { CommercialPriorityService } from '../services/commercialPriorityService.js';
import { PreCallBriefingService } from '../services/preCallBriefingService.js';

export const createAbmWarRoomRouter = () => {
  const router = Router();
  const stakeholders = new AccountStakeholderService();
  const touchpoints = new TouchpointService();
  const objections = new ObjectionIntelligenceService();
  const momentum = new CommercialMomentumService();
  const priority = new CommercialPriorityService();
  const briefing = new PreCallBriefingService();

  router.get('/companies/:companyId/stakeholders', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await stakeholders.listByCompany(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/companies/:companyId/touchpoints', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await touchpoints.listByCompany(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/companies/:companyId/objections', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await objections.listByCompany(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/companies/:companyId/pre-call-briefing', async (req, res, next) => {
    try {
      const companyId = String(req.params.companyId);
      const stakeholderList = await stakeholders.listByCompany(companyId);
      const objectionList = await objections.listByCompany(companyId);
      res.json({
        status: 'partial',
        data: briefing.build({
          companyName: companyId,
          stakeholders: stakeholderList,
          objections: objectionList,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/war-room/weekly', async (_req, res, next) => {
    try {
      res.json({
        status: 'partial',
        data: {
          summary: 'ABM war room foundation active.',
          momentumExample: momentum.calculate({ daysSinceLastTouchpoint: 5, hasChampion: true, recentSignalStrength: 82 }),
          priorityExample: priority.calculate({ leadScore: 78, rankingScore: 74, triggerStrength: 81, urgencyScore: 76 }),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
