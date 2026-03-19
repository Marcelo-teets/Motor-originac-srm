# API do Motor Originação SRM

## Endpoints

### Health
- `GET /health`

### Companies
- `POST /companies`
- `GET /companies`
- `GET /companies/{company_id}`
- `GET /companies/{company_id}/signals`

### Sources
- `GET /sources`
- `POST /sources`

### Signals
- `POST /signals`
- `GET /signals`
- `GET /signals/{signal_id}`

### Scores
- `GET /scores/{company_id}`
- `GET /scores/{company_id}/history`

### Thesis
- `GET /thesis/{company_id}`

### Market Map
- `GET /market-map/{company_id}`

## Exemplo de payloads

### Criar empresa
```json
{
  "nome": "Empresa Exemplo LTDA",
  "cnpj": "12.345.678/0001-90"
}
```

### Criar sinal
```json
{
  "company_id": "cmp_123",
  "source_id": "src_456",
  "tipo": "positivo",
  "titulo": "Receita sem pendências",
  "descricao": "Consulta cadastral limpa.",
  "intensidade": 4
}
```

### Criar fonte customizada
```json
{
  "nome": "Diário Oficial do Estado",
  "categoria": "regulatoria",
  "confiabilidade": "high",
  "ativa": true,
  "pais": "BR"
}
```
