# Vercel Production Access — Motor Originação SRM

## Decisão operacional

Enquanto o Vercel não liberar ou não permitir o alias limpo `motor-originac-srm.vercel.app`, o domínio definitivo da aplicação será:

`https://motor-originac-srm-marcelo-teets-projects.vercel.app`

## Links oficiais

| Uso | URL |
| --- | --- |
| Aplicação | `https://motor-originac-srm-marcelo-teets-projects.vercel.app` |
| Login | `https://motor-originac-srm-marcelo-teets-projects.vercel.app/login` |
| API canônica | `https://motor-originac-srm-marcelo-teets-projects.vercel.app/api` |
| Health da captura | `https://motor-originac-srm-marcelo-teets-projects.vercel.app/api/data-capture/health` |
| Run da captura | `https://motor-originac-srm-marcelo-teets-projects.vercel.app/api/data-capture/run` |

## Regra de uso

1. Materiais internos devem apontar para a URL canônica acima.
2. Workflows e smoke checks devem usar a API canônica do projeto principal.
3. O projeto `motor-originac-srm-backend` não deve ser usado como link da ferramenta enquanto responder fallback estático.
4. Se um domínio próprio for adicionado depois, ele deve redirecionar para o mesmo runtime e substituir esta URL em uma PR pequena.

## Checklist de validação

1. Abrir `/login` e confirmar carregamento do app.
2. Abrir `/api/data-capture/health` e confirmar payload JSON com `status: real`.
3. Confirmar que o front-end não chama `localhost` em produção.
4. Confirmar que `VITE_API_BASE_URL` em produção aponta para `https://motor-originac-srm-marcelo-teets-projects.vercel.app/api`.
5. Confirmar que smoke checks e capture workflows continuam usando o domínio canônico.

## Pendência fora do código

No painel do Vercel, revisar se é possível adicionar o alias `motor-originac-srm.vercel.app`. Se não for possível, nenhuma ação adicional é necessária para acesso interno: a URL canônica acima passa a ser a referência oficial.
