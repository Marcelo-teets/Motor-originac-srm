# Pesquisa simplificada — UX V6

Data: 2026-08-06

## Problema operacional

A busca exigia que o usuário entendesse e configurasse aproximadamente dez parâmetros técnicos, percorresse três etapas, salvasse um perfil, mudasse de aba e só depois executasse a captura. A governança estava correta, mas a complexidade interna do motor havia vazado para a experiência diária.

O efeito prático era incompatível com a missão da Origination Intelligence Platform: o usuário queria dizer **o que procurava** e receber empresas candidatas; em vez disso, precisava operar o motor de busca manualmente.

## Decisão de produto

A rota principal `Pesquisar` passa a seguir divulgação progressiva:

1. usuário descreve a oportunidade em linguagem normal;
2. motor interpreta segmento, tese, recebíveis, estrutura e janela;
3. defaults institucionais são aplicados automaticamente;
4. usuário executa com um único botão;
5. candidatas e evidências aparecem na mesma tela;
6. identidade e promoção continuam seguindo revisão humana;
7. configuração detalhada permanece disponível em `Busca avançada`.

## Fluxo padrão

`Pesquisar → descrever intenção → Buscar empresas → revisar evidências → Capture Inbox → Company Master / Leads`

## Defaults da busca simples

- geografia: Brasil;
- intensidade mínima: alta;
- confiança mínima: 70%;
- janela padrão: 90 dias, reduzida quando a intenção explicita timing recente;
- promoção automática: desativada;
- revisão humana: obrigatória.

Os defaults existem para reduzir esforço cognitivo, não para alterar as regras de qualification ou Company Master.

## Atalhos iniciais

- Recebíveis para FIDC;
- Funding ficando curto;
- Prontas para DCM;
- Embedded finance.

Os atalhos são exemplos de intenção comercial, não novos motores paralelos.

## Integração com discovery

Buscas simples persistem `profilePayload.mode = quick-search` e `profilePayload.userQuery`.

O `buildDiscoveryQuery` usa `userQuery` como consulta primária quando disponível, acrescentando Brasil quando necessário. Perfis avançados continuam usando os campos estruturados existentes.

Assim, a frase digitada deixa de ser apenas interface e passa a influenciar a consulta real às fontes.

## Governança preservada

Nenhuma das mudanças abaixo foi removida ou relaxada:

- deduplicação;
- Candidate Decision Queue;
- validação de identidade;
- Company Master;
- qualification;
- patterns;
- score / lead score;
- ranking;
- promoção humana;
- lineage de fonte.

## Correção do dashboard Hoje

O dashboard principal não deve desaparecer quando o Company Master estiver sem empresas elegíveis. O gate continua bloqueando superfícies de decisão como Leads, Pipeline e Company Detail, mas `Hoje` permanece visível e pode apresentar estado vazio, diagnóstico e CTA para pesquisar novas empresas.

Isso separa corretamente:

- **visibilidade operacional** — deve permanecer disponível;
- **permissão de decisão** — continua protegida pelos gates.

## Critérios de aceite

- `Pesquisar` abre a experiência simples;
- uma busca pode ser iniciada com uma frase e um botão;
- parâmetros técnicos ficam recolhidos por padrão;
- interpretação é visível antes da execução;
- `Busca avançada` continua disponível;
- intenção escrita chega ao discovery real;
- resultado mantém evidence summary e source ref;
- promoção não ocorre automaticamente;
- `Hoje` não é substituído pelo quality gate;
- Leads, Pipeline e Company Detail continuam protegidos;
- TypeScript/build/quality contract devem permanecer verdes antes de merge e produção.
