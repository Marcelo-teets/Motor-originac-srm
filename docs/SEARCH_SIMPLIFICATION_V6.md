# Pesquisa simplificada — UX V6

Data: 2026-08-06

## Problema operacional

A busca exigia que o usuário entendesse e configurasse aproximadamente dez parâmetros técnicos, percorresse três etapas, salvasse um perfil, mudasse de aba e só depois executasse a captura. A governança estava correta, mas a complexidade interna do motor havia vazado para a experiência diária.

O efeito prático era incompatível com a missão da Origination Intelligence Platform: o usuário queria dizer **o que procurava** e receber empresas candidatas; em vez disso, precisava operar o motor de busca manualmente.

## Causas técnicas confirmadas em produção

A revisão do código e do Supabase encontrou problemas adicionais que reforçavam a sensação de que a busca não funcionava:

1. `search_profiles.id` é UUID no Supabase, enquanto a criação pela UI podia gerar IDs textuais `sp_*`. O write caía no fallback de memória e a execução seguinte podia não reencontrar o perfil.
2. Execuções recentes encontravam aproximadamente 10–11 correspondências, mas frequentemente inseriam 0 novas por deduplicação. A UI tratava isso como ausência de resultado.
3. O parser de Google News podia transformar uma manchete genérica em nome de empresa.
4. O universo genérico de portfólios VC era anexado a praticamente toda busca, mesmo quando não tinha relação suficiente com a intenção digitada.
5. Falhas de fonte podiam ser convertidas silenciosamente em lista vazia, confundindo indisponibilidade operacional com zero correspondências.

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
- intensidade do perfil: alta;
- confiança mínima do perfil: 70%;
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

Buscas simples persistem um UUID real, `profilePayload.mode = quick-search` e `profilePayload.userQuery`.

O `buildDiscoveryQuery` usa `userQuery` como consulta primária quando disponível, acrescentando Brasil quando necessário. Perfis avançados continuam usando os campos estruturados existentes.

Para buscas rápidas, o universo genérico de portfólios VC só é anexado quando a intenção pede explicitamente portfólio, venture, VC, investidas ou startups. Isso evita que toda consulta retorne o mesmo conjunto genérico de empresas.

O parser de notícias também reduz falsos positivos de manchetes, separando ações como “lança”, “capta”, “anuncia” ou “levanta” do nome provável da empresa e rejeitando sujeitos genéricos.

## Estados de resultado

A interface passa a distinguir explicitamente:

- **novas empresas encontradas** — mostrar candidatas adicionadas para revisão;
- **correspondências já conhecidas** — informar encontradas x novas e direcionar para a fila existente;
- **zero correspondências** — sugerir ampliar/refinar a intenção;
- **falha operacional** — mostrar erro da captura/fonte em vez de fingir que não houve resultado.

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

## Busca avançada

A configuração avançada deixa de exigir um wizard de três passos e passa a apresentar os critérios em um único workspace. Os perfis avançados também usam UUID real, persistem no Supabase e distinguem encontradas x novas x falha operacional.

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
- `Busca avançada` continua disponível e persiste com UUID válido;
- intenção escrita chega ao discovery real;
- resultados diferenciam encontradas, novas, repetidas e falha;
- ruído óbvio de manchetes é filtrado;
- portfólios VC genéricos não contaminam toda busca rápida;
- resultado mantém evidence summary e source ref;
- promoção não ocorre automaticamente;
- `Hoje` não é substituído pelo quality gate;
- Leads, Pipeline e Company Detail continuam protegidos;
- TypeScript/build/quality contract devem permanecer verdes antes de merge e produção.
