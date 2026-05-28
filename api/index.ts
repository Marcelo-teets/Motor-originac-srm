import { createVercelServerlessHandler } from '../backend/src/serverless/vercelServerlessHandler.js';

export default createVercelServerlessHandler({
  auditVersion: 'root_entrypoint_v2',
});
