export type ImprovementMode = 'runtime_only' | 'branch_and_pr';

export const classifyImprovementMode = (targetModule: string): ImprovementMode => {
  if (targetModule.includes('connectors') || targetModule.includes('scraper') || targetModule.includes('parser')) {
    return 'branch_and_pr';
  }

  return 'runtime_only';
};
