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
