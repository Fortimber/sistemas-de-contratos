-- AlterTable
ALTER TABLE "contratos" ADD COLUMN     "requer_certificado_fitossanitario" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requer_certificado_kiln_dried" BOOLEAN NOT NULL DEFAULT false;
