import { createVercelServerlessHandler } from '../src/serverless/vercelServerlessHandler.js';

export default createVercelServerlessHandler({
  auditVersion: 'serverless_capture_runtime_backend_root_v1',
});
