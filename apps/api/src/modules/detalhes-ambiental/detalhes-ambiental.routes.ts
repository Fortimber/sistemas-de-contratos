import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/roles.js";

/** Valores originais do sistema anterior — ver comentário em schema.prisma. */
const LPCO_STATUS = ["Em análise", "Protocolada", "Deferida", "Indeferida"] as const;
const CITES_STATUS = ["Não se aplica", "Em análise", "Deferida", "Indeferida"] as const;
const STATUS_APROVACAO_COC = ["Pendente", "Aprovado", "Reprovado"] as const;

const putBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    autef: { type: "string", minLength: 1 },
    lpcoNumero: { type: "string", minLength: 1 },
    lpcoStatus: { type: "string", enum: LPCO_STATUS },
    lpcoDataProtocolo: { type: "string", format: "date" },
    lpcoDataValidade: { type: "string", format: "date" },
    citesNumeroRequerimento: { type: "string", minLength: 1 },
    citesNumero: { type: "string", minLength: 1 },
    citesDataEntrada: { type: "string", format: "date" },
    citesDataValidade: { type: "string", format: "date" },
    citesStatus: { type: "string", enum: CITES_STATUS },
    gfNumero: { type: "string", minLength: 1 },
    gfDataVencimento: { type: "string", format: "date" },
    gfDataRecebimentoSisflora: { type: "string", format: "date" },
    dofDataRegistro: { type: "string", format: "date" },
    statusAprovacaoCocCliente: { type: "string", enum: STATUS_APROVACAO_COC },
  },
} as const;

interface AmbientalBody {
  autef?: string;
  lpcoNumero?: string;
  lpcoStatus?: (typeof LPCO_STATUS)[number];
  lpcoDataProtocolo?: string;
  lpcoDataValidade?: string;
  citesNumeroRequerimento?: string;
  citesNumero?: string;
  citesDataEntrada?: string;
  citesDataValidade?: string;
  citesStatus?: (typeof CITES_STATUS)[number];
  gfNumero?: string;
  gfDataVencimento?: string;
  gfDataRecebimentoSisflora?: string;
  dofDataRegistro?: string;
  statusAprovacaoCocCliente?: (typeof STATUS_APROVACAO_COC)[number];
}

const WRITE_ROLES = requireRole("Administrador", "Ambiental");

/**
 * detalhes_ambiental não tem organizacaoId direto (só contratoId) — mesmo
 * padrão de detalhes_producao: confirmamos explicitamente que o contrato
 * existe e pertence à organização do usuário ANTES do upsert (404 claro),
 * com a RLS (policy EXISTS contra contratos) como segunda camada.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function detalhesAmbientalRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/ambiental", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const detalhes = await request.db.detalhesAmbiental.findUnique({ where: { contratoId } });
    if (!detalhes) {
      return reply
        .code(404)
        .send({ message: "Detalhes ambientais ainda não foram preenchidos para esse contrato." });
    }

    return detalhes;
  });

  app.put(
    "/contratos/:contratoId/ambiental",
    { preHandler: WRITE_ROLES, schema: { body: putBodySchema } },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };
      const body = request.body as AmbientalBody;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      if (body.lpcoDataProtocolo !== undefined && body.lpcoDataValidade !== undefined) {
        if (new Date(body.lpcoDataValidade) < new Date(body.lpcoDataProtocolo)) {
          return reply
            .code(400)
            .send({ message: "lpcoDataValidade não pode ser anterior a lpcoDataProtocolo." });
        }
      }
      if (body.citesDataEntrada !== undefined && body.citesDataValidade !== undefined) {
        if (new Date(body.citesDataValidade) < new Date(body.citesDataEntrada)) {
          return reply
            .code(400)
            .send({ message: "citesDataValidade não pode ser anterior a citesDataEntrada." });
        }
      }

      // Campos de data precisam virar Date: o Prisma não aceita "YYYY-MM-DD"
      // puro como string (mesmo caso de contratos.dataContrato).
      const data = {
        ...body,
        ...(body.lpcoDataProtocolo !== undefined ? { lpcoDataProtocolo: new Date(body.lpcoDataProtocolo) } : {}),
        ...(body.lpcoDataValidade !== undefined ? { lpcoDataValidade: new Date(body.lpcoDataValidade) } : {}),
        ...(body.citesDataEntrada !== undefined ? { citesDataEntrada: new Date(body.citesDataEntrada) } : {}),
        ...(body.citesDataValidade !== undefined ? { citesDataValidade: new Date(body.citesDataValidade) } : {}),
        ...(body.gfDataVencimento !== undefined ? { gfDataVencimento: new Date(body.gfDataVencimento) } : {}),
        ...(body.gfDataRecebimentoSisflora !== undefined
          ? { gfDataRecebimentoSisflora: new Date(body.gfDataRecebimentoSisflora) }
          : {}),
        ...(body.dofDataRegistro !== undefined ? { dofDataRegistro: new Date(body.dofDataRegistro) } : {}),
      };

      const detalhes = await request.db.detalhesAmbiental.upsert({
        where: { contratoId },
        create: { contratoId, ...data },
        update: data,
      });

      return detalhes;
    },
  );
}
