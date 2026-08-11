# Sistema de Contratos de Exportação

Ver `ARCHITECTURE.md` para o blueprint completo. Estado atual: **Fase 1 — Autenticação** (ver seção 7).

## Rodando localmente (Docker)

```bash
cp .env.example .env
# edite .env se quiser trocar usuário/senha do Postgres e do admin inicial

docker compose up --build -d

# aplica o schema (primeira vez / após mudar prisma/schema.prisma)
docker compose exec api npx prisma migrate dev

# define a senha do role de runtime da API (não fica em migration — migrations
# são commitadas no git, senha não pode ir junto). Repita sempre que o valor
# de APP_DB_PASSWORD no seu .env mudar, ou após um `prisma migrate reset`.
docker compose exec postgres psql -U contratos -d sistema_contratos
# dentro do psql, substituindo pelo valor de APP_DB_PASSWORD do seu .env:
#   ALTER ROLE app_runtime PASSWORD 'valor-de-APP_DB_PASSWORD';
#   \q

# popula 1 organização + 1 usuário administrador
docker compose exec api npx prisma db seed
```

### Role de runtime da API (RLS — Fase 1)

A API usa **dois** roles Postgres:

- `contratos` (`DATABASE_URL`) — o superuser bootstrap do container (criado
  pelo `POSTGRES_USER` da imagem oficial). Usado só para rodar migrations e,
  em `auth.service.ts`, para localizar o usuário pelo `login` **antes** de
  saber a organização (não existe contexto de tenant ainda nesse ponto).
- `app_runtime` (`APP_DATABASE_URL`) — role restrito, sem `SUPERUSER`/
  `BYPASSRLS`, criado pela migration `add_row_level_security`. É o role que
  `request.db` de fato usa para servir dado de negócio.

Essa separação existe porque superusers (e qualquer role com `BYPASSRLS`)
**ignoram Row-Level Security incondicionalmente**, mesmo em tabelas com
`FORCE ROW LEVEL SECURITY` — `FORCE` só afeta o dono da tabela, não
superusers. Se a API servisse dado de negócio conectada como `contratos`, a
RLS adicionada nessa migration seria inerte (ver comentários na própria
migration e em `lib/prisma.ts`).

- API: http://localhost:3000/health
- Web: http://localhost:5173

> **Nota (Windows + Docker Desktop):** o hot-reload (`tsx watch`) às vezes não
> percebe mudanças de arquivo feitas por ferramentas rodando no Windows (fora
> do WSL) — a notificação de mudança de arquivo entre o bind mount e o
> container pode falhar silenciosamente. Se editar código e o comportamento
> não mudar, confirme com `docker compose logs api --tail 20` se houve
> reload; se não houve, `docker compose restart api` força a releitura.

## Testando o login (Fase 1)

```bash
# login com o admin criado pelo seed (login/senha vêm do .env)
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","senha":"troque-esta-senha"}'
# -> { accessToken, refreshToken, usuario: {...} }

# rota protegida — precisa do accessToken no header Authorization
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <accessToken>"

# renovar o access token quando expirar (padrão: 15 min)
curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Sem o header `Authorization`, ou com um `accessToken` inválido/expirado, `/auth/me`
responde `401`. As rotas protegidas ficam registradas em
`apps/api/src/plugins/protected-context.ts` — quem entra ali automaticamente
passa por autenticação (JWT) e tenant-scoping (Prisma filtrado por
`organizacaoId` do usuário logado), sem precisar repetir isso rota a rota.

## Sessões e revogação de refresh token

Cada refresh token emitido vira uma linha em `refresh_tokens` (tabela
`RefreshToken`), com um `jti` único. Isso permite revogar sessões de verdade
— algo que um JWT puro, sozinho, não permite.

```bash
# logout — revoga a sessão referente a ESSE refresh token específico
# (rota protegida: precisa do accessToken também)
curl -s -i -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"refreshToken":"<refreshToken>"}'
# -> 204 No Content
```

Regras aplicadas em `POST /auth/refresh`:

- **Rotação**: a cada refresh bem-sucedido, o refresh token usado é marcado
  como revogado (`revogado_em`) e um novo é emitido — o antigo nunca mais
  funciona, mesmo antes de expirar.
- **Reuso de token revogado = sinal de roubo**: se um `jti` já revogado for
  apresentado de novo em `/auth/refresh`, a API revoga **todas** as sessões
  ativas daquele usuário (não só a reutilizada) e responde `401`. Isso cobre
  o cenário clássico de token roubado sendo usado em paralelo pelo dono
  legítimo e pelo atacante.
- Um `refreshToken` inválido, expirado ou de sessão já encerrada por logout
  também responde `401`.

Para reproduzir o cenário de roubo manualmente: faça login, dê um refresh
(ganha um par novo de tokens), depois tente reusar o **refresh token
original** (o de antes da rotação) — a API derruba a sessão nova também,
mesmo essa nunca tendo sido comprometida, porque não há como distinguir
"dono legítimo tentando reusar por engano" de "atacante com o token antigo"
depois que a rotação já aconteceu uma vez.

## Estrutura

```
apps/api/
  src/
    lib/          # prisma client, jwt sign/verify
    middleware/   # auth, tenant-scoping, roles
    modules/      # um módulo por entidade (auth, ... contratos na Fase 2+)
    plugins/      # protected-context (hooks centrais de auth+tenant-scoping)
apps/web/              # React + Vite
packages/shared-types/ # types compartilhados (ainda vazio na Fase 0)
```
