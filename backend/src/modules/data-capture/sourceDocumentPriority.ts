export const scoreSourceDocumentPriority = (params: {
  confidenceScore: number;
  sourceId: string;
  title?: string;
}) => {
  const title = (params.title ?? '').toLowerCase();
  let score = Math.round(params.confidenceScore * 100);
  if (/funding|fidc|deb[eê]nture|nota comercial|receb[ií]veis|cr[eé]dito/.test(title)) score += 15;
  if (/src_brasilapi_cnpj|src_cvm_rss/.test(params.sourceId)) score += 8;
  return Math.min(score, 100);
};
