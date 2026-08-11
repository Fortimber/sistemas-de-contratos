-- Row-Level Security (RLS) — segunda camada de isolamento multi-tenant,
-- em defesa em profundidade além do filtro de aplicação (ver
-- middleware/tenant-scoping.ts e ARCHITECTURE.md seção 3).
--
-- FORCE ROW LEVEL SECURITY é essencial: por padrão o Postgres isenta o DONO
-- da tabela das policies de RLS. A API se conecta via DATABASE_URL usando
-- exatamente esse role dono (foi ele quem rodou as migrations) — sem FORCE,
-- toda query da aplicação ignoraria a policy silenciosamente e essa "segunda
-- camada" seria só decoração.
--
-- As policies leem `current_setting('app.current_organizacao_id')`, uma GUC
-- de sessão/transação que o middleware de tenant-scoping passa a popular via
-- `SELECT set_config('app.current_organizacao_id', $1, true)` como primeira
-- instrução de cada transação por requisição (terceiro argumento `true` =
-- escopo de transação, evita vazamento entre requisições que reusam conexão
-- do pool). Os ids do schema são colunas TEXT (Prisma `String @default(uuid())`
-- sem `@db.Uuid`), então o cast `::uuid` é aplicado dos dois lados para
-- comparar por valor e não por formatação de string.

-- ---------------------------------------------------------------------------
-- Tabelas com organizacao_id direto
-- ---------------------------------------------------------------------------

ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usuarios"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "especies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "especies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "especies"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "produtos"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "importadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "importadores" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "importadores"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "representantes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "representantes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "representantes"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "status_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "status_contrato" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "status_contrato"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

ALTER TABLE "contratos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contratos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contratos"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

-- ---------------------------------------------------------------------------
-- Tabelas com relação apenas indireta com organizacao (via contrato_id) —
-- policy via EXISTS contra "contratos", que já carrega a policy acima.
-- ---------------------------------------------------------------------------

ALTER TABLE "historico_status_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "historico_status_contrato" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "historico_status_contrato"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "historico_status_contrato"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "auditoria_contratos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditoria_contratos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "auditoria_contratos"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "auditoria_contratos"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "anexos_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anexos_contrato" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "anexos_contrato"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "anexos_contrato"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "detalhes_producao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detalhes_producao" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "detalhes_producao"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "detalhes_producao"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "detalhes_ambiental" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detalhes_ambiental" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "detalhes_ambiental"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "detalhes_ambiental"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "detalhes_logistica" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detalhes_logistica" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "detalhes_logistica"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "detalhes_logistica"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

ALTER TABLE "detalhes_financeiro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detalhes_financeiro" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "detalhes_financeiro"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "detalhes_financeiro"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

-- ---------------------------------------------------------------------------
-- Role de runtime da API — privilégio mínimo, sem SUPERUSER/BYPASSRLS.
-- ---------------------------------------------------------------------------
-- O role usado em DATABASE_URL para rodar migrations ("contratos", ver
-- .env) é o superuser bootstrap do container Postgres (POSTGRES_USER da
-- imagem oficial). Superusers, e qualquer role com BYPASSRLS, ignoram Row-
-- Level Security incondicionalmente — FORCE ROW LEVEL SECURITY não tem
-- nenhum efeito sobre eles (FORCE só afeta o DONO da tabela, que por sua vez
-- também é "contratos" aqui). Ou seja: se a API continuasse se conectando
-- como "contratos" para servir dado de negócio, toda a RLS acima seria
-- inerte, dando falsa sensação de proteção — o mesmo risco citado no
-- comentário sobre FORCE no início deste arquivo, um nível abaixo.
--
-- Por isso a API passa a se conectar com um role separado e restrito
-- (APP_DATABASE_URL, ver lib/prisma.ts) para tudo que é dado de negócio
-- tenant-scoped — migrations continuam rodando com "contratos". A senha
-- desse role não é definida aqui: migrations são commitadas no git, senha
-- não pode ir junto. Ver README.md ("Role de runtime da API").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
