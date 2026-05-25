import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './index.js';

export default async function dashboardAlias(req: IncomingMessage, res: ServerResponse) {
  (req as any).url = '/api/dashboard/summary';
  await handler(req, res);
}
