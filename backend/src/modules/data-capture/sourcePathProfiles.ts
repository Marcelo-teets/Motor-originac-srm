export const companySitePathProfiles = {
  core: ['/', '/produtos', '/solucoes', '/credito', '/funding', '/capital-de-giro'],
  signals: ['/blog', '/news', '/newsroom', '/imprensa'],
  people: ['/careers', '/carreiras', '/vagas'],
  distribution: ['/parceiros', '/developers', '/docs'],
};

export const flattenCompanySitePaths = () => Object.values(companySitePathProfiles).flat();
