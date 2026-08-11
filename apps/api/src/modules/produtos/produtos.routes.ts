import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

const createBodySchema = {
  type: "object",
  required: ["nomeProduto", "especieId"],
  additionalProperties: false,
  properties: {
    nomeProduto: { type: "string", minLength: 1 },
    especieId: { type: "string", minLength: 1 },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeProduto: { type: "string", minLength: 1 },
    especieId: { type: "string", minLength: 1 },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function produtosRoutes(app: FastifyInstance) {
  app.get("/produtos", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.produto.findMany({ skip, take, orderBy: { nomeProduto: "asc" } }),
      request.db.produto.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/produtos/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const produto = await request.db.produto.findFirst({ where: { id } });
    if (!produto) return reply.code(404).send({ message: "Produto não encontrado." });
    return produto;
  });

  app.post("/produtos", { preHandler: WRITE_ROLES, schema: { body: createBodySchema } }, async (request, reply) => {
    const { nomeProduto, especieId } = request.body as { nomeProduto: string; especieId: string };

    const especie = await request.db.especie.findFirst({ where: { id: especieId } });
    if (!especie) {
      return reply.code(400).send({ message: "Espécie informada não existe ou não pertence à sua organização." });
    }

    // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
    // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma.
    const produto = await request.db.produto.create({
      data: { nomeProduto, especieId, organizacaoId: request.user!.organizacaoId },
    });
    return reply.code(201).send(produto);
  });

  app.patch(
    "/produtos/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeProduto?: string; especieId?: string };

      const existing = await request.db.produto.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Produto não encontrado." });

      if (data.especieId !== undefined) {
        const especie = await request.db.especie.findFirst({ where: { id: data.especieId } });
        if (!especie) {
          return reply.code(400).send({ message: "Espécie informada não existe ou não pertence à sua organização." });
        }
      }

      await request.db.produto.updateMany({ where: { id }, data });
      return request.db.produto.findFirst({ where: { id } });
    },
  );

  app.delete("/produtos/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.produto.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Produto não encontrado." });

    try {
      await request.db.produto.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: esse produto está em uso por um ou mais contratos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
