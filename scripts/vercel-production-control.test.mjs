import assert from 'node:assert/strict';
import {
  createVercelProductionController,
  VercelControlError,
} from './vercel-production-control.mjs';

const token = 'vercel-test-token-never-log';
const sha = '1234567890abcdef1234567890abcdef12345678';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

const pathFor = (input) => {
  const url = input instanceof URL ? input : new URL(String(input));
  return `${url.pathname}${url.search}`;
};

const createMockFetch = (handlers) => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const call = {
      path: pathFor(input),
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const handler = handlers.shift();
    assert.ok(handler, `Unexpected request: ${call.method} ${call.path}`);
    return handler(call);
  };
  return { calls, fetchImpl };
};

{
  const { fetchImpl, calls } = createMockFetch([]);
  const controller = createVercelProductionController({ token, fetchImpl });
  await assert.rejects(
    controller.deployProduction('short-sha'),
    (error) => error instanceof VercelControlError
      && /40-character Git commit SHA/.test(error.message),
  );
  assert.equal(calls.length, 0);
}

{
  const { calls, fetchImpl } = createMockFetch([
    () => response({
      id: 'project-id',
      name: 'motor-originac-srm',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
      latestDeployment: {
        id: 'dpl_current',
        url: 'current.vercel.app',
        readyState: 'READY',
        meta: { githubCommitSha: sha },
      },
    }),
  ]);
  const controller = createVercelProductionController({ token, fetchImpl });
  const status = await controller.getProjectStatus();
  assert.equal(status.createDeployments, 'disabled');
  assert.equal(status.productionBranch, 'main');
  assert.equal(status.latestDeployment.sha, sha);
  assert.match(String(calls[0].headers.Authorization), /^Bearer /);
  assert.equal(JSON.stringify(status).includes(token), false);
}

{
  const { calls, fetchImpl } = createMockFetch([
    (call) => {
      assert.equal(call.method, 'PATCH');
      assert.deepEqual(call.body, {
        gitProviderOptions: { createDeployments: 'disabled' },
      });
      return response({
        id: 'project-id',
        gitProviderOptions: { createDeployments: 'disabled' },
        link: { productionBranch: 'main' },
      });
    },
  ]);
  const controller = createVercelProductionController({ token, fetchImpl });
  const result = await controller.setAutomaticDeployments(false);
  assert.equal(result.createDeployments, 'disabled');
  assert.equal(calls.length, 1);
}

{
  const { calls, fetchImpl } = createMockFetch([
    () => response({
      deployments: [{
        id: 'dpl_existing',
        url: 'existing.vercel.app',
        readyState: 'READY',
        target: 'production',
        meta: { githubCommitSha: sha },
      }],
    }),
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
  ]);
  const controller = createVercelProductionController({ token, fetchImpl });
  const result = await controller.deployProduction(sha);
  assert.equal(result.status, 'reused');
  assert.equal(result.deployment.id, 'dpl_existing');
  assert.equal(calls.some(({ method }) => method === 'POST'), false);
}

{
  const { calls, fetchImpl } = createMockFetch([
    () => response({ deployments: [] }),
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
    (call) => {
      assert.equal(call.method, 'POST');
      assert.match(call.path, /^\/v13\/deployments\?/);
      assert.deepEqual(call.body, {
        name: 'motor-originac-srm',
        project: 'prj_hsB473e7bNF0xOd6CEUwo7WFgNYs',
        target: 'production',
        gitSource: {
          type: 'github-limited',
          repoId: 1185535233,
          ref: 'main',
          sha,
        },
        meta: {
          deploymentController: 'motor-originacao',
          requestedSha: sha,
        },
      });
      return response({
        id: 'dpl_new',
        url: 'new.vercel.app',
        readyState: 'QUEUED',
        target: 'production',
        gitSource: { sha },
      });
    },
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
  ]);
  const controller = createVercelProductionController({ token, fetchImpl });
  const result = await controller.deployProduction(sha);
  assert.equal(result.status, 'created');
  assert.equal(result.deployment.id, 'dpl_new');
  assert.equal(result.automaticDeployments, 'disabled');
  assert.equal(JSON.stringify(result).includes(token), false);
}

{
  const transitions = [];
  const { calls, fetchImpl } = createMockFetch([
    () => response({ deployments: [] }),
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
    () => response({
      error: {
        code: 'git_integration_disabled',
        message: 'Git deployment creation is disabled',
      },
    }, 403),
    (call) => {
      transitions.push(call.body.gitProviderOptions.createDeployments);
      return response({
        id: 'project-id',
        gitProviderOptions: { createDeployments: 'enabled' },
        link: { productionBranch: 'main' },
      });
    },
    () => response({
      id: 'dpl_temporary',
      url: 'temporary.vercel.app',
      readyState: 'QUEUED',
      target: 'production',
      meta: { githubCommitSha: sha },
    }),
    (call) => {
      transitions.push(call.body.gitProviderOptions.createDeployments);
      return response({
        id: 'project-id',
        gitProviderOptions: { createDeployments: 'disabled' },
        link: { productionBranch: 'main' },
      });
    },
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
    () => response({
      id: 'project-id',
      gitProviderOptions: { createDeployments: 'disabled' },
      link: { productionBranch: 'main' },
    }),
  ]);
  const controller = createVercelProductionController({ token, fetchImpl });
  const result = await controller.deployProduction(sha, { allowTemporaryEnable: true });
  assert.equal(result.status, 'created');
  assert.deepEqual(transitions, ['enabled', 'disabled']);
  assert.equal(result.automaticDeployments, 'disabled');
  assert.equal(calls.filter(({ method }) => method === 'POST').length, 2);
  assert.equal(JSON.stringify(result).includes(token), false);
}

{
  const observedStates = ['BUILDING', 'READY'];
  const { fetchImpl } = createMockFetch([
    () => response({
      id: 'dpl_wait',
      url: 'wait.vercel.app',
      readyState: observedStates.shift(),
      meta: { githubCommitSha: sha },
    }),
    () => response({
      id: 'dpl_wait',
      url: 'wait.vercel.app',
      readyState: observedStates.shift(),
      meta: { githubCommitSha: sha },
    }),
  ]);
  const controller = createVercelProductionController({
    token,
    fetchImpl,
    sleepImpl: async () => {},
  });
  const result = await controller.waitForDeployment('dpl_wait', {
    timeoutMs: 1_000,
    pollIntervalMs: 1,
  });
  assert.equal(result.state, 'READY');
}

console.log('Vercel production controller: all tests passed.');
