-- CreateTable
CREATE TABLE "itens_contrato" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "espessura_mm" DECIMAL(8,2) NOT NULL,
    "largura_mm" DECIMAL(8,2) NOT NULL,
    "comprimento_min_mm" DECIMAL(10,2) NOT NULL,
    "comprimento_max_mm" DECIMAL(10,2) NOT NULL,
    "volume_m3" DECIMAL(12,4) NOT NULL,
    "preco_por_m3_usd" DECIMAL(14,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_contrato_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "itens_contrato" ADD CONSTRAINT "itens_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RowLevelSecurity — mesmo padrão de 20260811120852_add_row_level_security
-- (EXISTS contra "contratos", já que itens_contrato não tem organizacao_id
-- direto, mesmo caso de detalhes_producao/ambiental/logistica/financeiro).
ALTER TABLE "itens_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "itens_contrato" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "itens_contrato"
  USING (
    EXISTS (
      SELECT 1 FROM "contratos" c
      WHERE c."id" = "itens_contrato"."contrato_id"
        AND c."organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid
    )
  );

-- GRANT já coberto por ALTER DEFAULT PRIVILEGES (mesma migration de RLS
-- original) — aplica a toda tabela futura criada pelo role de migrations.
