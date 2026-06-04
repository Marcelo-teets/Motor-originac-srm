# Search Profile Runtime Handoff

## Objetivo

Conectar o fluxo de Search Profiles ao runtime institucional de captura sem reabrir arquitetura.

Fluxo alvo:

Search Profile -> Sources -> Monitoring -> Raw Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Score -> Ranking -> Pipeline

## Estado atual

- `POST /search-profiles/:id/run` executa descoberta de candidatos.
- `promoteCandidate` cria ou deduplica empresa.
- Após promoção, o serviço aciona hooks de monitoring e recompute quando existem.
- Esse caminho ainda pode cair no fluxo legado de monitoring.

## Caminho correto

Após #105 e #106, substituir o hook legado por chamada ao `CaptureRuntimeService` para a empresa promovida, com trigger orquestrado e razão operacional de promoção de candidato.

## Critérios de aceite

- promoção de candidato gera empresa ou deduplica com empresa existente;
- run institucional roda para a empresa promovida;
- response do runtime possui `operational.status`, `decision` e `nextAction`;
- `source_connector_runs` recebe linha com razão da promoção;
- novos outputs, signals e enrichments alimentam qualification, patterns e ranking.

## Observação

O arquivo `backend/src/server.ts` é grande e a substituição total foi bloqueada pelo conector por segurança. A alteração deve ser aplicada de forma cirúrgica depois que a cadeia #96 -> #106 estiver mergeada.
