export const originationSignalLexicon = {
  receivables: ['recebíveis', 'antecipação', 'antecipar', 'parcelado', 'carteira', 'duplicatas'],
  funding: ['funding', 'capital', 'captação', 'debênture', 'nota comercial', 'fidc', 'securitização'],
  payments: ['pix', 'checkout', 'pagamento', 'adquirência', 'wallet'],
  underwriting: ['underwriting', 'cobrança', 'risco', 'política de crédito', 'score'],
  vc: ['venture capital', 'series a', 'series b', 'investidor', 'rodada', 'fundo'],
};

export const flattenOriginationTerms = () => Object.values(originationSignalLexicon).flat();
