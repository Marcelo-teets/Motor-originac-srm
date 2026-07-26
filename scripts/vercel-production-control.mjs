import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_VERCEL_CONTROL_CONFIG = Object.freeze({
  apiBaseUrl: 'https://api.vercel.com',
  projectId: 'prj_hsB473e7bNF0xOd6CEUwo7WFgNYs',
  teamId: 'team_PJwucES3YmFbxf57HE52Bw0v',
  projectName: 'motor-originac-srm',
  repositoryId: 1185535233,
  repositoryRef: 'main',
});

const ACTIVE_DEPLOYMENT_STATES = new Set([
  'READY',
  'BUILDING',
  'QUEUED',
  'INITIALIZING',
]);
const TERMINAL_DEPLOYMENT_STATES = new Set([
  'READY',
  'ERROR',
  'CANCELED',
  'DELETED',
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalizedState = (deployment) => String(
  deployment?.readyState
  ?? deployment?.state
  ?? deployment?.status
  ?? 'UNKNOWN',
).toUpperCase();

const deploymentSha = (deployment) => (
  deployment?.meta?.githubCommitSha
  ?? deployment?.gitSource?.sha
  ?? deployment?.gitMetadata?.commitSha
  ?? null
);

const sanitizedDeployment = (deployment) => ({
  id: deployment?.id ?? deployment?.uid ?? null,
  url: deployment?.url ?? null,
  state: normalizedState(deployment),
  target: deployment?.target ?? null,
  sha: deploymentSha(deployment),
  createdAt: deployment?.createdAt ?? deployment?.created ?? null,
  inspectorUrl: deployment?.inspectorUrl ?? null,
});

const normalizedAutoDeploymentState = (project) => (
  project?.gitProviderOptions?.createDeployments
  ?? 'unknown'
);

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
};

export class VercelControlError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = 'VercelControlError';
    this.status = status;
    this.code = code;
  }
}

const createRequest = ({ token, config, fetchImpl }) => async (path, init = {}) => {
  if (!token) throw new VercelControlError('VERCEL_TOKEN is required.');

  const url = new URL(path, config.apiBaseUrl);
  if (!url.searchParams.has('teamId')) url.searchParams.set('teamId', config.teamId);

  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    const code = payload?.error?.code ?? payload?.code ?? null;
    const detail = payload?.error?.message ?? payload?.message ?? response.statusText;
    throw new VercelControlError(
      `Vercel API returned HTTP ${response.status}: ${String(detail || 'request failed')}`,
      { status: response.status, code },
    );
  }

  return payload;
};

const deploymentCreationBlocked = (error) => {
  if (!(error instanceof VercelControlError)) return false;
  const code = String(error.code ?? '').toLowerCase();
  const message = error.message.toLowerCase();
  return [400, 403, 409].includes(Number(error.status))
    && (
      code.includes('git')
      || code.includes('deployment')
      || message.includes('create deployments')
      || message.includes('git integration')
      || message.includes('disabled')
    );
};

export const createVercelProductionController = ({
  token,
  config: overrides = {},
  fetchImpl = fetch,
  sleepImpl = sleep,
} = {}) => {
  const config = { ...DEFAULT_VERCEL_CONTROL_CONFIG, ...overrides };
  const request = createRequest({ token, config, fetchImpl });

  const getProjectStatus = async () => {
    const project = await request(`/v9/projects/${encodeURIComponent(config.projectId)}`);
    return {
      projectId: project?.id ?? config.projectId,
      projectName: project?.name ?? config.projectName,
      productionBranch: project?.link?.productionBranch ?? config.repositoryRef,
      createDeployments: normalizedAutoDeploymentState(project),
      latestDeployment: project?.latestDeployment
        ? sanitizedDeployment(project.latestDeployment)
        : null,
    };
  };

  const setAutomaticDeployments = async (enabled) => {
    const expected = enabled ? 'enabled' : 'disabled';
    const project = await request(`/v9/projects/${encodeURIComponent(config.projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        gitProviderOptions: {
          createDeployments: expected,
        },
      }),
    });

    const actual = normalizedAutoDeploymentState(project);
    if (actual !== expected) {
      throw new VercelControlError(
        `Vercel did not persist createDeployments=${expected}; received ${actual}.`,
      );
    }

    return {
      projectId: project?.id ?? config.projectId,
      productionBranch: project?.link?.productionBranch ?? config.repositoryRef,
      createDeployments: actual,
    };
  };

  const listDeployments = async () => {
    const payload = await request(
      `/v6/deployments?projectId=${encodeURIComponent(config.projectId)}&limit=100`,
    );
    return Array.isArray(payload?.deployments) ? payload.deployments : [];
  };

  const findReusableDeployment = async (sha) => {
    const deployments = await listDeployments();
    const match = deployments.find((deployment) => (
      deploymentSha(deployment) === sha
      && ACTIVE_DEPLOYMENT_STATES.has(normalizedState(deployment))
    ));
    return match ? sanitizedDeployment(match) : null;
  };

  const createDeploymentRequest = async (sha) => {
    const payload = await request('/v13/deployments?forceNew=1', {
      method: 'POST',
      body: JSON.stringify({
        name: config.projectName,
        project: config.projectId,
        target: 'production',
        gitSource: {
          type: 'github-limited',
          repoId: config.repositoryId,
          ref: config.repositoryRef,
          sha,
        },
        meta: {
          deploymentController: 'motor-originacao',
          requestedSha: sha,
        },
      }),
    });
    return sanitizedDeployment(payload);
  };

  const getDeployment = async (idOrUrl) => {
    assert.ok(idOrUrl, 'Deployment ID or URL is required.');
    const deployment = await request(`/v13/deployments/${encodeURIComponent(idOrUrl)}`);
    return sanitizedDeployment(deployment);
  };

  const waitForDeployment = async (idOrUrl, {
    timeoutMs = 15 * 60 * 1000,
    pollIntervalMs = 10_000,
  } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let deployment = await getDeployment(idOrUrl);

    while (!TERMINAL_DEPLOYMENT_STATES.has(deployment.state)) {
      if (Date.now() >= deadline) {
        throw new VercelControlError(
          `Timed out waiting for deployment ${idOrUrl}; last state=${deployment.state}.`,
        );
      }
      await sleepImpl(pollIntervalMs);
      deployment = await getDeployment(idOrUrl);
    }

    if (deployment.state <> 'READY') {
      throw new VercelControlError(
        `Deployment ${idOrUrl} reached terminal state ${deployment.state}.`,
        { code: 'deployment_not_ready' },
      );
    }

    return deployment;
  };

  const deployProduction = async (sha, {
    wait = false,
    allowTemporaryEnable = true,
    timeoutMs,
    pollIntervalMs,
  } = {}) => {
    if (!/^[0-9a-f]{40}$/i.test(String(sha ?? ''))) {
      throw new VercelControlError('A full 40-character Git commit SHA is required.');
    }

    const normalizedSha = String(sha).toLowerCase();
    const existing = await findReusableDeployment(normalizedSha);
    if (existing) {
      const finalExisting = wait && existing.state !== 'READY'
        ? await waitForDeployment(existing.id ?? existing.url, { timeoutMs, pollIntervalMs })
        : existing;
      return {
        status: 'reused',
        deployment: finalExisting,
        automaticDeployments: (await getProjectStatus()).createDeployments,
      };
    }

    const before = await getProjectStatus();
    if (before.createDeployments !== 'disabled') {
      await setAutomaticDeployments(false);
    }

    let deployment;
    try {
      deployment = await createDeploymentRequest(normalizedSha);
    } catch (error) {
      if (!allowTemporaryEnable || !deploymentCreationBlocked(error)) throw error;

      await setAutomaticDeployments(true);
      try {
        deployment = await createDeploymentRequest(normalizedSha);
      } finally {
        await setAutomaticDeployments(false);
      }
    } finally {
      const current = await getProjectStatus();
      if (current.createDeployments !== 'disabled') {
        await setAutomaticDeployments(false);
      }
    }

    if (!deployment?.id && !deployment?.url) {
      throw new VercelControlError('Vercel did not return a deployment identifier.');
    }

    const finalDeployment = wait
      ? await waitForDeployment(deployment.id ?? deployment.url, { timeoutMs, pollIntervalMs })
      : deployment;

    return {
      status: 'created',
      deployment: finalDeployment,
      automaticDeployments: (await getProjectStatus()).createDeployments,
    };
  };

  return {
    config,
    getProjectStatus,
    setAutomaticDeployments,
    listDeployments,
    findReusableDeployment,
    getDeployment,
    waitForDeployment,
    deployProduction,
  };
};

const parseArguments = (argumentsList) => {
  const [command = 'status', ...rest] = argumentsList;
  const options = Object.fromEntries(rest.map((argument) => {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) return [argument, true];
    return [match[1], match[2] ?? true];
  }));
  return { command, options };
};

const appendSummary = (report) => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '# Vercel Production Control',
    '',
    `- Command: **${report.command}**`,
    `- Result: **${report.result?.status ?? 'completed'}**`,
    `- Deployment: **${report.result?.deployment?.id ?? 'not created'}**`,
    `- State: **${report.result?.deployment?.state ?? 'n/a'}**`,
    `- SHA: **${report.result?.deployment?.sha ?? report.sha ?? 'n/a'}**`,
    `- Automatic Git deployments: **${report.result?.automaticDeployments ?? report.result?.createDeployments ?? 'unknown'}**`,
    '',
  ].join('\n'));
};

const main = async () => {
  const { command, options } = parseArguments(process.argv.slice(2));
  const controller = createVercelProductionController({
    token: process.env.VERCEL_TOKEN,
    config: {
      projectId: process.env.VERCEL_PROJECT_ID || DEFAULT_VERCEL_CONTROL_CONFIG.projectId,
      teamId: process.env.VERCEL_TEAM_ID || DEFAULT_VERCEL_CONTROL_CONFIG.teamId,
      projectName: process.env.VERCEL_PROJECT_NAME || DEFAULT_VERCEL_CONTROL_CONFIG.projectName,
      repositoryId: Number(process.env.VERCEL_REPOSITORY_ID || DEFAULT_VERCEL_CONTROL_CONFIG.repositoryId),
      repositoryRef: process.env.VERCEL_REPOSITORY_REF || DEFAULT_VERCEL_CONTROL_CONFIG.repositoryRef,
    },
  });

  let result;
  if (command === 'status') {
    result = await controller.getProjectStatus();
  } else if (command === 'disable-auto') {
    result = await controller.setAutomaticDeployments(false);
  } else if (command === 'enable-auto') {
    result = await controller.setAutomaticDeployments(true);
  } else if (command === 'deploy-production') {
    result = await controller.deployProduction(String(options.sha ?? ''), {
      wait: options.wait === true || options.wait === 'true',
      allowTemporaryEnable: options['allow-temporary-enable'] !== 'false',
      timeoutMs: options['timeout-seconds']
        ? Number(options['timeout-seconds']) * 1000
        : undefined,
      pollIntervalMs: options['poll-seconds']
        ? Number(options['poll-seconds']) * 1000
        : undefined,
    });
  } else {
    throw new VercelControlError(`Unsupported command: ${command}`);
  }

  const report = {
    command,
    sha: options.sha ?? null,
    result,
  };
  console.log(JSON.stringify(report, null, 2));
  appendSummary(report);
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? null,
      status: error?.status ?? null,
    }));
    process.exitCode = 1;
  });
}
