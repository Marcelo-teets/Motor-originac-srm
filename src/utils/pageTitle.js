const titles = {
  '/login': 'Login',
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/propostas/nova': 'Nova Proposta',
  '/pipeline': 'Pipeline da Originação',
};

export function getPageTitle(pathname) {
  if (pathname.startsWith('/propostas/')) {
    return 'Detalhe da Proposta | Motor Originação SRM';
  }

  return `${titles[pathname] ?? 'Página não encontrada'} | Motor Originação SRM`;
}
