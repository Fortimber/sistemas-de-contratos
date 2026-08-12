import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isUniqueConstraintError, isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

const createBodySchema = {
  type: "object",
  required: ["nomeEvento"],
  additionalProperties: false,
  properties: {
    nomeEvento: { type: "string", minLength: 1 },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeEvento: { type: "string", minLength: 1 },
  },
} as const;

// Diferente das demais tabelas de referência (Administrador+Comercial):
// evento de pagamento é conceito do setor Financeiro (ver
// DetalhesFinanceiro.prazoPagamentoEventoId), pedido da própria área
// (Carolina) — escrita restrita a Administrador+Financeiro.
const WRITE_ROLES = requireRole("Administrador", "Financeiro");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function eventosPagamentoRoutes(app: FastifyInstance) {
  app.get("/eventos-pagamento", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.eventoPagamento.findMany({ skip, take, orderBy: { nomeEvento: "asc" } }),
      request.db.eventoPagamento.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/eventos-pagamento/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const evento = await request.db.eventoPagamento.findFirst({ where: { id } });
    if (!evento) return reply.code(404).send({ message: "Evento de pagamento não encontrado." });
    return evento;
  });

  app.post(
    "/eventos-pagamento",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const { nomeEvento } = request.body as { nomeEvento: string };

      try {
        // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
        // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma, que não
        // enxerga a injeção feita em runtime pela extensão.
        const evento = await request.db.eventoPagamento.create({
          data: { nomeEvento, organizacaoId: request.user!.organizacaoId },
        });
        return reply.code(201).send(evento);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply
            .code(409)
            .send({ message: "Já existe um evento de pagamento com esse nome nesta organização." });
        }
        throw err;
      }
    },
  );

  app.patch(
    "/eventos-pagamento/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeEvento?: string };

      const existing = await request.db.eventoPagamento.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Evento de pagamento não encontrado." });

      try {
        await request.db.eventoPagamento.updateMany({ where: { id }, data });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply
            .code(409)
            .send({ message: "Já existe um evento de pagamento com esse nome nesta organização." });
        }
        throw err;
      }

      return request.db.eventoPagamento.findFirst({ where: { id } });
    },
  );

  app.delete("/eventos-pagamento/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.eventoPagamento.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Evento de pagamento não encontrado." });

    try {
      await request.db.eventoPagamento.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: esse evento de pagamento está em uso por um ou mais contratos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
