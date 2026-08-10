# Search Entity Quality V9

## Objetivo

O V8 aumentou materialmente o recall do Quick Search, mas a observação de produção mostrou que parte dos resultados ainda carregava sujeitos editoriais ou trechos de manchetes como se fossem empresas e que a resolução fuzzy de nomes podia auto-vincular entidades incorretas ao Company Master.

O V9 corrige a camada de precisão e governança sem reduzir a amplitude do metabuscador.

## Evidência de produção que motivou a mudança

Após o V8, perfis que antes retornavam 0–5 candidatos passaram a executar cerca de 15 lentes e encontrar 28–37 correspondências por rodada. Ao mesmo tempo, a base registrou exemplos como:

- `Asaas faz 2º FIDC e`;
- `CloudWalk, dona da InfinitePay`;
- `Celcoin e Recargapay firmam parceria`;
- `Open Finance`;
- `Agência de Comunicação`;
- `Tendências`.

Também foi observado um falso auto-match real: `Tendências` foi marcado como deduped contra `Creditas` devido à antiga heurística de similaridade por sobreposição de caracteres.

## Mudanças

### 1. Normalização de entidade antes da persistência

`discoveryEntityNormalization.ts` transforma o sujeito bruto da manchete em uma identidade de empresa revisável antes de gerar o candidato.

Regras cobertas:

- apposições: `CloudWalk, dona da InfinitePay` → `CloudWalk`;
- aliases: `Provu, ex-Lendico` → `Provu`;
- descritores: `Fintech de energia solar, Solfácil` → `Solfácil`;
- tema + entidade: `FIDCs no agronegócio: Basf` → `Basf`;
- caudas verbais: `Asaas faz 2º FIDC e` → `Asaas`;
- parceria: `Celcoin e Recargapay firmam parceria` → dois candidatos, `Celcoin` e `Recargapay`;
- temas editoriais genéricos são rejeitados.

Toda transformação preserva `rawPayload.entityNormalization` com a identidade original, regra aplicada e versão `v9`.

### 2. Entity resolution fail-safe

Auto-link ao Company Master agora exige uma chave forte:

1. CNPJ exato;
2. domínio exato;
3. nome exato após normalização básica.

Similaridade fuzzy deixa de produzir auto-link. Ela pode voltar no futuro como sugestão para revisão humana, nunca como prova automática.

### 3. CNPJ preservado no candidato

`discoveryHitToCandidateDraft` agora mantém o CNPJ vindo da fonte e o inclui na `dedupe_key`, permitindo que o identificador mais forte tenha prioridade real.

### 4. Identidade editorial da fonte

Quando um resultado chega pelo transporte Google News, mas já foi corroborado por uma fonte governada do Source Catalog, o candidato passa a exibir a fonte editorial real. O transporte continua registrado no payload.

### 5. Quick Search one-off não vira monitoramento diário

Perfis `mode=quick-search` deixam de ser elegíveis ao scheduler por padrão. Só rodam recorrentemente se `scheduleEnabled=true` for explicitamente definido.

Isso separa:

- busca pontual de descoberta;
- monitoramento contínuo deliberado.

O perfil mestre e perfis avançados recorrentes continuam elegíveis normalmente.

## Quality Gate

Novo contrato `test:search-discovery-quality` cobre:

- normalização de manchetes;
- rejeição de temas genéricos;
- split de parcerias;
- promoção da fonte editorial corroborada;
- impossibilidade de `Tendências` auto-vincular a `Creditas`;
- match exato por nome, domínio e CNPJ;
- Quick Search manual-only no scheduler.

O contrato foi adicionado ao CI obrigatório antes dos typechecks e build.

## Governança preservada

O V9 não altera qualification, patterns, score ou ranking e não promove automaticamente nenhum candidato. O Capture Inbox e a revisão humana continuam como gate obrigatório antes de Company Master/Lead.
