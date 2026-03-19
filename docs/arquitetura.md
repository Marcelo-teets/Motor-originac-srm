# Arquitetura inicial

## Objetivo da arquitetura

A arquitetura inicial do projeto foi pensada para criar uma base simples, organizada e sustentável. A proposta é permitir evolução incremental sem introduzir complexidade antes da hora.

## Separação por camadas

A aplicação está organizada em camadas leves, com responsabilidades bem definidas:

- **API**: expõe endpoints HTTP e faz o contrato com o mundo externo;
- **Services**: concentra casos de uso e regras de aplicação;
- **Models**: define estruturas de dados e contratos de entrada/saída;
- **Core**: reúne configurações transversais, como logging;
- **Config**: centraliza a leitura de variáveis de ambiente;
- **Main**: cria a aplicação e compõe os módulos.

## Responsabilidade de cada pasta principal

### `src/motor_originacao/api`
Contém as rotas da API. Nesta etapa, abriga o endpoint de healthcheck.

### `src/motor_originacao/services`
Contém os serviços da aplicação. A pasta já prepara o terreno para a análise de propostas, mesmo com lógica ainda simples.

### `src/motor_originacao/models`
Contém os modelos do domínio e contratos de dados. O modelo de proposta foi criado para iniciar a estrutura do domínio de originação.

### `src/motor_originacao/core`
Contém recursos compartilhados pela aplicação, como a configuração de logging.

### `tests`
Contém os testes automatizados iniciais para garantir o comportamento básico da API.

## Diretrizes adotadas

- simplicidade antes de abstrações;
- nomes claros e código legível;
- separação mínima necessária para crescimento futuro;
- ausência de dependências e componentes desnecessários nesta fase.
