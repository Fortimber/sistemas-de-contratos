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

## Testando RLS (Fase 1)

Este teste prova que o isolamento entre organizações funciona **no banco**,
não só no código da API: você vai ler uma tabela via SQL puro (sem passar
pela API, sem `.where()` de aplicação nenhum) e ver o Postgres recusar dado
de outra organização, mesmo pedindo por ele explicitamente.

Rode os comandos abaixo, na ordem, a partir da raiz do repositório (onde
está o `.env`). Todos os blocos `bash` são pra colar no seu terminal normal
(Git Bash, se estiver no Windows — o mesmo terminal usado pros comandos
`curl` acima).

### Passo 0 — descubra o id da sua organização real

```bash
docker compose exec postgres psql -U contratos -d sistema_contratos \
  -c "SELECT id, nome FROM organizacoes;"
```

**Resultado esperado:** uma linha, com um UUID na coluna `id` e o nome da
sua empresa (o que você configurou em `SEED_ORG_NOME`). Copie esse UUID —
vamos chamar ele de `<SUA_ORG_ID>` nos próximos passos.

### Passo 1 — criar uma organização + usuário de teste

Ids fixos e fáceis de reconhecer (`9999...` pra organização, `8888...` pro
usuário), pra não confundir com dado real depois.

```bash
docker compose exec -T postgres psql -U contratos -d sistema_contratos <<'EOF'
INSERT INTO organizacoes (id, nome, criado_em)
VALUES ('99999999-9999-9999-9999-999999999999', 'Empresa Teste RLS', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO usuarios (id, organizacao_id, login, email, senha_hash, nome_completo, perfil_acesso, deve_trocar_senha, criado_em, atualizado_em)
VALUES ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'usuario-teste-rls', 'teste-rls@example.com', 'hash-nao-usado-neste-teste', 'Usuario Teste RLS', 'Administrador', false, now(), now())
ON CONFLICT (id) DO NOTHING;

SELECT 'organizacao e usuario de teste criados' AS status;
EOF
```

**Resultado esperado:** duas linhas `INSERT 0 1`, seguidas de uma tabela com
`organizacao e usuario de teste criados`. (Esse comando roda como
`contratos`, o role administrativo — não é o caminho que a API usa de
verdade, é só pra preparar o cenário do teste.)

### Passo 2 — entrar no banco como o mesmo role que a API usa (`app_runtime`)

```bash
export $(grep -E '^APP_DB_PASSWORD=' .env | xargs)
docker compose exec -e PGPASSWORD="$APP_DB_PASSWORD" postgres psql -h localhost -U app_runtime -d sistema_contratos
```

**Resultado esperado:** o prompt muda pra `sistema_contratos=>` — você está
agora dentro de uma sessão `psql` interativa, conectado como `app_runtime`
(o role restrito, sem `SUPERUSER`/`BYPASSRLS`, sujeito à RLS igual a API é).
Deixe essa janela aberta pros próximos dois passos.

### Passo 3 — tentar ler o usuário de teste a partir do contexto da SUA empresa (esperado: vazio)

Cole o bloco abaixo **dentro do prompt `psql` aberto no Passo 2**,
substituindo `<SUA_ORG_ID>` pelo UUID que você copiou no Passo 0:

```sql
BEGIN;
SELECT set_config('app.current_organizacao_id', '<SUA_ORG_ID>', true);
SELECT id, login, organizacao_id FROM usuarios WHERE organizacao_id = '99999999-9999-9999-9999-999999999999';
ROLLBACK;
```

**Resultado esperado:** `(0 rows)` na segunda consulta. Repare que o
`WHERE organizacao_id = '99999999-...'` está pedindo explicitamente o
usuário da organização de teste — não tem filtro por engano nem falta de
filtro aqui. Mesmo assim, zero linhas: o Postgres barrou a leitura porque o
`set_config` diz que o contexto atual é a SUA organização, não a de teste.
Isso é o Postgres decidindo, não a query.

### Passo 4 — trocar o contexto pra organização de teste (esperado: aparece)

Ainda no mesmo prompt `psql`:

```sql
BEGIN;
SELECT set_config('app.current_organizacao_id', '99999999-9999-9999-9999-999999999999', true);
SELECT id, login, organizacao_id FROM usuarios WHERE organizacao_id = '99999999-9999-9999-9999-999999999999';
ROLLBACK;
```

**Resultado esperado:** `(1 row)`, com `login = usuario-teste-rls` e
`organizacao_id = 99999999-9999-9999-9999-999999999999`. Mesma query de
antes, único que mudou foi o `set_config` — prova que não é "sempre vazio",
é isolamento de verdade por organização.

Digite `\q` e Enter pra sair do `psql`.

> **Se o Passo 3 retornar 1 linha em vez de 0:** algo está errado com a RLS
> (policy removida, `FORCE` desabilitado, ou a API voltou a usar o role
> `contratos` em vez de `app_runtime`) — vale investigar antes de confiar
> no isolamento entre organizações.

### Passo 5 — limpar a organização de teste

```bash
docker compose exec -T postgres psql -U contratos -d sistema_contratos <<'EOF'
DELETE FROM usuarios WHERE id = '88888888-8888-8888-8888-888888888888';
DELETE FROM organizacoes WHERE id = '99999999-9999-9999-9999-999999999999';
SELECT 'org e usuario de teste removidos' AS status;
EOF
```

**Resultado esperado:** duas linhas `DELETE 1`, seguidas de
`org e usuario de teste removidos`. Depois disso o banco volta a ter só a
sua organização real e o usuário admin do seed.

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
