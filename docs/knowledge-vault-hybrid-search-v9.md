# Knowledge Vault V9 — Busca institucional híbrida

## Objetivo

Permitir que o time recupere evidências do motor por palavra e significado, com filtro por empresa, fonte identificada e lineage explícito.

A V9 responde:

1. quais sinais e registros sustentam uma tese;
2. em qual empresa e tabela oficial a evidência está;
3. se o resultado veio do índice lexical, semântico ou dos dois;
4. qual registro pode ser copiado para uma nota, briefing ou análise;
5. como continuar operando quando o provedor de embeddings estiver indisponível, sem fabricar vetores.

## Fluxo

```text
consulta humana
→ Edge Function autenticada
→ query embedding real Voyage 3.5 1024d, quando disponível
→ knowledge_hybrid_search
→ lexical + vector candidates
→ Reciprocal Rank Fusion
→ resultado com empresa + fonte + lineage
→ copiar contexto para nota / tese / briefing
```

Fallback:

```text
Voyage indisponível ou sem secret
→ query embedding = null
→ busca lexical em português
→ modo lexical sinalizado na UI
→ syntheticEmbedding = false
```

## Banco de dados

Migration:

```text
db/migrations/097_knowledge_hybrid_search_v9.sql
```

Projeto oficial:

```text
hdghpmssudrqhsbvrdyt
```

### RPC `knowledge_hybrid_search`

A função:

- exige `auth.uid()`;
- roda como `security invoker`;
- respeita o RLS de `vector_documents`;
- aceita consulta de 2 a 500 caracteres;
- limita o retorno entre 1 e 30 resultados;
- usa full-text search em português;
- usa similaridade vetorial somente quando recebe embedding real de 1024 dimensões;
- combina rankings com Reciprocal Rank Fusion;
- pode filtrar por `company_id`;
- devolve fonte, registro, empresa, natureza observada/inferida, confiança e scores de recuperação;
- não escreve em nenhuma tabela de decisão.

Corpus observado na implantação:

- 2.541 documentos institucionais;
- 230 documentos com embeddings reais persistidos;
- dimensão oficial do corpus vetorial: 1.024.

### Hardening

A migration remove execução de `PUBLIC` e `anon` das funções:

- `knowledge_hybrid_search`;
- `match_vector_documents`;
- `match_vector_documents_hybrid`;
- `match_vector_documents_lexical`.

Execução explícita permanece apenas para:

- `authenticated`;
- `service_role`.

## Edge Function

Arquivo:

```text
supabase/functions/knowledge-hybrid-search/index.ts
```

Deploy:

```text
knowledge-hybrid-search
verify_jwt = true
```

Comportamento:

- exige Bearer token;
- usa o JWT do usuário ao chamar a RPC, preservando RLS;
- gera query embedding com `voyage-3.5`, `input_type=query` e 1.024 dimensões;
- não persiste query embedding;
- não envia service role ao navegador;
- em falha do provedor, registra o motivo e executa busca lexical;
- nunca gera embedding aleatório ou determinístico falso.

O modelo `voyage-3.5` foi mantido para compatibilidade com os vetores existentes. Troca de série exige reindexação integral do corpus e não deve misturar vetores incompatíveis.

## Produto

Rota:

```text
/knowledge-search
```

Menu:

```text
Execução comercial → Busca do Vault
```

A tela oferece:

- consulta em linguagem natural;
- filtro opcional por empresa;
- sugestões ligadas aos patterns do motor;
- contagem do corpus no escopo;
- indicação explícita de modo híbrido ou lexical;
- modelo e dimensão usados;
- aviso de fallback;
- ranking lexical, semântico e RRF;
- empresa, tipo de sinal, natureza e fonte;
- cópia de contexto em Markdown com lineage;
- link para Company Detail.

## Guardrails

- busca é observacional;
- relevância de recuperação não é score de crédito;
- nenhum resultado altera lead score, qualification, patterns, ranking, pipeline ou decisão;
- nenhuma inferência é promovida a fato;
- nenhuma evidência é criada automaticamente no Vault;
- nenhuma chave é exposta ao frontend;
- nenhum embedding mockado é aceito.

## Validação no Supabase real

Smoke autenticado lexical:

```text
consulta: descasamento de capital e necessidade de funding
modo: lexical
corpus: 2.541
embeddings persistidos: 230
resultados: 5
primeira evidência: funding_gap_signal / Neon Receivables
lineage: company_signals + source_id + vector_document_id
```

Smoke autenticado híbrido com embedding real já persistido:

```text
modo: hybrid
semanticAvailable: true
resultados: 5
semanticSimilarity do primeiro resultado: 1.0
lineage preservado
rollback sem escrita
```

## Critérios de aceite

- [x] migration aplicada no Supabase real;
- [x] RPC autenticada e security invoker;
- [x] helpers antigos bloqueados para anon;
- [x] busca lexical validada com dados reais;
- [x] fusão híbrida validada com vetor real;
- [x] Edge Function implantada com verify_jwt;
- [x] fallback lexical sem vetor sintético;
- [x] frontend implementado;
- [x] filtro por empresa e lineage visível;
- [ ] CI da PR funcional;
- [ ] preview Vercel;
- [ ] merge na main;
- [ ] produção canônica validada.

## Próxima evolução

A próxima fatia deve automatizar a cobertura de embeddings dos documentos lexicais pendentes, com fila, retries, versionamento do modelo e métricas de cobertura. Nenhum documento deve ser considerado semanticamente indexado sem embedding real e metadata de modelo.
