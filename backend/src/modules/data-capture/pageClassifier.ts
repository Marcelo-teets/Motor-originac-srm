export const classifyPageType = (url: string, text: string) => {
  const value = `${url} ${text}`.toLowerCase();
  if (/produt|solu[cç][aã]o|cr[eé]dito|funding|capital/.test(value)) return 'product';
  if (/blog|news|newsroom|imprensa/.test(value)) return 'news';
  if (/careers|carreiras|vaga/.test(value)) return 'careers';
  if (/parceir|developer|docs/.test(value)) return 'distribution';
  return 'generic';
};
