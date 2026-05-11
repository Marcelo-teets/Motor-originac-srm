# Runbook — sync entre `auth.users` e `public.users`

## Objetivo
Garantir que o usuário autenticado no Supabase Auth também exista em `public.users` com o mesmo `id`, reduzindo atrito nas tabelas operacionais que ainda referenciam `users(id)`.

## Quando aplicar
Aplicar após a migration 015 e antes de validar definitivamente Watch List, ownership comercial e demais rotas operacionais que usam `users(id)`.

## Ordem sugerida no SQL Editor
1. `013_watchlist_mvp.sql`
2. `014_rls_runtime_core.sql`
3. `015_origination_command_center_views.sql`
4. `016_public_users_auth_sync.sql`

## O que a migration 016 faz
- cria função `public.sync_public_user_from_auth()`
- cria trigger em `auth.users`
- faz backfill dos usuários já existentes em `auth.users`

## Verificações rápidas
```sql
select count(*) as public_users from public.users;
select count(*) as auth_users from auth.users;

select u.id, u.email, u.auth_provider
from public.users u
order by u.created_at desc
limit 20;
```

## Verificação de alinhamento por ID
```sql
select au.id, au.email
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;
```

Resultado esperado:
- zero linhas faltantes para usuários autenticados relevantes.

## Atenção
Se existir legado com mesmo email em `public.users` mas com `id` diferente do `auth.users.id`, revisar manualmente antes de aplicar em produção.
