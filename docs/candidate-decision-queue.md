# Candidate Decision Queue

## Objetivo

Transformar a Capture Inbox em uma fila operacional de originação, sem confundir presença em fonte pública com identidade aprovada ou decisão de crédito.

## Filas

### Comercial
Emissores corporativos com evidência explícita de mercado de capitais. Hoje o principal caso é debênture emitida por empresa operacional.

Próxima ação padrão:

1. reconciliar website, domínio e razão social;
2. aprovar identidade humana;
3. validar funding gap, uso de recursos, estrutura atual e timing;
4. somente depois calcular qualification, patterns, score e pipeline.

### Identidade
Empresas descobertas que ainda não possuem CNPJ, domínio ou evidência jurídica suficiente.

### Mapa de estruturas
FIDCs, CRIs, CRAs, securitizadoras e intermediários. Esses registros são inteligência de mercado, não leads diretos.

Próxima ação padrão:

- identificar cedente, devedor, originador e lastro;
- cruzar regulamento, suplementos, atos, contratos e documentos da operação;
- criar candidata comercial somente quando a parte econômica for identificada com evidência.

### Promovidas
Entidades já vinculadas ao Company Master. A promoção não implica decisão de crédito; qualification continua em gate separado.

## Prioridade

O score de triagem utiliza somente evidências observáveis:

- papel econômico da entidade;
- CNPJ válido;
- website e domínio reconciliados;
- comprimento da evidência;
- confiança da captura;
- recência do evento;
- quantidade de eventos;
- volume observado;
- duplicidade e estado da candidata.

Não são inferidos faturamento, recebíveis, produto de crédito, funding gap ou fit FIDC/DCM sem evidência própria.

## Segurança

- view `security_invoker`;
- view e RPC acessíveis apenas ao `service_role`;
- frontend consome o backend autenticado;
- revisão de identidade continua fora do Data API do usuário;
- nenhum trigger aprova, promove ou torna uma empresa decision-eligible.

## Contratos

- View: `candidate_decision_queue_v1`
- RPC: `list_candidate_decision_queue`
- Endpoint: `GET /candidate-decision-queue`
- Tela: `/capture-inbox`
