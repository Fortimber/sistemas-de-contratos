# Sistema de Contratos de Exportação

Ver `ARCHITECTURE.md` para o blueprint completo. Estado atual — **backend**: Fase 1 (auth por cookie httpOnly), Fase 2, Fase 3 (módulos setoriais completa) e Fase 4 (auditoria/histórico) prontos. **Frontend**: Fase 0 (fundação técnica), Fase 1 (login + proteção de rotas), Fase 2 (telas de referências + contratos), Fase 3 (abas dos módulos setoriais) e Fase 4 (abas de histórico e auditoria) prontas — fecha o roadmap principal do frontend (F0–F4), ver seção "Frontend" abaixo. Próxima: telas de Anexos, que dependem da Fase 5 do backend (ainda não iniciada).

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
GET  /contratos/:id                      # inclui importador/representante/produto/status/contratoPai/aditivos populados
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
  "contratoPaiId": "...",             // obrigatório quando tipoContrato = "Aditivo", proibido quando "Original" — ver abaixo
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
  "requerCertificadoFitossanitario": false, // opcional, default false
  "requerCertificadoKilnDried": false,      // opcional, default false — "Certificate of Kiln Dried Timber"
  "comissaoPct": 2.5,                 // opcional
  "comissaoMetragem": 10,             // opcional
  "valorTotalUsd": 45000,
  "moedaValorTotal": "USD",
  "modalidadePgtContaBrasil": "À vista",
  "modalidadePgtContaExterior": "À vista"
}
```

- `importadorId`, `representanteId`, `produtoId` e `statusId` são
  validados **antes** do insert — cada um precisa existir e pertencer à
  sua organização, senão a resposta é `400` identificando o campo
  problemático (`{ "message": "O campo \"produtoId\" não existe ou não
  pertence à sua organização." }`), nunca um `500` cru.
- `numeroContrato` é único por organização — duplicar responde `409`.
- `criadoPorId` é preenchido automaticamente com o usuário autenticado; não
  precisa (e não é aceito) no body.
- `PATCH /contratos/:id` aceita qualquer subconjunto dos mesmos campos
  (atualização parcial) e preenche `atualizadoPorId` automaticamente. Se
  `statusId` mudar, uma linha nova é gravada em
  `historico_status_contrato` (ver seção "Histórico e auditoria (Fase 4)"
  mais abaixo).
- Não existe `DELETE /contratos/:id` nesta fase.

#### Vínculo Original/Aditivo

O schema já vinha com `tipoContrato` (`Original`/`Aditivo`) e
`contratoPaiId` desde a Fase 2 — faltava a regra de negócio amarrando os
dois, adicionada nesta rodada (`contratos.service.ts`,
`validarVinculoAditivo`):

- `tipoContrato = "Original"`: `contratoPaiId` tem que ser `null`/ausente.
  Enviar preenchido responde `400`.
- `tipoContrato = "Aditivo"`: `contratoPaiId` é **obrigatório**, precisa
  existir, pertencer à mesma organização, e apontar pra um contrato do
  tipo `"Original"` — nunca outro `"Aditivo"` (sem encadeamento: aditivo
  sempre vincula direto ao original). Qualquer violação responde `400`
  com mensagem específica do caso (ausente / não existe-ou-não-pertence /
  não é Original).
- Validado tanto no `POST` quanto no `PATCH` — no `PATCH`, contra o estado
  **efetivo** (o que foi enviado mesclado com o que já existia), não só o
  que veio nesta chamada. Um Original que já tem aditivos vinculados a ele
  não pode virar `"Aditivo"` sem antes desvincular esses aditivos (fecha
  um furo que a regra sozinha não cobre: sem isso seria possível criar
  encadeamento indireto via `PATCH`).
- Pra desvincular um Aditivo existente (trocar `tipoContrato` de volta pra
  `"Original"`), o `PATCH` precisa mandar `"contratoPaiId": null`
  explícito — só omitir o campo significa "não mexe", não "limpa" (mesma
  convenção de toda atualização parcial desta API).
- `GET /contratos/:id` (e as respostas de `POST`/`PATCH`) incluem
  `contratoPai: { id, numeroContrato } | null` e `aditivos: [{ id,
  numeroContrato }]` — um Original resolve `contratoPai: null` e
  `aditivos` com os vinculados (pode ser `[]`); um Aditivo resolve
  `contratoPai` populado e `aditivos: []` sempre.

### Smoke test automatizado (Fase 2)

`apps/api/scripts/smoke-test-fase2.ts` roda os 20 cenários acima (criação
das referências, contrato, listagem, filtro, edição, número duplicado,
exclusão de referência em uso, usuário `Operacional` sem permissão de
escrita, isolamento cruzado entre organizações, o vínculo Original/
Aditivo — Aditivo sem `contratoPaiId` `400`, Aditivo com `contratoPaiId`
de um Original válido `201`, Aditivo apontando pra outro Aditivo `400`
com mensagem de encadeamento, Aditivo com `contratoPaiId` de contrato de
outra organização `400`/`404` nunca `500`, Original com `contratoPaiId`
preenchido `400`, e os dois `GET` confirmando `contratoPai`/`aditivos`
populados —, e os dois certificados booleanos mais recentes
(`requerCertificadoFitossanitario`/`requerCertificadoKilnDried`):
criação com os dois marcados, edição desmarcando os dois, e confirmação
de que as duas mudanças aparecem em `auditoria_contratos` automaticamente
via `middleware/audit-logger.ts` — sem nenhum código novo nesse
middleware, prova de que a extension captura qualquer campo por conta
própria) via HTTP de verdade contra a API já no ar, imprime `PASS`/
`FAIL` por passo, para no primeiro `FAIL`, e sempre limpa todo o dado de
teste no final (sucesso ou falha) — não deixa lixo no banco. Reusar como
regressão sempre que mexer em auth, tenant-scoping, RLS ou nesses
módulos:

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

## Histórico e auditoria (Fase 4)

```bash
GET /contratos/:contratoId/historico-status   # paginado, mais recente primeiro
GET /contratos/:contratoId/auditoria          # paginado, mais recente primeiro — só Administrador
```

`historico-status` é gravado pelo `PATCH /contratos/:id` toda vez que
`statusId` muda (ver `contratos.routes.ts`); `auditoria` é gravado
automaticamente por `middleware/audit-logger.ts` (Prisma Client Extension)
em toda escrita de `contratos`/`detalhes_producao`/`detalhes_ambiental`/
`detalhes_logistica`/`detalhes_financeiro` — nenhuma das duas rotas grava
nada, só leem. `contratoId` na URL precisa existir e pertencer à sua
organização (`404` claro, senão), mesma checagem dos módulos setoriais.

Cada linha inclui o usuário relacionado já populado
(`alteradoPor`/`usuario`, `{ id, nomeCompleto }`), não só o id cru
(`alteradoPorId`/`usuarioId`) — **correção de um gap real**: antes disso a
API só devolvia o id, e como não existe (e não está previsto) um endpoint
de listagem de usuários, não havia como o frontend resolver "quem alterou"
pra um usuário qualquer, só reconhecer o próprio usuário logado no
momento. `null` quando a linha não tem usuário associado, ou quando o
usuário foi excluído depois (a FK usa `ON DELETE SET NULL`, não bloqueia
o `DELETE` do usuário) — testado na prática, ver "Verificado" na seção
Fase 4 do Frontend abaixo.

`historico-status` é liberado a qualquer perfil autenticado; `auditoria` é
restrito a `Administrador` (`403` pros demais) — proposta consciente: cada
linha de auditoria expõe valor antes/depois campo a campo, incluindo dado
financeiro, mais sensível que só "status mudou de X pra Y".

## Frontend (Fase 0 — fundação; Fase 1 — login; Fase 2 — referências e contratos; Fase 3 — módulos setoriais; Fase 4 — histórico e auditoria)

### Fase 0 — fundação técnica

- **Stack**: React + Vite, Tailwind v4 (`@tailwindcss/vite`, sem
  `tailwind.config.js` — configuração vive em `src/index.css`), shadcn/ui
  (estilo `radix-nova`, sobre o pacote unificado `radix-ui`), React Router,
  TanStack Query, React Hook Form + Zod.
- **Componentes base já instalados** (`src/components/ui/`): `button`,
  `input`, `label`, `card`, `table`, `select`, `dialog`, `form`. `form.tsx`
  foi escrito à mão — o preset `radix-nova` do shadcn CLI não inclui esse
  componente (`npx shadcn add form` roda sem erro mas não gera arquivo
  nenhum); o resto veio direto do CLI (`npx shadcn add <componente>`).
  `input.tsx` também foi ajustado na Fase 1 — ver "achado real" abaixo.
- **`src/lib/api-client.ts`**: cliente HTTP central. Sempre manda
  `credentials: "include"` (obrigatório pro navegador aceitar a cookie
  httpOnly do refresh token — Fase 1 da API); guarda o `accessToken` só em
  memória (variável de módulo, nunca `localStorage`/`sessionStorage`); numa
  resposta `401` (fora de `/auth/login` e `/auth/refresh`), tenta **um**
  `POST /auth/refresh` (via `refreshSession`, deduplicado — ver Fase 1
  abaixo) e repete a chamada original — se o refresh também falhar, derruba
  o token e redireciona pra `/login`. Aponta pra API via `VITE_API_URL`.
- **Roteamento**: `src/App.tsx` define as rotas; `src/components/layout/`
  tem o layout base (`AppLayout` = sidebar + área de conteúdo via
  `<Outlet />`).
- **`apps/web/.env.example`**: `VITE_API_URL` para rodar o frontend fora do
  Docker Compose (dentro do Compose, a variável já vem do `.env` da raiz —
  ver serviço `web` em `docker-compose.yml`).

```bash
docker compose up -d web
# http://localhost:5173 — sem estar logado, redireciona pra /login (ver Fase 1).
```

> **Nota (Windows + Docker Desktop):** ao contrário do `tsx watch` da API
> (que às vezes precisa de `docker compose restart api` pra perceber
> mudança de arquivo — ver nota acima), o Vite do frontend já roda com
> `server.watch.usePolling: true` (`apps/web/vite.config.ts`) por causa do
> mesmo problema de propagação de evento entre o bind mount do Windows e o
> container — confirmado na prática durante a Fase 0. Não deveria precisar
> reiniciar o container pra ver uma mudança.

### Fase 1 — login e proteção de rotas

- **`src/pages/login-page.tsx`**: formulário (React Hook Form + Zod,
  schema espelhando exatamente o body de `POST /auth/login` na API —
  `login`/`senha` obrigatórios e não-vazios). Em `401`, mostra sempre a
  mesma mensagem genérica ("Login ou senha inválidos.") — nunca diferencia
  se foi o login ou a senha que errou, mesma escolha de segurança que a
  própria API já faz (`auth.service.ts`). Botão de submit desabilita via
  `form.formState.isSubmitting` (RHF), evitando duplo submit.
- **`src/lib/auth-context.tsx`** (`AuthProvider`/`useAuth`): dono do estado
  de sessão da aplicação. Como o `accessToken` só existe em memória (Fase
  0), ele some a cada F5 — ao montar, tenta automaticamente **um**
  `POST /auth/refresh` (usa a cookie httpOnly, que sobrevive ao F5) antes
  de decidir "logado" ou "não logado". Enquanto isso não resolve,
  `status` fica `"loading"` e as rotas mostram um carregamento simples
  (`src/components/full-page-loading.tsx`) em vez de piscar a tela de
  login.
- **`src/routes/route-guards.tsx`**: `ProtectedRoute` (sem sessão → manda
  pra `/login`) e `PublicOnlyRoute` (com sessão → `/login` manda de volta
  pra `/`), ambas respeitando o estado `"loading"` acima.
- **Logout**: botão na sidebar (`src/components/layout/sidebar.tsx`),
  chama `POST /auth/logout`, limpa o estado em memória e manda pra
  `/login`.
- **Pendente de propósito**: tela de troca de senha obrigatória
  (`usuario.deveTrocarSenha` já vem da API, mas ainda não tem UI).

**Achado real, corrigido durante a verificação manual** — duas coisas que
só apareceram testando de ponta a ponta num navegador de verdade, não lendo
o código:

1. **`Function components cannot be given refs`** no console: o
   `Input` gerado pelo preset `radix-nova` do shadcn CLI é um function
   component simples, sem `React.forwardRef` — o preset assume o modelo de
   ref-como-prop do React 19, mas o projeto está no React 18, e
   `FormControl` (form.tsx) usa `Slot.Root` pra repassar a ref do
   react-hook-form pro input. Corrigido envolvendo `Input` em
   `React.forwardRef` (`src/components/ui/input.tsx`).
2. **F5 derrubava a sessão em vez de mantê-la**: o efeito de boot do
   `AuthProvider` chamava `POST /auth/refresh` direto. Em desenvolvimento,
   o `StrictMode` do React invoca esse efeito **duas vezes** seguidas —
   duas chamadas de `/auth/refresh` concorrentes, com a MESMA cookie
   antiga. Como a API rotaciona o refresh token a cada uso (revoga o
   antigo, emite um novo) e trata reuso de um token já revogado como sinal
   de roubo — derrubando **todas** as sessões do usuário —, a segunda
   chamada matava a sessão que a primeira tinha acabado de criar, e o F5
   sempre voltava pra `/login`. Corrigido centralizando a chamada de
   refresh numa única promise deduplicada (`refreshSession` em
   `api-client.ts`), reusada tanto pelo boot quanto pelo retry automático
   em `401` — nunca dois `fetch` de refresh concorrentes.

**Verificado de ponta a ponta num navegador real (Chrome, via
claude-in-chrome), não só por leitura de código**: acesso a `/` deslogado
redireciona pra `/login`; senha errada mostra a mensagem genérica sem
redirecionar; login correto redireciona pra `/` com sidebar/conteúdo
protegido visível; F5 mantém a sessão (sem voltar pra `/login`); acessar
`/login` diretamente enquanto logado redireciona pra `/`; logout limpa a
cookie e redireciona pra `/login`; acessar `/` diretamente depois do
logout volta pra `/login`. Console do navegador sem erros em nenhum desses
passos (depois dos dois achados acima corrigidos).

### Fase 2 — referências e contratos

**Referências** (`src/features/referencias/`): as 5 tabelas de referência
(espécies, produtos, importadores, representantes, status de contrato) são
telas de CRUD (listar paginado, criar/editar num dialog, excluir com
confirmação) — mas nenhuma delas foi escrita à mão. Todas usam o mesmo
componente genérico e configurável:

- **`reference-crud-page.tsx`** (`ReferenceCrudPage`): recebe uma
  `ReferenceCrudConfig` (título, endpoint, colunas da tabela, campos do
  formulário, schema Zod) e monta listagem + paginação + dialog de criar/
  editar + dialog de exclusão sozinho. Cada `*-page.tsx` (`especies-page.tsx`,
  `produtos-page.tsx`, ...) só declara sua config — nenhuma tem lógica de
  CRUD própria. `produtos-page.tsx` é o único caso com um campo `select`
  alimentado por outra tabela (espécie): busca a lista de espécies uma vez
  (`useEspecies`) e usa o resultado tanto nas opções do formulário quanto
  no lookup id → nome da coluna "Espécie" da tabela (a API não populariza
  essa relação em `GET /produtos`, só devolve o id).
- **Botões de criar/editar/excluir só aparecem pra `Administrador`/
  `Comercial`** (`src/lib/permissions.ts`, `canWriteReferences`) — espelha
  exatamente `requireRole("Administrador", "Comercial")` que já protege
  essas rotas na API. Isso é **só UX** (esconder o que a pessoa não vai
  poder usar); a permissão de verdade é sempre checada no backend, mesmo
  que alguém monte a requisição direto.
- Concordância de gênero (`ReferenceCrudConfig.genero`): "Nova espécie",
  não "Novo espécie" — achado real testando no navegador.

**Contratos** (`src/features/contratos/`):

- **Lista** (`contratos-list-page.tsx`): paginada, com filtro por status e
  importador — os filtros vivem na própria URL (`useSearchParams`), não em
  estado local, então dá pra copiar/voltar/recarregar sem perder o filtro
  aplicado. Mesma situação de "API não populariza relação na listagem": a
  coluna "Importador"/"Status" usa um lookup id → nome (reaproveita as
  mesmas listas de referência que alimentam os `<Select>` de filtro).
- **`contrato-form.tsx`**: formulário único, reusado por criar
  (`contrato-create-page.tsx`) e editar (`contrato-edit-page.tsx`) — a
  página de edição só decide como buscar os dados iniciais (`useContrato`)
  e o que fazer no submit (`PATCH` em vez de `POST`); o formulário em si é
  o mesmo. Campos com valor sugerido documentado no `schema.prisma` mas não
  validado como enum pela API (`local`, `moedaValorTotal`,
  `modalidadePgtConta*`) viram `<Select>` mesmo assim — orientação de UX/
  qualidade de dado, não uma regra de segurança nova (a API aceita
  qualquer string não-vazia do mesmo jeito). Vínculo Original/Aditivo (ver
  "Vínculo Original/Aditivo" acima): o campo "Tipo de contrato" usa o
  rótulo "Único" pra `"Original"` (só na tela — o valor salvo continua
  `"Original"`, `TIPO_CONTRATO_LABELS` em `types.ts`, compartilhado com a
  tela de detalhe); o campo "Contrato original" só aparece quando
  "Aditivo" é selecionado (`form.watch("tipoContrato")`), lista só
  contratos `tipoContrato === "Original"`, e é obrigatório nesse caso via
  `superRefine` no schema Zod. `contratoFormValuesToPayload` sempre manda
  `contratoPaiId` explícito (`null` quando "Único", nunca omitido) — é o
  que permite desvincular um Aditivo existente ao editá-lo de volta pra
  "Único" (ver o mesmo raciocínio do lado da API).
- **Detalhe** (`contrato-detail-page.tsx`): mostra os dados com as relações
  já populadas (`importador.nomeRazaoSocial`, `status.nomeStatus`, etc. —
  `GET /contratos/:id` inclui essas relações, ao contrário da listagem).
  Sem tela de exclusão: a API não tem `DELETE /contratos/:id` (contratos
  não são apagáveis, só editáveis — trilha de auditoria fica íntegra).
  Quando o contrato é um Aditivo, mostra um link pro contrato original
  (`c.contratoPai`, já populado pela API — sem fetch extra no frontend);
  quando é Original e tem aditivos vinculados, mostra um card "Aditivos
  vinculados" com link pra cada um (`c.aditivos`).

**Achado real, corrigido durante a verificação manual**: o mesmo problema
de `forwardRef` da Fase 1 (ver achado #1 acima) apareceu de novo, agora em
`Dialog` — `DialogOverlay`/`DialogContent` (`components/ui/dialog.tsx`)
também são gerados pelo preset `radix-nova` sem `React.forwardRef`, e o
mecanismo de Portal/Presence do Radix (usado pra animação de abrir/fechar)
tenta anexar uma ref a eles. Só apareceu agora porque a Fase 2 foi a
primeira vez que um `Dialog` de verdade abriu em teste manual no navegador
— não tinha como pegar isso só lendo código.

**Auditoria completa de `forwardRef`** (pedida explicitamente antes de
fechar a Fase 2, depois do achado do `Dialog`): todo componente em
`src/components/ui/` foi conferido pela mesma causa raiz — função sem
`React.forwardRef` envolvendo diretamente um elemento DOM ou primitivo
Radix único, no preset `radix-nova` (que assume o modelo de ref-como-prop
do React 19; o projeto está no React 18). Duas rotas diferentes disparam o
aviso "Function components cannot be given refs": (a) o react-hook-form
sempre inclui uma `ref` no objeto `field` que `{...field}` espalha (caso do
`Input`); (b) o mecanismo de Portal/Presence do próprio Radix, que anexa
ref pra detectar fim de animação, independente de qualquer código nosso
(caso do `Dialog`). Resultado da auditoria:

| Componente | Tinha o bug? | Onde/por quê |
| --- | --- | --- |
| `Input` | Sim (corrigido na Fase 1) | `{...field}` do RHF inclui `ref` |
| `Dialog` — `Overlay`, `Content`, `Trigger`, `Close`, `Header`, `Footer`, `Title`, `Description` | Sim (corrigido na Fase 2) | `Overlay`/`Content`: Portal/Presence do Radix; os demais: mesmo padrão, risco latente com `asChild` |
| `Button` | Sim (corrigido nesta auditoria) | usado com `asChild` dentro de `DialogPrimitive.Close`/`Trigger` |
| `Card` (7 subcomponentes) | Sim (corrigido nesta auditoria) | não estava em uso de um jeito que dispara o aviso ainda, mas tinha a mesma forma estrutural |
| `Checkbox` | Sim (corrigido nesta auditoria) | já usado dentro de `FormControl` em `contrato-form.tsx`; não disparava porque o código liga `checked`/`onCheckedChange` a dedo, não `{...field}` — um `ref` futuro quebraria do mesmo jeito que `Input` |
| `Label` | Sim (corrigido nesta auditoria) | mesma forma estrutural (wrapper de um primitivo Radix único) |
| `Select` (9 subcomponentes, exceto o `Root`) | Sim (corrigido nesta auditoria) | mesma razão do `Checkbox`: código atual evita `ref`, mas a estrutura tinha o mesmo risco |
| `Table` (7 subcomponentes) | Sim (corrigido nesta auditoria) | mesma forma estrutural |
| `Form` — `FormItem`, `FormLabel`, `FormDescription`, `FormMessage` | Sim (corrigido nesta auditoria) | mesma forma estrutural |
| `Dialog` (Root), `DialogPortal`, `Select` (Root), `FormControl`, `FormField` | **Não** — corretos por design | são componentes só lógicos (sem nó DOM próprio) ou já delegam pro `Slot.Root` do próprio Radix, que resolve ref-forwarding sozinho — não faz sentido/não precisa de `forwardRef` |

Todos os componentes corrigidos seguem o mesmo padrão: `React.forwardRef`
explícito com `ref` repassada pro elemento/primitivo real, e
`displayName` setado (usa o do próprio primitivo Radix quando existe, ou
um literal pros que só envolvem HTML puro).

**Verificado de ponta a ponta num navegador real (Chrome, via
claude-in-chrome)**: criada 1 espécie, 1 produto (associado à espécie), 1
importador, 1 representante e 1 status de contrato — todos via os dialogs
de criação, cada um refletindo na tabela certa; criado 1 contrato usando
essas 5 referências (dropdowns todos alimentados corretamente); contrato
editado (volume alterado) e a mudança confirmada na tela de detalhe;
filtro por status aplicado na lista (refletido na URL) e limpo de volta;
depois da auditoria, reconfirmado editar/excluir de referência (dialogs) e
o checkbox do formulário de contrato. Console do navegador sem erros em
nenhum passo, em nenhuma dessas rodadas.

**Vínculo Original/Aditivo — achado e correção posterior, verificado de
ponta a ponta num navegador real (Chrome, via claude-in-chrome)**: o
schema já suportava `tipoContrato`/`contratoPaiId` desde o começo da Fase
2, mas faltava a regra de negócio amarrando os dois (ver "Vínculo
Original/Aditivo" na seção "Contratos" acima) — corrigido nesta rodada,
backend e frontend juntos. Testado criando um contrato "Único"
(`F5-ORIGINAL-001`) e depois um "Aditivo" vinculado a ele
(`F5-ADITIVO-001`) pela própria tela: o campo "Contrato original" só
apareceu depois de selecionar "Aditivo", listou só contratos `Original`;
a tela de detalhe do Aditivo mostrou o link pro original; a tela de
detalhe do Original mostrou o card "Aditivos vinculados" com o link de
volta pro aditivo; e o formulário de edição do Aditivo pré-carregou
"Tipo de contrato: Aditivo" e "Contrato original: F5-ORIGINAL-001"
corretamente. Console do navegador sem erros. `smoke-test-fase2.ts`
estendido com os cenários de validação (ver "Smoke test automatizado
(Fase 2)" acima); os 7 smoke tests de todas as fases reconfirmados juntos
depois da mudança, todos `OK` — nenhuma regressão.

### Fase 3 — módulos setoriais

A tela de detalhe do contrato (`contrato-detail-page.tsx`) ganhou uma seção
"Módulos setoriais" com 4 abas (`Tabs` do shadcn/ui, componente novo desta
fase — `src/components/ui/tabs.tsx`, escrito à mão como `form.tsx` na Fase
0, mesmo padrão `forwardRef` dos demais componentes deste preset): Produção,
Ambiental, Logística, Financeiro. Cada aba busca `GET
/contratos/:id/<setor>` só quando fica ativa; `404` (setor ainda não
preenchido) não é tratado como erro — vira "mostrar formulário vazio" — e
qualquer outro erro (403, 500, rede) mostra mensagem de falha. Salvar é
sempre `PUT` (upsert), igual a API.

**`src/features/contratos/setores/`** — tudo desta fase:

- **`field-config.ts`**: descreve declarativamente os campos de um setor
  (`text`/`date`/`number`/`select`/`boolean`) — a mesma lista alimenta o
  formulário e a visão somente-leitura, pra não repetir nome/label de campo
  duas vezes por setor (Financeiro sozinho tem quase 30 campos).
- **`sector-form.tsx`** (`SectorForm`): formulário genérico dirigido por
  `fields`, mesmo espírito de `ReferenceCrudPage` (Fase 2) generalizado pra
  cobrir também `date`/`boolean`. Todo campo — inclusive os numéricos/
  monetários — vive no formulário como `string` (nunca `number`), mesma
  decisão de `comissaoPct`/`comissaoMetragem` em `contrato-form.tsx`: evita
  qualquer arredondamento intermediário; a conversão pra `number` só
  acontece uma vez, em `sectorFormValuesToPayload`, direto na string exata
  vinda da API ou digitada pelo usuário, nunca reformatada no meio do
  caminho. Campos vazios não entram no `PUT` (upsert parcial). `<Select>`
  usa um sentinela (`SETOR_SELECT_VAZIO`) pro estado "não selecionado" —
  mesmo problema já resolvido em `contrato-form.tsx` (Radix Select não
  aceita `value=""`), aqui necessário pros 4 selects porque todos são
  opcionais.
- **`sector-read-only.tsx`** (`SectorReadOnly`): mesma lista de `fields`,
  troca input editável por texto estático (`dt`/`dd`, mesmo padrão do
  `Field` de `contrato-detail-page.tsx`) — usada quando o usuário logado
  não tem permissão de escrita na aba.
- **`sector-tab.tsx`** (`SectorTab`): casca comum às 4 abas — decide entre
  carregando / erro / formulário editável / somente-leitura / "ainda não
  preenchido"; a única coisa que muda de um setor pro outro é `fields` e os
  hooks de dados.
- **`hooks.ts`**: par de hooks por setor (`useDetalhesProducao`/
  `useSalvarDetalhesProducao`, etc.), construídos sobre uma factory
  genérica (`useDetalhesSetor`/`useSalvarDetalhesSetor`) que já resolve o
  caso do `404` acima.
- **`producao-tab.tsx`/`ambiental-tab.tsx`/`logistica-tab.tsx`/
  `financeiro-tab.tsx`**: só declaram `fields` (espelhando exatamente
  `DetalhesProducao`/`DetalhesAmbiental`/`DetalhesLogistica`/
  `DetalhesFinanceiro` do `schema.prisma`) e chamam `SectorTab` com os
  hooks certos. Ambiental usa `<Select>` pros 3 campos de status
  (`lpcoStatus`, `citesStatus`, `statusAprovacaoCocCliente`) e Logística
  pro `pagamentoBl` — mesmas listas fixas que a API já valida. Financeiro
  usa texto livre pros 3 campos sem lista fixa documentada
  (`statusEmbarqueXCambio`, `statusGeralCambio`, `formaPagamento`) — mesma
  decisão em aberto que já existe no backend (ver
  `detalhes-financeiro.routes.ts`).

**Permissão de escrita por aba** (`src/lib/permissions.ts`,
`canWriteSector`) — espelha exatamente o `requireRole(...)` de cada
`detalhes-*.routes.ts` na API: Produção e Logística exigem
`Administrador`/`Operacional`; Ambiental exige `Administrador`/`Ambiental`;
Financeiro exige `Administrador`/`Financeiro`. Mesma filosofia de UX da
Fase 2 (`canWriteReferences`): quando o perfil logado não tem permissão na
aba, `SectorTab` renderiza `SectorReadOnly` em vez do formulário (sem botão
salvar) — é só esconder o que a pessoa não vai poder usar mesmo; a
segurança de verdade continua sendo o backend respondendo `403`.

**Precisão dos campos monetários do Financeiro**: a API serializa `Decimal`
como string (`"12345.68"`, ver seção "Precisão monetária" acima). O
formulário trata esses campos como texto formatado ponta a ponta — o valor
que chega do `GET` vai direto pro campo do formulário sem passar por
`Number(...)`, e só vira `number` (pro JSON do `PUT`, que exige `number`
no schema Ajv) na hora exata de montar o payload, na string exata que
estava no campo. Testado na prática com `taxaCambial` (`Decimal(10,6)`,
mais casas decimais que os demais campos): enviado `5.4321`, confirmado no
banco como `5.432100` e reexibido no formulário como `5.4321` depois de um
reload — nenhuma perda/alteração de precisão em nenhum ponto do caminho.

**Verificado de ponta a ponta num navegador real (Chrome, via
claude-in-chrome)**, com dois usuários:

- **Administrador** (acesso total): preenchido e salvo com sucesso um
  contrato existente nas 4 abas — Produção (5 campos), Ambiental (15
  campos, incluindo os 3 `<Select>`), Logística (18 campos, incluindo
  `pagamentoBl`), Financeiro (29 campos, incluindo o checkbox
  `comissaoSobreVenda` e os 3 campos de texto livre). Cada `PUT`
  confirmado direto no Postgres (`docker compose exec postgres psql`), e
  reconfirmado via reload da página (formulário volta pré-preenchido com
  os mesmos valores, `<Select>` com a opção certa marcada).
- **Usuário de teste de perfil único** (`teste-ambiental`, perfil
  `Ambiental`, criado via SQL direto só pra este teste e removido ao
  final): a aba Ambiental apareceu como formulário editável (salvou uma
  edição com sucesso, confirmada no banco); as outras 3 abas (Produção,
  Logística, Financeiro) apareceram somente-leitura — sem nenhum campo
  editável nem botão "Salvar" — mostrando exatamente os dados já salvos
  pelo administrador, incluindo os valores monetários do Financeiro como
  texto puro (`12345.68`, `5.4321`, ...), sem arredondamento.

Console do navegador sem erros em nenhuma das duas rodadas.

**Achado de ambiente (não é bug do código)**: durante o teste manual, o
Radix `<Select>` ocasionalmente não confirmava a seleção num primeiro
clique de mouse simulado (a UI reabria em "Não selecionado" depois de
"selecionar" uma opção) — atribuído a lag geral do ambiente de automação
do navegador (Docker Desktop tinha acabado de subir), não a um problema no
componente: a mesma seleção via teclado (setas + Enter, que dispara o
mesmo `onValueChange`) e cliques repetidos sempre funcionaram, e o valor
salvo no banco sempre bateu com o que a tela mostrava no momento do envio.

### Fase 4 — histórico e auditoria

Duas novas abas na mesma seção "Módulos setoriais e histórico" da tela de
detalhe do contrato (`contrato-detail-page.tsx`), junto das 4 da Fase 3:
**Histórico** (mudanças de status) e **Auditoria** (trilha campo a campo).
Nenhuma das duas tem formulário — são só listagens paginadas de leitura,
mais recente primeiro (a API já ordena por `dataAlteracao`/`dataHora
desc`).

**`src/features/contratos/historico-auditoria/`** — tudo desta fase:

- **`types.ts`**: `HistoricoStatusContrato`/`AuditoriaContrato`, espelhando
  o formato de `GET .../historico-status` e `GET .../auditoria` (ver
  `apps/api/src/modules/{historico-status-contrato,auditoria-contratos}/
  *.routes.ts`, e a seção "Histórico e auditoria (Fase 4)" mais acima).
  `alteradoPorId`/`usuarioId` continuam presentes (o id cru), mas agora
  vêm acompanhados de `alteradoPor`/`usuario` (`UsuarioResumo | null` —
  `{ id, nomeCompleto }`), já que a API popula essa relação. `statusAnteriorId`/
  `statusNovoId` continuam só id — resolvidos pro nome no frontend (ver
  `historico-tab.tsx` abaixo), porque `/status-contrato` é uma tabela
  listável, ao contrário de usuários. `AcaoAuditoria` documenta um detalhe
  não óbvio: o valor runtime do client Prisma pro enum é a CHAVE do schema
  (`"Criacao"`), não o `@map` em português usado só na coluna do Postgres —
  conferido em `apps/api/scripts/smoke-test-fase4.ts`, que filtra por
  `acao: "Criacao"`.
- **`hooks.ts`**: `useHistoricoStatus`/`useAuditoria`, par simples de
  `useQuery` paginado (mesmo formato `{ data, meta }` de toda listagem da
  API — `Paginated<T>`, `lib/pagination.ts`). `useAuditoria` não precisa
  se preocupar com o `403` que a API devolve pra quem não é
  Administrador: só é chamado por dentro de `AuditoriaTab`, que só monta
  quando a permissão já foi conferida um nível acima (ver abaixo).
- **`historico-tab.tsx`** (`HistoricoTab`): tabela com data, status
  anterior, status novo, alterado por, observação. `statusAnteriorId`/
  `statusNovoId` resolvidos pro nome via o mesmo lookup id → nome já
  usado em `contratos-list-page.tsx` (busca `/status-contrato` uma vez,
  monta um `Map`) — já "alterado por" usa `h.alteradoPor?.nomeCompleto ??
  "—"` direto, sem lookup nenhum no frontend (a API já resolve). Sem
  checagem de permissão — visível a qualquer perfil autenticado, igual ao
  resto das rotas de leitura do sistema.
- **`auditoria-tab.tsx`** (`AuditoriaTab`): tabela com data, ação
  (`Criação`/`Edição`/`Exclusão` — label em português só na UI, o valor
  cru continua sendo a chave do enum), campo alterado, valor anterior,
  valor novo, alterado por (`a.usuario?.nomeCompleto ?? "—"`, mesmo
  padrão). Não tem fallback de "sem permissão" dentro do componente de
  propósito: se chegou a montar, a permissão já foi conferida (ver
  próximo parágrafo).

**Achado real corrigido nesta rodada**: a primeira versão deste módulo
tinha `nome-usuario.ts`, um helper que só conseguia resolver "quem
alterou" pro próprio usuário logado (`useAuth().user`), caindo pro id cru
pra qualquer outro usuário — porque as rotas da API só devolviam
`alteradoPorId`/`usuarioId`, sem nome, e não existe endpoint de listagem
de usuários pro frontend resolver isso por conta própria. Ou seja: um
Administrador olhando a auditoria de uma mudança feita por OUTRA pessoa
via um UUID sem sentido, não o nome dela — o cenário de uso real e mais
comum da tela. Corrigido no backend (`include: { alteradoPor: {...} } }`/
`include: { usuario: {...} } }` nas duas rotas, populando `{ id,
nomeCompleto }` — ver seção "Histórico e auditoria (Fase 4)" acima), não
no frontend: o frontend só passou a ler o campo já populado.
`nome-usuario.ts` foi removido (sem mais uso).

**Aba "Auditoria" ausente, não só bloqueada, pra quem não é
Administrador** (`src/lib/permissions.ts`, `canViewAuditoria` — espelha
exatamente `requireRole("Administrador")` em
`auditoria-contratos.routes.ts`): `contrato-detail-page.tsx` só renderiza
o `TabsTrigger` E o `TabsContent` da aba quando `canViewAuditoria` dá
`true`. Diferente de `canWriteSector`/`canWriteReferences` (que escondem
só o formulário, mantendo a aba/tela visível em modo leitura), aqui a aba
inteira não existe no DOM pra outros perfis — não faz sentido de UX
mostrar uma aba cujo `GET` sempre responde `403`. Confirmado que isso não
é só CSS escondendo o conteúdo: nenhuma requisição a `.../auditoria`
chega a ser disparada pra um perfil sem permissão (o componente
`AuditoriaTab` nunca monta, então o hook `useAuditoria` nunca roda).

**Verificado de ponta a ponta num navegador real (Chrome, via
claude-in-chrome)**, como Administrador:

- Editado um campo em Produção (`observacoesProducao`) → nova linha
  apareceu no topo da aba Auditoria (mais recente primeiro), com o campo,
  valor anterior/novo e "Administrador" em "Alterado por" corretos.
- Mudado o status do contrato (via `PATCH /contratos/:id`, tela de
  edição) → nova linha apareceu na aba Histórico com status
  anterior/novo resolvidos pro nome certo e "Administrador" em "Alterado
  por".
- Confirmado com um usuário de teste de perfil único (`Comercial`,
  criado via SQL direto só pra este teste e removido ao final): a aba
  Auditoria não apareceu na lista de abas (só Produção/Ambiental/
  Logística/Financeiro/Histórico, 5 abas em vez de 6) — nem no DOM, nem
  disparando requisição.
- **O cenário que estava quebrado, reconfirmado depois da correção**:
  criado um segundo usuário de teste (`teste-operacional`, perfil
  `Operacional`, via SQL direto), editado um campo em Produção logado
  como ELE, depois trocado a sessão de volta pro Administrador — a linha
  correspondente na aba Auditoria mostrou **"Usuario Teste Operacional"**
  em "Alterado por", não o UUID nem "—". Ambos os usuários de teste
  removidos ao final.
- Reconfirmado também via chamada direta à API (`curl`, sem passar pelo
  frontend) que `alteradoPor`/`usuario` vêm como `null` — não quebram,
  não lançam erro — na linha de auditoria de um usuário que foi excluído
  depois de fazer a mudança (mesmo cenário do achado da rodada anterior,
  reconfirmado após a mudança na query).

Console do navegador sem erros em nenhuma das rodadas. Os 7 smoke tests
(`fase1-cookie-auth`, `fase2`, `fase3-producao`, `fase3-ambiental`,
`fase3-logistica`, `fase3-financeiro`, `fase4`) reconfirmados juntos depois
da mudança, todos OK.

## Estrutura

```
apps/api/
  src/
    lib/          # prisma client, jwt sign/verify, paginação, tradução de erros do Prisma
    middleware/   # auth, tenant-scoping, roles, audit-logger
    modules/      # um módulo por entidade (auth, especies, produtos, importadores,
                   # representantes, status-contrato, contratos, detalhes-producao,
                   # detalhes-ambiental, detalhes-logistica, detalhes-financeiro,
                   # historico-status-contrato, auditoria-contratos — Fases 1-4 completas)
    plugins/      # protected-context (hooks centrais de auth+tenant-scoping)
  scripts/        # smoke tests por fase (smoke-test-fase1-cookie-auth.ts, smoke-test-fase2.ts,
                   # smoke-test-fase3-producao.ts, smoke-test-fase3-ambiental.ts,
                   # smoke-test-fase3-logistica.ts, smoke-test-fase3-financeiro.ts,
                   # smoke-test-fase4.ts)
apps/web/          # React + Vite — Fases 0, 1, 2, 3 e 4 prontas, ver seção "Frontend" acima
  src/
    components/
      layout/     # AppLayout, Sidebar (navegação + logout)
      ui/         # componentes shadcn/ui (button, input, label, card, table, select, dialog, form, checkbox, tabs)
      full-page-loading.tsx  # estado de carregamento (boot da sessão)
      pagination-controls.tsx # Anterior/Próxima — reusado por referências, contratos e histórico/auditoria
    features/
      referencias/  # especies/produtos/importadores/representantes/status-contrato-page.tsx
                     # (config sobre reference-crud-page.tsx, o CRUD genérico), hooks.ts, types.ts
      contratos/    # contratos-list-page, contrato-create/edit/detail-page, contrato-form.tsx
                     # (formulário único, reusado por criar e editar), hooks.ts, types.ts
        setores/    # abas Produção/Ambiental/Logística/Financeiro da tela de detalhe (Fase 3):
                     # field-config.ts (schema declarativo dos campos por setor), sector-form.tsx
                     # (formulário genérico), sector-read-only.tsx, sector-tab.tsx (casca comum),
                     # hooks.ts (GET+PUT por setor), producao/ambiental/logistica/financeiro-tab.tsx
        historico-auditoria/  # abas Histórico/Auditoria da tela de detalhe (Fase 4): types.ts,
                     # hooks.ts (GET paginado por aba, "alterado por" já populado pela API),
                     # historico-tab.tsx, auditoria-tab.tsx (só monta se canViewAuditoria — aba
                     # ausente pra quem não é Admin)
    lib/          # api-client (fetch central + refreshSession deduplicado), auth-context
                   # (AuthProvider/useAuth), permissions (canWriteReferences, canWriteSector,
                   # canViewAuditoria), pagination (types Paginated/PaginationMeta),
                   # query-client (TanStack Query), utils (cn)
    pages/        # login-page.tsx
    routes/       # route-guards (ProtectedRoute, PublicOnlyRoute)
packages/shared-types/ # types compartilhados (ainda vazio na Fase 0)
```
