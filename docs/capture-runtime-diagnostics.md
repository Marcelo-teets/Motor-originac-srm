# Capture Runtime Diagnostics

## Objetivo

Padronizar a leitura operacional dos endpoints de captura do Motor Originação, principalmente:

- `POST /api/data-capture/run`
- `POST /api/data-capture/cron/run`
- futuros endpoints Express de monitoring conectados ao `CaptureRuntimeService`

O runtime deve responder se a captura foi realmente persistida, parcialmente persistida ou se falhou.

## Campos obrigatórios no response

```json
{
  "status": "real",
  "generatedAt": "2026-06-04T00:00:00.000Z",
  "operational": {
    "status": "real",
    "httpStatus": 200,
    "decision": "Captura persistida",
    "nextAction": "Usar outputs, sinais e enrichments em qualification, patterns, ranking e tese."
  },
  "data": {
    "requested": {},
    "companiesProcessed": 8,
    "outputsCollected": 40,
    "persisted": {
      "runsWritten": 24,
      "outputsWritten": 40,
      "signalsWritten": 35,
      "enrichmentsWritten": 8
    }
  }
}
```

## Validação offline

Após executar um run e salvar o JSON de response:

```bash
node scripts/smoke/validate-capture-runtime-payload.mjs capture-runtime-response.json
```

Ou via stdin:

```bash
cat capture-runtime-response.json | node scripts/smoke/validate-capture-runtime-payload.mjs
```

## Critérios operacionais

- `200`: persistência real e captura com evidência.
- `207`: execução parcial, sem evidência nova, sem empresa processada ou com erros de persistência.
- `500`: falha de execução.

## Por que isso importa

A originação institucional não pode depender de captura caixa-preta. Cada run precisa dizer:

1. processou empresas?
2. coletou outputs?
3. persistiu no Supabase?
4. gerou signals/enrichments?
5. pode alimentar qualification, patterns, ranking e tese?

Esse padrão transforma captura em um componente auditável da plataforma.
