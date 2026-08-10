-- CreateEnum
CREATE TYPE "PerfilAcesso" AS ENUM ('Administrador', 'Comercial', 'Operacional', 'Financeiro', 'Ambiental');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('Original', 'Aditivo');

-- CreateEnum
CREATE TYPE "TipoFrete" AS ENUM ('FOB', 'CFR', 'CIF');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('Criação', 'Edição', 'Exclusão');

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "perfil_acesso" "PerfilAcesso" NOT NULL,
    "deve_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especies" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_especie" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "especies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_produto" TEXT NOT NULL,
    "especie_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importadores" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_razao_social" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "importadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "representantes" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_representante" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "representantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_contrato" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nome_status" TEXT NOT NULL,
    "setor_responsavel" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "numero_contrato" TEXT NOT NULL,
    "importador_id" TEXT NOT NULL,
    "representante_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "status_id" TEXT NOT NULL,
    "tipo_contrato" "TipoContrato" NOT NULL,
    "data_contrato" DATE NOT NULL,
    "volume_m3" DOUBLE PRECISION NOT NULL,
    "qtd_containers" INTEGER NOT NULL,
    "local" TEXT NOT NULL,
    "tipo_frete" "TipoFrete" NOT NULL,
    "requer_fumigacao" BOOLEAN NOT NULL DEFAULT false,
    "certificacao_processo_origem" BOOLEAN NOT NULL DEFAULT false,
    "requer_cites" BOOLEAN NOT NULL DEFAULT false,
    "requer_fsc" BOOLEAN NOT NULL DEFAULT false,
    "comissao_pct" DOUBLE PRECISION,
    "comissao_metragem" DOUBLE PRECISION,
    "valor_total_usd" DOUBLE PRECISION NOT NULL,
    "moeda_valor_total" TEXT NOT NULL,
    "modalidade_pgt_conta_brasil" TEXT NOT NULL,
    "modalidade_pgt_conta_exterior" TEXT NOT NULL,
    "contrato_pai_id" TEXT,
    "criado_por" TEXT,
    "atualizado_por" TEXT,
    "responsavel_atual_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_status_contrato" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "status_anterior_id" TEXT,
    "status_novo_id" TEXT NOT NULL,
    "alterado_por" TEXT,
    "observacao" TEXT,
    "data_alteracao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_status_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_contratos" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "acao" "AcaoAuditoria" NOT NULL,
    "campo_alterado" TEXT,
    "valor_anterior" TEXT,
    "valor_novo" TEXT,
    "data_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos_contrato" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "nome_arquivo" TEXT,
    "arquivo_url" TEXT NOT NULL,
    "tipo_documento" TEXT NOT NULL,
    "enviado_por" TEXT,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalhes_producao" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "numero_romaneio" TEXT,
    "volume_romaneio_m3" DOUBLE PRECISION,
    "qtd_containers_confirmada" INTEGER,
    "observacoes_producao" TEXT,
    "data_coc_enviada_despachante" DATE,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalhes_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalhes_ambiental" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "autef" TEXT,
    "lpco_numero" TEXT,
    "lpco_status" TEXT,
    "lpco_data_protocolo" DATE,
    "lpco_data_validade" DATE,
    "cites_numero_requerimento" TEXT,
    "cites_numero" TEXT,
    "cites_data_entrada" DATE,
    "cites_data_validade" DATE,
    "cites_status" TEXT,
    "gf_numero" TEXT,
    "gf_data_vencimento" DATE,
    "gf_data_recebimento_sisflora" DATE,
    "dof_data_registro" DATE,
    "status_aprovacao_coc_cliente" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalhes_ambiental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalhes_logistica" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "cia_maritima" TEXT,
    "nome_navio" TEXT,
    "booking" TEXT,
    "container_numero" TEXT,
    "data_prancha" DATE,
    "data_draft_documentos" DATE,
    "data_draft_carga" DATE,
    "data_coleta_container" DATE,
    "data_pos_embarque_docs_cliente" DATE,
    "data_entrada_porto_destino" DATE,
    "data_prevista_saida_navio" DATE,
    "data_navio_no_destino" DATE,
    "bl_numero" TEXT,
    "bl_data" DATE,
    "porto_destino_pais" TEXT,
    "motorista" TEXT,
    "placa_veiculo" TEXT,
    "pagamento_bl" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalhes_logistica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalhes_financeiro" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "nf_numero" TEXT,
    "nf_data" DATE,
    "nf_volume_m3" DOUBLE PRECISION,
    "nf_valor_reais" DOUBLE PRECISION,
    "invoice_numero" TEXT,
    "invoice_valor" DOUBLE PRECISION,
    "data_fechamento_cambio" DATE,
    "banco" TEXT,
    "moeda_cambial" TEXT,
    "taxa_cambial" DOUBLE PRECISION,
    "valor_recebido_reais" DOUBLE PRECISION,
    "status_embarque_x_cambio" TEXT,
    "status_geral_cambio" TEXT,
    "forma_pagamento" TEXT,
    "comissao_sobre_venda" BOOLEAN DEFAULT false,
    "valor_comissao_reais" DOUBLE PRECISION,
    "valor_comissao_dolar" DOUBLE PRECISION,
    "taxas_locais_reais" DOUBLE PRECISION,
    "taxa_scanner_reais" DOUBLE PRECISION,
    "taxa_detentions_reais" DOUBLE PRECISION,
    "taxa_certificado_origem_reais" DOUBLE PRECISION,
    "taxa_certificado_fitosanitario_reais" DOUBLE PRECISION,
    "taxa_certificado_fumigacao_reais" DOUBLE PRECISION,
    "taxa_waybill_reais" DOUBLE PRECISION,
    "taxa_cites_reais" DOUBLE PRECISION,
    "frete_reais" DOUBLE PRECISION,
    "taxa_lpco_reais" DOUBLE PRECISION,
    "despachante_reais" DOUBLE PRECISION,
    "dhl_reais" DOUBLE PRECISION,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalhes_financeiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_organizacao_id_login_key" ON "usuarios"("organizacao_id", "login");

-- CreateIndex
CREATE UNIQUE INDEX "especies_organizacao_id_nome_especie_key" ON "especies"("organizacao_id", "nome_especie");

-- CreateIndex
CREATE UNIQUE INDEX "status_contrato_organizacao_id_nome_status_key" ON "status_contrato"("organizacao_id", "nome_status");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_organizacao_id_numero_contrato_key" ON "contratos"("organizacao_id", "numero_contrato");

-- CreateIndex
CREATE UNIQUE INDEX "detalhes_producao_contrato_id_key" ON "detalhes_producao"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "detalhes_ambiental_contrato_id_key" ON "detalhes_ambiental"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "detalhes_logistica_contrato_id_key" ON "detalhes_logistica"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "detalhes_financeiro_contrato_id_key" ON "detalhes_financeiro"("contrato_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "especies" ADD CONSTRAINT "especies_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_especie_id_fkey" FOREIGN KEY ("especie_id") REFERENCES "especies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importadores" ADD CONSTRAINT "importadores_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "representantes" ADD CONSTRAINT "representantes_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_contrato" ADD CONSTRAINT "status_contrato_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_importador_id_fkey" FOREIGN KEY ("importador_id") REFERENCES "importadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_representante_id_fkey" FOREIGN KEY ("representante_id") REFERENCES "representantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status_contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_contrato_pai_id_fkey" FOREIGN KEY ("contrato_pai_id") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_atualizado_por_fkey" FOREIGN KEY ("atualizado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_responsavel_atual_id_fkey" FOREIGN KEY ("responsavel_atual_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_contrato" ADD CONSTRAINT "historico_status_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_contrato" ADD CONSTRAINT "historico_status_contrato_status_anterior_id_fkey" FOREIGN KEY ("status_anterior_id") REFERENCES "status_contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_contrato" ADD CONSTRAINT "historico_status_contrato_status_novo_id_fkey" FOREIGN KEY ("status_novo_id") REFERENCES "status_contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_contrato" ADD CONSTRAINT "historico_status_contrato_alterado_por_fkey" FOREIGN KEY ("alterado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_contratos" ADD CONSTRAINT "auditoria_contratos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_contratos" ADD CONSTRAINT "auditoria_contratos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_contrato" ADD CONSTRAINT "anexos_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_contrato" ADD CONSTRAINT "anexos_contrato_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalhes_producao" ADD CONSTRAINT "detalhes_producao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalhes_ambiental" ADD CONSTRAINT "detalhes_ambiental_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalhes_logistica" ADD CONSTRAINT "detalhes_logistica_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalhes_financeiro" ADD CONSTRAINT "detalhes_financeiro_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
