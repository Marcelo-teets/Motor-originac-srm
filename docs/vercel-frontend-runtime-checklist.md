# Frontend Runtime Checklist for Vercel

## Objetivo
Garantir que um deploy marcado como READY no Vercel tambem esteja funcional em runtime.

## Validacoes minimas
1. autenticar sem erro de rede
2. carregar dashboard
3. carregar companies
4. abrir company detail
5. abrir MVP Ops

## Observacao operacional
Build verde e deploy READY nao bastam.
O frontend precisa estar ligado ao backend e ao runtime esperado do projeto.

## Regra de uso
Sempre validar esse checklist apos mudancas de deploy, branch strategy, preview ou ajuste de ambiente.
