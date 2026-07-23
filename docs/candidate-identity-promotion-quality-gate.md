# Candidate Identity & Promotion Quality Gate

## Problema corrigido

A fila de discovery continha 10 nomes capturados em páginas de portfólio. O template do Search Profile havia preenchido geografia, segmento, produto de crédito e estrutura-alvo sem evidência individual. Dois nomes — Creditas e drconsulta — também haviam sido deduplicados contra empresas sintéticas da seed inicial.

Discovery confirma presença em uma fonte; não confirma identidade jurídica, produto de crédito, recebíveis ou fit para FIDC.

## Regras ativas

Uma candidata só pode ser finalizada como `promoted` quando atende simultaneamente:

1. CNPJ com checksum válido;
2. website disponível;
3. domínio normalizado;
4. URL de evidência de identidade registrada;
5. razão social verificada;
6. `identity_review_status = approved`;
7. confiança mínima de 70%;
8. evidência textual suficiente;
9. vínculo com Company Master real e elegível.

O bloqueio existe no banco, no serviço e na interface.

## Correção dos dados existentes

- vínculos com Company Master inelegível foram removidos;
- Creditas e drconsulta voltaram para `captured`;
- classificações genéricas de fintech/FIDC foram anuladas;
- 10 candidatas receberam blockers auditáveis;
- nenhuma candidata atual está pronta para promoção;
- 2 violações de vínculo inválido e 10 violações de identidade incompleta foram registradas.

## Banco

Funções service-role:

```sql
public.is_valid_cnpj_checksum(text)
public.candidate_identity_blockers(...)
public.candidate_promotion_blockers(...)
public.candidate_promotion_readiness(uuid)
```

Trigger:

```text
discovered_candidate_identity_quality_guard
```

O trigger desfaz dedupe contra empresa inelegível e rejeita promoção incompleta com SQLSTATE `23514`.

## Backend

`SearchProfileCaptureService.promoteCandidate()` deixou de criar uma empresa a partir de nome capturado. A operação agora apenas finaliza uma candidata já revisada e ligada a um Company Master elegível.

Chamadas bloqueadas retornam HTTP `422` com a lista de blockers.

## Capture Inbox

A tela mostra:

- identidade e CNPJ;
- domínio;
- fonte e evidência;
- blockers traduzidos;
- quantidade pronta para promoção;
- botão desabilitado até todos os gates serem atendidos.

## Próxima etapa

Criar o workflow revisado de identidade que enriquece CNPJ/domínio, registra evidência, recebe aprovação humana e cria/vincula a empresa real em uma transação controlada. Até essa etapa, promoção permanece bloqueada por desenho.
