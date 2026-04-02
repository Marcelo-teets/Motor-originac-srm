import type { CompanySeed } from '../../types/platform.js';
import { flattenCompanySitePaths } from './sourcePathProfiles.js';

export const buildCompanyCrawlPlan = (company: CompanySeed) => {
  const base = company.website.replace(/\/$/, '');
  return flattenCompanySitePaths().map((path) => `${base}${path === '/' ? '' : path}`);
};
