/*
  Warnings:

  - You are about to alter the column `comissao_pct` on the `contratos` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,2)`.
  - You are about to alter the column `comissao_metragem` on the `contratos` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `valor_total_usd` on the `contratos` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `nf_valor_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `invoice_valor` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_cambial` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,6)`.
  - You are about to alter the column `valor_recebido_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `valor_comissao_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `valor_comissao_dolar` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxas_locais_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_scanner_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_detentions_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_certificado_origem_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_certificado_fitosanitario_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_certificado_fumigacao_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_waybill_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_cites_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `frete_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `taxa_lpco_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `despachante_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.
  - You are about to alter the column `dhl_reais` on the `detalhes_financeiro` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,2)`.

*/
-- AlterTable
ALTER TABLE "contratos" ALTER COLUMN "comissao_pct" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "comissao_metragem" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "valor_total_usd" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "detalhes_financeiro" ALTER COLUMN "nf_valor_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "invoice_valor" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_cambial" SET DATA TYPE DECIMAL(10,6),
ALTER COLUMN "valor_recebido_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "valor_comissao_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "valor_comissao_dolar" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxas_locais_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_scanner_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_detentions_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_certificado_origem_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_certificado_fitosanitario_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_certificado_fumigacao_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_waybill_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_cites_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "frete_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxa_lpco_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "despachante_reais" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "dhl_reais" SET DATA TYPE DECIMAL(14,2);
