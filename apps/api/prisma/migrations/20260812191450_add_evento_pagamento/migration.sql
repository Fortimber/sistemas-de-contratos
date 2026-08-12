-- AlterTable
ALTER TABLE "detalhes_financeiro" ADD COLUMN     "prazo_pagamento_dias" INTEGER,
ADD COLUMN     "prazo_pagamento_direcao" TEXT,
ADD COLUMN     "prazo_pagamento_evento_id" TEXT;

-- CreateTable
CREATE TABLE "eventos_pagamento" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_evento" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventos_pagamento_organizacao_id_nome_evento_key" ON "eventos_pagamento"("organizacao_id", "nome_evento");

-- AddForeignKey
ALTER TABLE "eventos_pagamento" ADD CONSTRAINT "eventos_pagamento_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalhes_financeiro" ADD CONSTRAINT "detalhes_financeiro_prazo_pagamento_evento_id_fkey" FOREIGN KEY ("prazo_pagamento_evento_id") REFERENCES "eventos_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RowLevelSecurity — mesmo padrão de 20260811120852_add_row_level_security
-- (organizacao_id direto, ver comentário completo naquela migration): tabela
-- nova criada depois daquela migration precisa da própria policy aqui, não
-- é herdada automaticamente.
ALTER TABLE "eventos_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_pagamento" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eventos_pagamento"
  USING ("organizacao_id"::uuid = current_setting('app.current_organizacao_id')::uuid);

-- GRANT já coberto por ALTER DEFAULT PRIVILEGES daquela mesma migration
-- (aplica a toda tabela futura criada pelo role de migrations).
