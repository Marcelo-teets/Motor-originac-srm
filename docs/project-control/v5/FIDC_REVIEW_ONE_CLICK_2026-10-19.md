# V5 A2 — Abrir ficha FIDC diretamente da evidência

**Objetivo:** reduzir navegação repetitiva na triagem de 85 CNPJs reais provenientes da CVM, preservando fonte, auditoria e RBAC.

## Implementação
- Na aba `Capture Inbox → Cedentes FIDC`, cada registro de fonte passa a oferecer **Abrir ficha de parecer**, apenas para usuário `isGodMode`.
- O clique utiliza o CNPJ carregado da API oficial `/candidate-decision-queue/fidc-assignors` e pré-seleciona o mesmo CNPJ no `FidcHumanReviewPanel` após fonte e endpoint de auditoria carregarem com sucesso.
- O formulário aparece primeiro e recebe scroll assistido; o contador de acionamentos permite selecionar novamente o mesmo CNPJ sem estado obsoleto.
- A pré-seleção **não grava** revisão, cria candidato, valida recebíveis, atribui score ou classifica a empresa como elegível. O usuário ainda precisa revisar as fontes, preencher justificativa e próxima ação, aceitar os termos e salvar.
- RLS, verificação do perfil administrativo ativo, status cadastral, RPC de auditoria, aprovação humana e demais limites continuam inalterados.
- O backend da PR #614 e migration publicada seguem como fonte única de histórico; o componente cliente nunca cria histórico local fictício.

## Verificações e aceite
1. Login como perfil não autorizado: a tabela continua sendo somente-leitura, e nenhuma ação `Abrir ficha de parecer` é oferecida.
2. Login como perfil administrativo verdadeiro (RB-03): selecionar um cedente da CVM abre sua ficha correspondente, não outro CNPJ, e mostra as fontes associadas.
3. O clique não envia POST nem muda `companies`, `qualification_snapshots`, `ranking_v2`, `pipeline`.
4. Sem Auth real, preservar bloqueio da escrita; não fabricar usuário ou parecer.
5. CI de frontend, typecheck, build e Neon Runtime Parity devem passar. Deploy apenas pelo workflow e pedido de release oficiais em PR separada.

## Próxima etapa
A2 permanece incompleto até haver avaliação comercial fundamentada e aprovação humana; qualificação e scoring não são inferidos dos vínculos CVM.
