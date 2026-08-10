# Sistema de Contratos de Exportação

Ver `ARCHITECTURE.md` para o blueprint completo. Estado atual: **Fase 1 — Autenticação** (ver seção 7).

## Rodando localmente (Docker)

```bash
cp .env.example .env
# edite .env se quiser trocar usuário/senha do Postgres e do admin inicial

docker compose up --build -d

# aplica o schema (primeira vez / após mudar prisma/schema.prisma)
docker compose exec api npx prisma migrate dev

# popula 1 organização + 1 usuário administrador
docker compose exec api npx prisma db seed
```

- API: http://localhost:3000/health
- Web: http://localhost:5173

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
