# Sistema de Contratos de Exportação

Ver `ARCHITECTURE.md` para o blueprint completo. Estado atual: **Fase 3 — Módulos setoriais completa** (Produção, Ambiental, Logística e Financeiro; ver seção 7). Próxima: Fase 4 (auditoria/histórico).

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

Dois tokens, dois lugares diferentes — de propósito:

- **`accessToken`**: volta no corpo JSON de `/auth/login` e `/auth/refresh`.
  O frontend guarda em memória (variável JS, nunca em `localStorage` nem em
  cookie legível por JS) e manda em `Authorization: Bearer <accessToken>` em
  toda chamada às rotas protegidas. Vida curta (padrão 15 min) — se vazar
  (XSS, log, etc.), o estrago tem prazo de validade.
- **`refreshToken`**: NUNCA aparece no corpo JSON. Vem só como cookie
  `httpOnly` (`Set-Cookie`, `path=/auth`), então nenhum JavaScript no
  navegador consegue ler o valor — só o próprio navegador reenvia a cookie
  automaticamente pras rotas de auth. Atributos da cookie: `HttpOnly`,
  `SameSite=Strict`, `Secure` (só quando `NODE_ENV=production` — em dev a
  API roda em `http://localhost`, e `Secure` bloquearia o navegador de
  devolver a cookie nesse caso), `Max-Age` de 7 dias.

```bash
# login com o admin criado pelo seed (login/senha vêm do .env). -c salva a
# cookie recebida (refreshToken) num cookie jar local do curl, -b reenvia.
curl -s -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","senha":"troque-esta-senha"}'
# -> { accessToken, usuario: {...} } — SEM refreshToken no corpo

# rota protegida — precisa do accessToken no header Authorization
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <accessToken>"

# renovar o access token quando expirar (padrão: 15 min) — sem body, o
# refreshToken vem da cookie (-b reenvia a que foi salva no login)
curl -s -c cookies.txt -b cookies.txt -X POST http://localhost:3000/auth/refresh
# -> { accessToken, usuario: {...} } — de novo sem refreshToken no corpo, e
#    com uma NOVA cookie refreshToken (rotação, ver seção seguinte)
```

Sem o header `Authorization`, ou com um `accessToken` inválido/expirado, `/auth/me`
responde `401`. As rotas protegidas ficam registradas em
`apps/api/src/plugins/protected-context.ts` — quem entra ali automaticamente
passa por autenticação (JWT) e tenant-scoping (Prisma filtrado por
`organizacaoId` do usuário logado), sem precisar repetir isso rota a rota.

CORS está configurado com `credentials: true` e `origin` explícita
(`WEB_ORIGIN`, nunca `"*"` — o navegador rejeita `credentials: true` junto
com origin coringa) em `apps/api/src/server.ts`, exigido pra cookie
cross-origin funcionar entre API e frontend em portas diferentes. O
frontend precisa mandar `credentials: "include"` em todo `fetch`/`axios`
pras rotas de `/auth/*` pra cookie ir e voltar.

## Sessões e revogação de refresh token

Cada refresh token emitido vira uma linha em `refresh_tokens` (tabela
`RefreshToken`), com um `jti` único. Isso permite revogar sessões de verdade
— algo que um JWT puro, sozinho, não permite.

```bash
# logout — revoga a sessão referente ao refreshToken da cookie atual
# (rota protegida: precisa do accessToken também) e limpa a cookie na resposta
curl -s -i -b cookies.txt -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <accessToken>"
# -> 204 No Content, com Set-Cookie limpando refreshToken (Max-Age=0)
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

### Smoke test automatizado (Fase 1)

`apps/api/scripts/smoke-test-fase1-cookie-auth.ts` cobre o fluxo de
autenticação por cookie de ponta a ponta: login (`accessToken` no JSON,
`refreshToken` só na cookie httpOnly), refresh usando a cookie capturada
(confirma a rotação), logout (cookie limpa na resposta), refresh reenviando
de propósito a cookie antiga/revogada depois do logout (`401`), e refresh
sem cookie nenhuma (`401`). Foi o primeiro smoke test a lidar com cookie —
o cliente HTTP compartilhado (`scripts/smoke-test-helpers.ts`) ganhou um
cookie jar simples pra isso, reutilizável por qualquer script futuro que
precise.

```bash
docker compose exec api npm run smoke:fase1-cookie-auth
```

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

## Tabelas de referência e contratos (Fase 2)

Todas as rotas abaixo são protegidas (precisam do header
`Authorization: Bearer <accessToken>`, igual `/auth/me`) e já respondem só
com dado da organização do usuário logado — filtro de aplicação (Fase 1) +
RLS do Postgres (Fase 1, seção "Testando RLS" acima). Não é preciso passar
`organizacaoId` em nenhum body: quem preenche é o servidor.

**Permissões:** leitura (`GET`) é liberada pra qualquer perfil autenticado.
Escrita (`POST`/`PATCH`/`DELETE`) é restrita aos perfis `Administrador` e
`Comercial` — os demais (`Operacional`, `Financeiro`, `Ambiental`) recebem
`403` ao tentar escrever. A escrita específica de cada setor
(`detalhes_producao`/`ambiental`/`logistica`/`financeiro`) é Fase 3, ainda
não existe.

### Tabelas de referência

Mesmo shape de rotas pra `especies`, `produtos`, `importadores`,
`representantes` e `status-contrato` (o path usa hífen, a tabela no banco é
`status_contrato`):

```bash
GET    /especies              # lista paginada — ?page=1&pageSize=20
GET    /especies/:id
POST   /especies               # { "nomeEspecie": "..." }
PATCH  /especies/:id           # body parcial — qualquer subconjunto dos campos
DELETE /especies/:id
```

O mesmo padrão vale pra:

- `/produtos` — body `{ nomeProduto, especieId }`. `especieId` precisa
  existir e ser da sua organização (senão `400`, não `500`).
- `/importadores` — body `{ nomeRazaoSocial, pais, email }`.
- `/representantes` — body `{ nomeRepresentante, email }`.
- `/status-contrato` — body `{ nomeStatus, setorResponsavel, ordem }`, onde
  `setorResponsavel` é um de `Comercial | Produção | Ambiental | Financeiro
  | Logística`.

`especies` e `status-contrato` têm nome único por organização — criar ou
editar pra um nome já usado responde `409`, não erro bruto do Postgres.

`DELETE` em qualquer uma dessas responde `409` com mensagem clara se o
registro ainda estiver referenciado por algum contrato (ex.: apagar uma
espécie que tem produto cadastrado, ou um importador com contrato ativo) —
em vez de deixar vazar a violação de foreign key do Postgres.

### Contratos

```bash
GET  /contratos                          # paginado
GET  /contratos?statusId=<id>            # filtro por status
GET  /contratos?importadorId=<id>        # filtro por importador (combináveis)
GET  /contratos/:id                      # inclui importador/representante/produto/status populados
POST /contratos
PATCH /contratos/:id
```

Body de `POST /contratos` (todos os campos abaixo são obrigatórios, exceto
os opcionais indicados):

```json
{
  "numeroContrato": "CT-2026-001",
  "importadorId": "...",
  "representanteId": "...",
  "produtoId": "...",
  "statusId": "...",
  "contratoPaiId": "...",             // opcional — usar em aditivos
  "tipoContrato": "Original",         // "Original" | "Aditivo"
  "dataContrato": "2026-01-15",
  "volumeM3": 120.5,
  "qtdContainers": 5,
  "local": "Belém",
  "tipoFrete": "FOB",                 // "FOB" | "CFR" | "CIF"
  "requerFumigacao": false,           // opcional, default false
  "certificacaoProcessoOrigem": false,// opcional, default false
  "requerCites": false,               // opcional, default false
  "requerFsc": false,                 // opcional, default false
  "comissaoPct": 2.5,                 // opcional
  "comissaoMetragem": 10,             // opcional
  "valorTotalUsd": 45000,
  "moedaValorTotal": "USD",
  "modalidadePgtContaBrasil": "À vista",
  "modalidadePgtContaExterior": "À vista"
}
```

- `importadorId`, `representanteId`, `produtoId`, `statusId` e
  `contratoPaiId` (se enviado) são validados **antes** do insert — cada um
  precisa existir e pertencer à sua organização, senão a resposta é `400`
  identificando o campo problemático (`{ "message": "O campo \"produtoId\"
  não existe ou não pertence à sua organização." }`), nunca um `500` cru.
- `numeroContrato` é único por organização — duplicar responde `409`.
- `criadoPorId` é preenchido automaticamente com o usuário autenticado; não
  precisa (e não é aceito) no body.
- `PATCH /contratos/:id` aceita qualquer subconjunto dos mesmos campos
  (atualização parcial) e preenche `atualizadoPorId` automaticamente. Se
  `statusId` mudar, por enquanto só grava o valor novo em `contratos` — sem
  gerar histórico ainda (isso é Fase 4, tabela `historico_status_contrato`).
- Não existe `DELETE /contratos/:id` nesta fase.

### Smoke test automatizado (Fase 2)

`apps/api/scripts/smoke-test-fase2.ts` roda os 11 cenários acima (criação
das referências, contrato, listagem, filtro, edição, número duplicado,
exclusão de referência em uso, usuário `Operacional` sem permissão de
escrita, e isolamento cruzado entre organizações) via HTTP de verdade contra
a API já no ar, imprime `PASS`/`FAIL` por passo, para no primeiro `FAIL`, e
sempre limpa todo o dado de teste no final (sucesso ou falha) — não deixa
lixo no banco. Reusar como regressão sempre que mexer em auth, tenant-
scoping, RLS ou nesses módulos:

```bash
docker compose exec api npm run smoke:fase2
```

## Módulos setoriais (Fase 3 — completa)

Cada setor (Produção, Ambiental, Logística, Financeiro) é uma extensão 1:1
de `contratos` — uma linha por contrato, preenchida aos poucos pelo setor
responsável. Os quatro estão implementados e validados; cada um foi
validado com seu próprio smoke test antes do próximo entrar.

### Precisão monetária: Decimal, não Float (mudança nesta rodada)

A entrada de Financeiro trouxe uma migração de schema que também afeta
`contratos`: `comissaoPct`, `comissaoMetragem` e `valorTotalUsd` — que já
existiam desde a Fase 2 — migraram de `Float` para `Decimal` (`numeric` no
Postgres), porque `Float` (double precision) tem erro de arredondamento
conhecido e inaceitável pra valor monetário. O mesmo vale para todos os
campos de valor de `detalhes_financeiro` (exceto `nfVolumeM3`, que é volume
e continua `Float`, e `taxaCambial`, que usa `Decimal(10, 6)` por precisar
de mais casas decimais que reais/dólares).

**Efeito colateral tratado explicitamente**: em runtime, um campo `Decimal`
do Prisma é um objeto (`Prisma.Decimal`), não um `number` do JS. Nenhuma
rota desse projeto declara `schema.response`, então o Fastify serializa a
resposta com `JSON.stringify()` puro — que respeita o `toJSON()` do
`Decimal`, retornando **string**. Ou seja: campos monetários chegam no JSON
da API como string, já arredondados pra escala da coluna (ex.:
`"valorTotalUsd":"12345.68"`, não `12345.68` sem aspas). Essa é uma decisão
deliberada (evita reintroduzir erro de arredondamento de float bem na
resposta da API), documentada nos comentários de `contratos.routes.ts` e
`detalhes-financeiro.routes.ts` — cliente HTTP deve tratar esses campos
como string e converter (`Number(...)`) só na hora de fazer conta, não
assumir `number` direto.

O código de `contratos.routes.ts` da Fase 2 não precisou de nenhuma mudança
de lógica por causa disso — só ganhou `minimum: 0` nos três campos
monetários (mesma validação usada em Financeiro) e o comentário explicando
a serialização. Reconfirmado com o smoke test da Fase 2 depois da migração
(ver "Smoke test automatizado" de cada setor abaixo).

### Produção (`detalhes_producao`)

```bash
GET /contratos/:contratoId/producao   # 404 se ainda não foi preenchido
PUT /contratos/:contratoId/producao   # upsert — cria se não existe, atualiza se já existe
```

Body de `PUT` (todos os campos são opcionais — Produção pode salvar parcial
e completar depois; um `PUT` novo só sobrescreve os campos enviados):

```json
{
  "numeroRomaneio": "ROM-2026-001",
  "volumeRomaneioM3": 100,
  "qtdContainersConfirmada": 4,
  "observacoesProducao": "Carga separada, aguardando coleta.",
  "dataCocEnviadaDespachante": "2026-02-01"
}
```

- `contratoId` na URL precisa existir e pertencer à sua organização — senão
  `404` (`{ "message": "Contrato não encontrado." }`), nunca `500`. Essa
  checagem é feita explicitamente pela rota antes do upsert; a RLS do
  Postgres (`detalhes_producao` só tem relação indireta com organização, via
  `contrato_id` — ver migration `add_row_level_security`) é a segunda camada
  por trás dela.
- `volumeRomaneioM3`, se enviado, precisa ser `> 0`. `qtdContainersConfirmada`,
  se enviado, precisa ser inteiro `>= 0`. Fora dessas faixas, `400`.
- **Permissões**: leitura (`GET`) liberada a qualquer perfil autenticado,
  igual às outras rotas. Escrita (`PUT`) restrita a `Administrador` e
  `Operacional` — é o perfil mais próximo do setor de Produção (o schema não
  tem um perfil "Produção" isolado). `Comercial`/`Financeiro`/`Ambiental`
  recebem `403` ao tentar escrever aqui.

### Smoke test automatizado (Fase 3 — Produção)

`apps/api/scripts/smoke-test-fase3-producao.ts` reaproveita o setup de
referências+contrato e o cliente HTTP já usados no smoke test da Fase 2
(`scripts/smoke-test-fixtures.ts`, `scripts/smoke-test-helpers.ts` — nenhuma
lógica duplicada entre os dois scripts). Cobre: `GET` antes de existir
(`404`), `PUT` criando (com verificação dos campos salvos), `GET` depois,
`PUT` atualizando (confirma que atualiza o mesmo registro, não duplica),
validação de `volumeRomaneioM3` negativo (`400`), usuário `Comercial` sem
permissão de escrita (`GET` `200` / `PUT` `403`), e `PUT` num `contratoId`
inexistente (`404`). Limpa tudo no final, sucesso ou falha.

```bash
docker compose exec api npm run smoke:fase3-producao
```

### Ambiental (`detalhes_ambiental`)

```bash
GET /contratos/:contratoId/ambiental   # 404 se ainda não foi preenchido
PUT /contratos/:contratoId/ambiental   # upsert — cria se não existe, atualiza se já existe
```

Body de `PUT` (todos os campos são opcionais — mesmo espírito de Produção):

```json
{
  "autef": "AUTEF-2026-001",
  "lpcoNumero": "LPCO-2026-001",
  "lpcoStatus": "Protocolada",
  "lpcoDataProtocolo": "2026-01-10",
  "lpcoDataValidade": "2026-06-10",
  "citesNumeroRequerimento": "...",
  "citesNumero": "...",
  "citesDataEntrada": "2026-01-15",
  "citesDataValidade": "2026-07-15",
  "citesStatus": "Não se aplica",
  "gfNumero": "...",
  "gfDataVencimento": "2026-05-01",
  "gfDataRecebimentoSisflora": "2026-01-20",
  "dofDataRegistro": "2026-01-25",
  "statusAprovacaoCocCliente": "Pendente"
}
```

- Mesma checagem de `contratoId` (existe e pertence à sua organização antes
  do upsert — `404` claro, nunca `500`) e mesma defesa em profundidade via
  RLS que Produção.
- Três campos só aceitam um valor fixo de uma lista — qualquer outro valor
  responde `400`:
  - `lpcoStatus`: `Em análise | Protocolada | Deferida | Indeferida`
  - `citesStatus`: `Não se aplica | Em análise | Deferida | Indeferida`
  - `statusAprovacaoCocCliente`: `Pendente | Aprovado | Reprovado`
- Se `lpcoDataProtocolo` **e** `lpcoDataValidade` forem enviados no mesmo
  `PUT`, `lpcoDataValidade` não pode ser anterior a `lpcoDataProtocolo`
  (`400` se for). Mesma regra para `citesDataEntrada`/`citesDataValidade`.
  Enviar só um dos dois de cada par não dispara essa checagem.
- **Permissões**: leitura (`GET`) liberada a qualquer perfil autenticado.
  Escrita (`PUT`) restrita a `Administrador` e `Ambiental` — usa o perfil
  dedicado do enum `PerfilAcesso` (diferente de Produção, que precisou se
  aproximar de `Operacional` por não existir um perfil "Produção" isolado).

### Smoke test automatizado (Fase 3 — Ambiental)

`apps/api/scripts/smoke-test-fase3-ambiental.ts` reaproveita os mesmos
helpers/fixtures da rodada de Produção. Cobre: `GET` antes de existir
(`404`), `PUT` criando com os 3 campos de status válidos, `GET` depois,
`PUT` atualizando (mesmo registro, não duplica), `lpcoStatus` fora da lista
permitida (`400`), `citesDataValidade` anterior a `citesDataEntrada`
(`400`), usuário `Financeiro` sem permissão de escrita (`GET` `200` / `PUT`
`403`), e `PUT` num `contratoId` inexistente (`404`). Limpa tudo no final,
sucesso ou falha.

```bash
docker compose exec api npm run smoke:fase3-ambiental
```

### Logística (`detalhes_logistica`)

```bash
GET /contratos/:contratoId/logistica   # 404 se ainda não foi preenchido
PUT /contratos/:contratoId/logistica   # upsert — cria se não existe, atualiza se já existe
```

Body de `PUT` (todos os campos são opcionais — mesmo espírito dos setores
anteriores):

```json
{
  "ciaMaritima": "...",
  "nomeNavio": "...",
  "booking": "...",
  "containerNumero": "...",
  "dataPrancha": "2026-01-20",
  "dataDraftDocumentos": "2026-01-22",
  "dataDraftCarga": "2026-01-23",
  "dataColetaContainer": "2026-01-25",
  "dataPosEmbarqueDocsCliente": "2026-01-28",
  "dataEntradaPortoDestino": "2026-03-01",
  "dataPrevistaSaidaNavio": "2026-01-30",
  "dataNavioNoDestino": "2026-02-28",
  "blNumero": "...",
  "blData": "2026-01-29",
  "portoDestinoPais": "...",
  "motorista": "...",
  "placaVeiculo": "...",
  "pagamentoBl": "Sim"
}
```

- Mesma checagem de `contratoId` (existe e pertence à sua organização antes
  do upsert — `404` claro, nunca `500`) e mesma defesa em profundidade via
  RLS que Produção/Ambiental.
- `pagamentoBl`, se enviado, só aceita `Sim` ou `Não` — qualquer outro
  valor responde `400`.
- **Sem validação cruzada entre os 9 campos de data** (ex.: `dataPrancha`
  antes de `dataColetaContainer` antes de `dataEntradaPortoDestino`...).
  Isso é uma decisão em aberto, não uma omissão — ainda não existe regra de
  negócio documentada sobre qual data precisa vir antes de qual nesse fluxo
  logístico. Fica marcado como `TODO` no código
  (`detalhes-logistica.routes.ts`); se essa regra for definida, validar do
  mesmo jeito que já é feito em `detalhes-ambiental.routes.ts`.
- **Permissões**: leitura (`GET`) liberada a qualquer perfil autenticado.
  Escrita (`PUT`) restrita a `Administrador` e `Operacional` — não existe
  perfil "Logística" dedicado no enum `PerfilAcesso` (mesma aproximação já
  usada em Produção).

### Smoke test automatizado (Fase 3 — Logística)

`apps/api/scripts/smoke-test-fase3-logistica.ts` reaproveita os mesmos
helpers/fixtures das rodadas anteriores. Cobre: `GET` antes de existir
(`404`), `PUT` criando com `pagamentoBl="Sim"` (com verificação dos campos
salvos), `GET` depois, `PUT` atualizando (mesmo registro, não duplica),
`pagamentoBl` fora de `Sim`/`Não` (`400`), usuário `Financeiro` sem
permissão de escrita (`GET` `200` / `PUT` `403`), e `PUT` num `contratoId`
inexistente (`404`). Limpa tudo no final, sucesso ou falha.

```bash
docker compose exec api npm run smoke:fase3-logistica
```

### Financeiro (`detalhes_financeiro`)

```bash
GET /contratos/:contratoId/financeiro   # 404 se ainda não foi preenchido
PUT /contratos/:contratoId/financeiro   # upsert — cria se não existe, atualiza se já existe
```

Body de `PUT` (todos os campos são opcionais — mesmo espírito dos setores
anteriores; ver lista completa de campos no `schema.prisma`, model
`DetalhesFinanceiro`):

```json
{
  "invoiceNumero": "INV-2026-001",
  "invoiceValor": 45000.50,
  "freteReais": 1500.50,
  "taxaCambial": 5.4321,
  "valorRecebidoReais": 240000,
  "comissaoSobreVenda": true,
  "valorComissaoReais": 2000
}
```

- Mesma checagem de `contratoId` (existe e pertence à sua organização antes
  do upsert — `404` claro, nunca `500`) e mesma defesa em profundidade via
  RLS que os outros três setores.
- Todo campo monetário (`Decimal`), se enviado, precisa ser `>= 0` — `400`
  se negativo. Ver seção "Precisão monetária" acima sobre `Decimal` vs
  `Float` e como esses valores chegam na resposta (**string**, não number).
- `taxaCambial`, se enviado, precisa ser `> 0` (câmbio zero ou negativo não
  faz sentido) — `400` se `<= 0`.
- **Sem validação de valores fixos** pra `statusEmbarqueXCambio`,
  `statusGeralCambio` e `formaPagamento` (mesma situação das datas de
  Logística — sem lista documentada ainda; `TODO` no código). **Sem
  validação cruzada** entre `comissaoSobreVenda=true` e os campos de
  comissão estarem preenchidos — regra de negócio não confirmada, decisão
  em aberto também marcada no código.
- **Permissões**: leitura (`GET`) liberada a qualquer perfil autenticado.
  Escrita (`PUT`) restrita a `Administrador` e `Financeiro` — usa o perfil
  dedicado do enum `PerfilAcesso` (igual Ambiental, diferente de Produção/
  Logística que precisaram se aproximar de `Operacional`).

### Smoke test automatizado (Fase 3 — Financeiro)

`apps/api/scripts/smoke-test-fase3-financeiro.ts` reaproveita os mesmos
helpers/fixtures das rodadas anteriores. Além do CRUD (`GET` antes de
existir `404`, `PUT` criando, `GET` depois, `PUT` atualizando sem duplicar,
campo monetário negativo `400`, `taxaCambial=0` `400`, usuário `Comercial`
sem permissão `200`/`403`, `contratoId` inexistente `404`), o passo 3
confirma explicitamente que os valores monetários voltam como **string** e
batem exatamente com o que foi enviado (via `Number(...)` — testa a
serialização do `Decimal` na prática, não só por leitura de código). Limpa
tudo no final, sucesso ou falha.

```bash
docker compose exec api npm run smoke:fase3-financeiro
```

Com auth por cookie (Fase 1), Fase 2, Fase 3 (completa) e Fase 4 no ar, os 7
smoke tests (`fase1-cookie-auth`, `fase2`, `fase3-producao`,
`fase3-ambiental`, `fase3-logistica`, `fase3-financeiro`, `fase4`) devem ser
reconfirmados juntos sempre que houver mudança de schema ou nos módulos
compartilhados (`middleware/`, `lib/`, `scripts/smoke-test-helpers.ts`,
`scripts/smoke-test-fixtures.ts`):

```bash
docker compose exec api npm run smoke:fase1-cookie-auth && \
docker compose exec api npm run smoke:fase2 && \
docker compose exec api npm run smoke:fase3-producao && \
docker compose exec api npm run smoke:fase3-ambiental && \
docker compose exec api npm run smoke:fase3-logistica && \
docker compose exec api npm run smoke:fase3-financeiro && \
docker compose exec api npm run smoke:fase4
```

## Estrutura

```
apps/api/
  src/
    lib/          # prisma client, jwt sign/verify, paginação, tradução de erros do Prisma
    middleware/   # auth, tenant-scoping, roles
    modules/      # um módulo por entidade (auth, especies, produtos, importadores,
                   # representantes, status-contrato, contratos, detalhes-producao,
                   # detalhes-ambiental, detalhes-logistica, detalhes-financeiro —
                   # Fase 3 completa; Fase 4 (auditoria/histórico) ainda não existe)
    plugins/      # protected-context (hooks centrais de auth+tenant-scoping)
  scripts/        # smoke tests por fase (smoke-test-fase2.ts, smoke-test-fase3-producao.ts,
                   # smoke-test-fase3-ambiental.ts, smoke-test-fase3-logistica.ts,
                   # smoke-test-fase3-financeiro.ts)
apps/web/              # React + Vite
packages/shared-types/ # types compartilhados (ainda vazio na Fase 0)
```
