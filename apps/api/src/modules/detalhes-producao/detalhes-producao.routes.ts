import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/roles.js";

const putBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    numeroRomaneio: { type: "string", minLength: 1 },
    volumeRomaneioM3: { type: "number", exclusiveMinimum: 0 },
    qtdContainersConfirmada: { type: "integer", minimum: 0 },
    observacoesProducao: { type: "string" },
    dataCocEnviadaDespachante: { type: "string", format: "date" },
  },
} as const;

interface ProducaoBody {
  numeroRomaneio?: string;
  volumeRomaneioM3?: number;
  qtdContainersConfirmada?: number;
  observacoesProducao?: string;
  dataCocEnviadaDespachante?: string;
}

const WRITE_ROLES = requireRole("Administrador", "Operacional");

/**
 * detalhes_producao não tem organizacaoId direto (só contratoId) — não é um
 * TENANT_SCOPED_MODEL em tenant-scoping.ts, então request.db não injeta
 * filtro nenhum nessas queries automaticamente. O isolamento aqui vem de
 * duas camadas: (1) confirmamos explicitamente que o contrato existe E
 * pertence à organização do usuário ANTES de tocar em detalhes_producao —
 * é o que dá a mensagem 404 clara pedida; (2) a RLS do Postgres (policy
 * EXISTS contra contratos, ver migration add_row_level_security) barra
 * qualquer leitura cruzada mesmo que o passo (1) tivesse um bug.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function detalhesProducaoRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/producao", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const detalhes = await request.db.detalhesProducao.findUnique({ where: { contratoId } });
    if (!detalhes) {
      return reply
        .code(404)
        .send({ message: "Detalhes de produção ainda não foram preenchidos para esse contrato." });
    }

    return detalhes;
  });

  app.put(
    "/contratos/:contratoId/producao",
    { preHandler: WRITE_ROLES, schema: { body: putBodySchema } },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };
      const body = request.body as ProducaoBody;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      // dataCocEnviadaDespachante precisa virar Date: o Prisma não aceita
      // "YYYY-MM-DD" puro como string (mesmo caso de contratos.dataContrato).
      const data = {
        ...body,
        ...(body.dataCocEnviadaDespachante !== undefined
          ? { dataCocEnviadaDespachante: new Date(body.dataCocEnviadaDespachante) }
          : {}),
      };

      const detalhes = await request.db.detalhesProducao.upsert({
        where: { contratoId },
        create: { contratoId, ...data },
        update: data,
      });

      return detalhes;
    },
  );
}
