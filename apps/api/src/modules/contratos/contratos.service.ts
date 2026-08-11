import type { scopedPrisma } from "../../middleware/tenant-scoping.js";

type Db = ReturnType<typeof scopedPrisma>;

/** Usado em GET/:id e nas respostas de POST/PATCH — relações populadas, não só ids. */
export const RELATION_INCLUDE = {
  importador: true,
  representante: true,
  produto: true,
  status: true,
} as const;

export class ReferenciaInvalidaError extends Error {
  constructor(public readonly campo: string) {
    super(`O campo "${campo}" não existe ou não pertence à sua organização.`);
  }
}

interface ContratoRefs {
  importadorId?: string;
  representanteId?: string;
  produtoId?: string;
  statusId?: string;
  contratoPaiId?: string;
}

/**
 * Confirma que cada FK enviada existe e pertence à organização do usuário
 * ANTES do insert/update — sem isso, um id inválido ou de outra organização
 * vira uma violação de FK crua e confusa vinda direto do Postgres. `db` já
 * é escopado por organização (tenant-scoping.ts + RLS), então "existe" aqui
 * já significa "existe NESSA organização".
 */
export async function validarReferencias(db: Db, refs: ContratoRefs): Promise<void> {
  if (refs.importadorId !== undefined) {
    const found = await db.importador.findFirst({ where: { id: refs.importadorId } });
    if (!found) throw new ReferenciaInvalidaError("importadorId");
  }
  if (refs.representanteId !== undefined) {
    const found = await db.representante.findFirst({ where: { id: refs.representanteId } });
    if (!found) throw new ReferenciaInvalidaError("representanteId");
  }
  if (refs.produtoId !== undefined) {
    const found = await db.produto.findFirst({ where: { id: refs.produtoId } });
    if (!found) throw new ReferenciaInvalidaError("produtoId");
  }
  if (refs.statusId !== undefined) {
    const found = await db.statusContrato.findFirst({ where: { id: refs.statusId } });
    if (!found) throw new ReferenciaInvalidaError("statusId");
  }
  if (refs.contratoPaiId !== undefined) {
    const found = await db.contrato.findFirst({ where: { id: refs.contratoPaiId } });
    if (!found) throw new ReferenciaInvalidaError("contratoPaiId");
  }
}
