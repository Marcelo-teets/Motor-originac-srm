import { Router } from 'express';

export const createMvpQuickActionsRouter = () => {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({
      status: 'partial',
      data: [
        { id: 'qa_1', title: 'Executar bootstrap de conectores', owner: 'Ops', priority: 'high' },
        { id: 'qa_2', title: 'Recalcular qualification das top empresas', owner: 'Origination', priority: 'high' },
        { id: 'qa_3', title: 'Revisar decision memo das top 10', owner: 'DCM', priority: 'medium' },
      ],
    });
  });

  return router;
};
