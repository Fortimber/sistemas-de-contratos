-- RenameColumn (preco_por_m3_usd -> preco_por_m3) — escrita à mão como
-- RENAME COLUMN, não DROP+ADD: o diff automático do `prisma migrate dev`
-- não reconhece rename de coluna sozinho e geraria um DROP COLUMN seguido
-- de ADD COLUMN, perdendo qualquer valor já salvo. RENAME preserva o dado.
ALTER TABLE "itens_contrato" RENAME COLUMN "preco_por_m3_usd" TO "preco_por_m3";

-- AddColumn (moeda) — sem NOT NULL ainda, pra permitir o backfill abaixo
-- antes de tornar a coluna obrigatória pra linhas existentes.
ALTER TABLE "itens_contrato" ADD COLUMN "moeda" TEXT;

-- Backfill: todo item criado antes desta migration tinha preço
-- implicitamente em USD (era hardcoded no campo antigo preco_por_m3_usd) —
-- preserva esse significado nos dados já salvos antes de exigir o campo.
UPDATE "itens_contrato" SET "moeda" = 'USD' WHERE "moeda" IS NULL;

ALTER TABLE "itens_contrato" ALTER COLUMN "moeda" SET NOT NULL;
