# Candidate Coverage Routing — Cadastro CVM

## Objetivo

Separar força do trigger de responsabilidade de cobertura. Uma emissão recorrente pode ser relevante sem pertencer ao core ICP do Motor.

## Fonte

- Dataset: Cias Abertas — Informação Cadastral
- Provedor: CVM
- Recurso: `cad_cia_aberta.csv`
- Periodicidade oficial: diária
- Chave: CNPJ

## Universo processado

Somente candidatas canônicas das filas:

- `commercial`;
- `identity`.

FIDC, CRI, CRA e intermediários continuam em `market_map` e não entram no enrichment jurídico comercial.

## Coverage lanes v3

- `institutional_dcm`: CNPJ encontrado no cadastro oficial de companhias abertas;
- `dcm_unclassified`: trigger comercial real, mas sem evidência oficial suficiente para core ICP ou middle market;
- `identity`: identidade jurídica insuficiente;
- `market_map`: veículo ou intermediário;
- `promoted`: entidade já vinculada ao Company Master.

`institutional_dcm` não significa empresa grande, boa, ruim ou elegível a crédito. Significa apenas que o CNPJ consta no cadastro oficial de companhias abertas e deve ser roteado para cobertura institucional até análise adicional.

## Guardrails

- nenhuma promoção automática;
- nenhuma alteração de qualification, patterns, lead score ou pipeline;
- nenhuma inferência de receita, porte ou recebíveis;
- evidência persistida em tabela separada com lineage;
- checkpoint por versão do recurso + fingerprint do universo-alvo;
- view e RPC acessíveis somente ao backend com service role.

## Operação

- Workflow: `Candidate CVM Registry Enrichment`
- Owner canary: issue exata `[candidate-enrichment-run] cvm-open-companies`
- Agenda: dias úteis, após a atualização diária da CVM.
