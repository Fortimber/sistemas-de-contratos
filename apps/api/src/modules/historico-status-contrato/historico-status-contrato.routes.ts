import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";

/**
 * historico_status_contrato não tem organizacaoId direto — mesmo padrão dos
 * módulos setoriais: confirma explicitamente que o contrato existe e
 * pertence à organização do usuário ANTES de listar (404 claro), com a RLS
 * (policy EXISTS contra contratos) como segunda camada. As linhas em si são
 * gravadas pelo PATCH /contratos/:id (ver contratos.routes.ts), não por uma
 * rota de escrita própria — esse módulo só lê.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function historicoStatusContratoRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/historico-status", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });

    const [data, total] = await Promise.all([
      request.db.historicoStatusContrato.findMany({
        where: { contratoId },
        skip,
        take,
        orderBy: { dataAlteracao: "desc" },
      }),
      request.db.historicoStatusContrato.count({ where: { contratoId } }),
    ]);

    return { data, meta: paginationMeta(page, pageSize, total) };
  });
}
