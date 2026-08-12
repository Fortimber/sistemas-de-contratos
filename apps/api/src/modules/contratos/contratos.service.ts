import type { scopedPrisma } from "../../middleware/tenant-scoping.js";

type Db = ReturnType<typeof scopedPrisma>;

/**
 * Usado em GET/:id e nas respostas de POST/PATCH — relações populadas, não
 * só ids. `contratoPai`/`aditivos` são novos (vínculo Original/Aditivo):
 * incluídos sempre, não condicionalmente por `tipoContrato` — um Original
 * naturalmente resolve `contratoPai: null` (não tem) e um Aditivo resolve
 * `aditivos: []` (regra de negócio: aditivo nunca é pai de outro aditivo,
 * ver `validarVinculoAditivo` abaixo, então essa lista sempre vem vazia
 * pra quem é Aditivo). `select` reduzido ({ id, numeroContrato }), não o
 * Contrato inteiro — evita, por exemplo, um aditivo trazendo os dados
 * financeiros completos do original só por causa desse vínculo.
 */
export const RELATION_INCLUDE = {
  importador: true,
  representante: true,
  produto: true,
  status: true,
  contratoPai: { select: { id: true, numeroContrato: true } },
  aditivos: { select: { id: true, numeroContrato: true } },
} as const;

export class ReferenciaInvalidaError extends Error {
  constructor(public readonly campo: string) {
    super(`O campo "${campo}" não existe ou não pertence à sua organização.`);
  }
}

/** Vínculo Original/Aditivo inválido — ver validarVinculoAditivo. */
export class VinculoAditivoInvalidoError extends Error {}

interface ContratoRefs {
  importadorId?: string;
  representanteId?: string;
  produtoId?: string;
  statusId?: string;
}

/**
 * Confirma que cada FK enviada existe e pertence à organização do usuário
 * ANTES do insert/update — sem isso, um id inválido ou de outra organização
 * vira uma violação de FK crua e confusa vinda direto do Postgres. `db` já
 * é escopado por organização (tenant-scoping.ts + RLS), então "existe" aqui
 * já significa "existe NESSA organização".
 *
 * `contratoPaiId` NÃO está aqui de propósito — ao contrário das outras FKs
 * (que só precisam existir), ele carrega uma regra de negócio própria
 * (só pode apontar pra um Original, obrigatório quando Aditivo, proibido
 * quando Original) — ver `validarVinculoAditivo`, que já cobre "existe e
 * pertence à organização" como parte dessa validação mais específica.
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
}

/**
 * Regra de negócio do vínculo Original/Aditivo (schema já suportava —
 * `tipoContrato`/`contratoPaiId` —, faltava só isto):
 *
 * - `tipoContrato = "Original"`: `contratoPaiId` tem que ser null/ausente.
 * - `tipoContrato = "Aditivo"`: `contratoPaiId` é obrigatório, precisa
 *   existir, pertencer à mesma organização, e o contrato referenciado
 *   precisa ser um "Original" — nunca outro "Aditivo" (sem encadeamento:
 *   aditivo sempre vincula direto ao original, nunca a outro aditivo).
 *
 * Chamada tanto no POST quanto no PATCH (`contratos.routes.ts`), sempre
 * com os valores EFETIVOS (já mesclados com o que já existia, no caso do
 * PATCH — ver o handler) — assim a regra vale tanto pra quem cria já como
 * Aditivo quanto pra quem edita um contrato existente pra virar um.
 *
 * `contratoAtualId` (só passado no PATCH, contrato já existe) fecha um
 * furo que a regra acima sozinha não cobre: sem isso, seria possível pegar
 * um Original que JÁ TEM aditivos vinculados a ele e, via PATCH, virar um
 * Aditivo de outro contrato — criando encadeamento indireto (o aditivo
 * dele continuaria apontando pra ele, que passaria a apontar pra outro
 * original). Bloqueado aqui: um contrato que já é `contratoPai` de algum
 * aditivo não pode virar Aditivo sem antes desvincular esses aditivos.
 */
export async function validarVinculoAditivo(
  db: Db,
  tipoContrato: "Original" | "Aditivo",
  contratoPaiId: string | null | undefined,
  contratoAtualId?: string,
): Promise<void> {
  if (tipoContrato === "Original") {
    if (contratoPaiId) {
      throw new VinculoAditivoInvalidoError(
        'Um contrato "Original" não pode ter um contrato pai — o campo "contratoPaiId" só se aplica a contratos do tipo "Aditivo".',
      );
    }
    return;
  }

  // tipoContrato === "Aditivo"
  if (!contratoPaiId) {
    throw new VinculoAditivoInvalidoError(
      'O campo "contratoPaiId" é obrigatório quando "tipoContrato" é "Aditivo".',
    );
  }

  const pai = await db.contrato.findFirst({ where: { id: contratoPaiId } });
  if (!pai) throw new ReferenciaInvalidaError("contratoPaiId");
  if (pai.tipoContrato !== "Original") {
    throw new VinculoAditivoInvalidoError(
      'O campo "contratoPaiId" precisa apontar para um contrato do tipo "Original" — não é permitido vincular um Aditivo a outro Aditivo (sem encadeamento).',
    );
  }

  if (contratoAtualId) {
    const possuiAditivos = await db.contrato.findFirst({ where: { contratoPaiId: contratoAtualId } });
    if (possuiAditivos) {
      throw new VinculoAditivoInvalidoError(
        "Este contrato já tem aditivos vinculados a ele — não é possível torná-lo um \"Aditivo\" sem antes desvincular esses aditivos.",
      );
    }
  }
}
