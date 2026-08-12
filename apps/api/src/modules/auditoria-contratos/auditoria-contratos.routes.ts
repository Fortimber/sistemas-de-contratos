import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { requireRole } from "../../middleware/roles.js";

/**
 * auditoria_contratos não tem organizacaoId direto — mesmo padrão dos
 * módulos setoriais: confirma explicitamente que o contrato existe e
 * pertence à organização do usuário ANTES de listar (404 claro), com a RLS
 * (policy EXISTS contra contratos) como segunda camada. As linhas em si são
 * gravadas automaticamente pelo middleware/audit-logger.ts (Prisma Client
 * Extension) em toda escrita de contratos/detalhes_*, não por uma rota de
 * escrita própria — esse módulo só lê.
 *
 * Leitura restrita a Administrador (proposta ajustável — é dado mais
 * granular/sensível que historico-status, que é aberto a todos): cada linha
 * expõe o valor antes/depois campo a campo, incluindo dado financeiro.
 *
 * `include: { usuario: {...} } }` popula quem fez a alteração — mesmo padrão
 * de `RELATION_INCLUDE` em contratos.service.ts, e mesmo motivo/mesma
 * correção de gap real aplicada em historico-status-contrato.routes.ts (ver
 * comentário lá): sem isso o frontend só tinha o id cru, sem jeito de
 * resolver pra nome. `select` limitado a `{ id, nomeCompleto }`.
 * `usuarioId` é opcional no schema — nulo (ou apontando pra usuário já
 * excluído, FK com `ON DELETE SET NULL`) vira `usuario: null` sozinho.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function auditoriaContratosRoutes(app: FastifyInstance) {
  app.get(
    "/contratos/:contratoId/auditoria",
    { preHandler: requireRole("Administrador") },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });

      const [data, total] = await Promise.all([
        request.db.auditoriaContrato.findMany({
          where: { contratoId },
          skip,
          take,
          orderBy: { dataHora: "desc" },
          include: {
            usuario: { select: { id: true, nomeCompleto: true } },
          },
        }),
        request.db.auditoriaContrato.count({ where: { contratoId } }),
      ]);

      return { data, meta: paginationMeta(page, pageSize, total) };
    },
  );
}
