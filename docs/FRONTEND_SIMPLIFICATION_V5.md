# Simplificação da interface operacional — UX V5

Data da revisão: 2026-08-03

## Objetivo

Reduzir o esforço cognitivo da operação diária sem remover dados, módulos ou controles institucionais. A interface deve responder rapidamente:

1. O que merece atenção hoje?
2. Quem devemos abordar?
3. Por que agora?
4. Qual estrutura financeira parece adequada?
5. Qual é a próxima ação?
6. Onde a oportunidade está no pipeline?

## Diagnóstico revisado

A complexidade não vinha apenas da identidade visual. Ela era causada por quatro fatores combinados:

- mais de vinte módulos expostos na navegação;
- duplicação do fluxo principal entre menu, barra superior e trilho de etapas;
- excesso de indicadores e painéis com a mesma prioridade visual;
- filtros, diagnósticos e evidências sempre visíveis, mesmo antes de serem necessários.

A revisão confirmou que remover módulos prejudicaria a operação institucional. A solução adotada foi **divulgação progressiva**: manter todas as capacidades, mas mostrar primeiro apenas o que sustenta a decisão atual.

## Arquitetura de navegação aprovada

### Operação diária

1. **Hoje** — próxima melhor ação, bloqueios e plano do dia.
2. **Leads** — fila de empresas priorizadas.
3. **Pipeline** — oportunidades e próximos passos.
4. **Pesquisar** — descoberta de novas empresas.

### Ferramentas de apoio

Abordagens, tarefas, watchlist, market map, resultados, conhecimento e playbooks permanecem disponíveis em um grupo recolhido.

### Administração

Sinais, capturas, identidades, revisão de crédito, fontes, agentes, arquivo histórico e usuários permanecem disponíveis em um grupo recolhido.

## Simulação das telas

### Tela 1 — Hoje

1. Usuário entra na plataforma.
2. Visualiza uma única “Próxima melhor ação”.
3. Entende “por que agora”, estrutura provável e score.
4. Decide abrir a empresa ou seguir o plano do dia.
5. Inteligência complementar permanece recolhida.

Status esperado: **OK** quando a decisão principal fica visível sem rolagem excessiva e há no máximo uma ação primária por bloco.

### Tela 2 — Leads

1. Usuário escolhe uma visão rápida: Todos, Abordar agora, FIDC ou DCM.
2. Pesquisa por nome, segmento ou sinal.
3. Cada card mostra: por que agora, estrutura provável e próxima ação.
4. Evidências e filtros avançados só aparecem por solicitação.
5. Usuário abre a decisão ou envia a empresa ao pipeline.

Status esperado: **OK** quando é possível comparar empresas sem interpretar uma tabela técnica extensa.

### Tela 3 — Pipeline

1. Usuário vê somente as etapas ativas.
2. Identifica deals em estruturação e bloqueios.
3. Alterna entre Quadro e Atenção.
4. Move uma oportunidade para o próximo estágio.
5. Etapas encerradas aparecem apenas quando acionadas.

Status esperado: **OK** quando o quadro padrão não mistura oportunidades ativas com histórico encerrado.

### Tela 4 — Pesquisar

1. Definir tese e universo.
2. Executar busca.
3. Revisar candidatas.
4. Promover empresas qualificadas para Leads.

Status esperado: **OK** quando o acesso ocorre pela quarta entrada principal e o usuário retorna naturalmente à fila de Leads.

### Tela 5 — Company Detail

1. Abrir decisão a partir de Hoje ou Leads.
2. Revisar tese, evidências, crédito e execução por abas.
3. Usar atalhos contextuais.
4. Retornar ao pipeline ou à fila.

Status esperado: **OK** quando as abas permanecem legíveis e não competem com o cabeçalho global.

## Fluxo operacional final

Pesquisar → Leads → Company Detail → Pipeline → Abordagem → Resultado

O dashboard “Hoje” funciona como ponto de retorno e não como um segundo sistema paralelo.

## Critérios de aceite

- quatro entradas principais no menu;
- nenhum módulo removido;
- trilho duplicado do fluxo removido;
- filtros avançados recolhidos por padrão;
- evidências recolhidas por padrão;
- etapas encerradas do pipeline recolhidas por padrão;
- controles técnicos fora da operação diária;
- navegação responsiva e acessível;
- TypeScript, build e contratos de qualidade aprovados;
- simulação sem tela em branco, overlay de erro ou erro de console;
- deploy produtivo somente após validação.
