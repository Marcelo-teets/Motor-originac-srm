# Expansão de fontes públicas — Origination Intelligence Platform

Implementação planejada para ampliar fontes públicas Brasil-only no motor de originação.

## Fontes mapeadas

1. CVM Dados Abertos — Informe Mensal FIDC.
2. CVM Dados Abertos — Cadastro de Fundos.
3. CVM Dados Abertos — FRE Companhias Abertas.
4. CVM Dados Abertos — Ofertas Públicas.
5. Banco Central Dados Abertos — busca institucional.
6. Banco Central Dados Abertos — IFData/SFN.
7. Banco Central Dados Abertos — participantes SFN.
8. dados.gov.br — busca por empresa/CNPJ.
9. PNCP — contratos públicos por fornecedor.
10. INPI Dados Abertos — PI, marcas, software e patentes.
11. Comex Stat — comércio exterior.
12. Open Finance Brasil — diretório público.
13. Finsiders — fintech/crédito/funding.
14. Startups.com.br — rodadas, funding e expansão.
15. Brazil Journal — capital e growth.
16. NeoFeed — tecnologia, capital e expansão.
17. Pipeline Valor — DCM, debêntures, FIDC, CRI e CRA.
18. Exame Future of Money — fintechs.
19. Baguete — tecnologia B2B.
20. Mobile Time — pagamentos/Pix/wallets.
21. Hiring público — vagas de crédito, risco, cobrança e funding.
22. Documentos públicos — FIDC, debênture, nota comercial e securitização.
23. Termos públicos de produto — crédito, parcelamento, antecipação.
24. Decks/apresentações públicas.
25. Documentação pública de API financeira.
26. Monashees Portfolio.
27. Canary Portfolio.
28. Kaszek Portfolio.
29. Valor Capital Group Portfolio.
30. Astella Portfolio.
31. ONEVC Portfolio.
32. Upload Ventures Portfolio.
33. DDD Portfolio.
34. CEIS/CNEP — planejado, desligado até endpoint oficial.
35. PGFN Dívida Ativa — planejado, desligado até endpoint oficial.

## Classes

- `regulatory`: CVM, BCB, INPI.
- `public_procurement`: PNCP.
- `public_dataset`: dados.gov.br.
- `news_niche`: veículos setoriais.
- `jobs`: hiring público.
- `document_discovery`: documentos e termos públicos.
- `vc_portfolio`: portfólios de fundos.
- `planned_compliance`: fontes que exigem validação de endpoint/termos.

## Regras de captura

- Priorizar API pública, RSS, diretório público e página institucional.
- Toda captura deve gerar origem, URL, timestamp, status do conector e payload normalizado.
- Falha de fonte deve virar `partial`, nunca derrubar o runtime.
- LinkedIn não deve ser raspado sem via autorizada; usar API, export ou parceiro permitido.
