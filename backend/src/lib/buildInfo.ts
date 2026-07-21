export type BuildInfo = {
  gitSha: string;
  environment: string;
  deploymentId: string | null;
  deploymentUrl: string | null;
};

// Vercel injeta VERCEL_GIT_COMMIT_SHA/VERCEL_ENV/VERCEL_DEPLOYMENT_ID em todo
// deployment; fora da Vercel caímos para GIT_SHA/NODE_ENV para smoke local.
export const getBuildInfo = (source: NodeJS.ProcessEnv = process.env): BuildInfo => ({
  gitSha: source.VERCEL_GIT_COMMIT_SHA ?? source.GIT_SHA ?? 'unknown',
  environment: source.VERCEL_ENV ?? source.NODE_ENV ?? 'local',
  deploymentId: source.VERCEL_DEPLOYMENT_ID ?? null,
  deploymentUrl: source.VERCEL_URL ?? null,
});
