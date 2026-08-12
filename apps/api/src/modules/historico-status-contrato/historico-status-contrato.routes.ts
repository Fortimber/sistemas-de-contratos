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
 * `include: { alteradoPor: {...} }` popula o usuário que fez a mudança —
 * mesmo padrão de `RELATION_INCLUDE` em contratos.service.ts (populariza
 * importador/representante/produto/status em vez de deixar só o id).
 * `select` limitado a `{ id, nomeCompleto }` (não o objeto Usuario inteiro,
 * que carrega senhaHash e email) — achado real corrigindo um gap da Fase 4:
 * antes disso o frontend só tinha o id cru de quem alterou, sem nenhum jeito
 * de resolver pra nome (não existe endpoint de listagem de usuários na
 * API). `alteradoPorId` é opcional no schema — quando nulo, ou quando aponta
 * pra um usuário já excluído (a FK usa `ON DELETE SET NULL`), o Prisma
 * resolve `alteradoPor` como `null` sozinho, sem lançar erro.
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
        include: {
          alteradoPor: { select: { id: true, nomeCompleto: true } },
        },
      }),
      request.db.historicoStatusContrato.count({ where: { contratoId } }),
    ]);

    return { data, meta: paginationMeta(page, pageSize, total) };
  });
}
