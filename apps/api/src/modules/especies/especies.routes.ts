import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isUniqueConstraintError, isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

const createBodySchema = {
  type: "object",
  required: ["nomeEspecie"],
  additionalProperties: false,
  properties: {
    nomeEspecie: { type: "string", minLength: 1 },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeEspecie: { type: "string", minLength: 1 },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function especiesRoutes(app: FastifyInstance) {
  app.get("/especies", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.especie.findMany({ skip, take, orderBy: { nomeEspecie: "asc" } }),
      request.db.especie.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/especies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const especie = await request.db.especie.findFirst({ where: { id } });
    if (!especie) return reply.code(404).send({ message: "Espécie não encontrada." });
    return especie;
  });

  app.post("/especies", { preHandler: WRITE_ROLES, schema: { body: createBodySchema } }, async (request, reply) => {
    const { nomeEspecie } = request.body as { nomeEspecie: string };

    try {
      // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
      // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma, que não
      // enxerga a injeção feita em runtime pela extensão.
      const especie = await request.db.especie.create({
        data: { nomeEspecie, organizacaoId: request.user!.organizacaoId },
      });
      return reply.code(201).send(especie);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return reply.code(409).send({ message: "Já existe uma espécie com esse nome nesta organização." });
      }
      throw err;
    }
  });

  app.patch(
    "/especies/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeEspecie?: string };

      const existing = await request.db.especie.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Espécie não encontrada." });

      try {
        await request.db.especie.updateMany({ where: { id }, data });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ message: "Já existe uma espécie com esse nome nesta organização." });
        }
        throw err;
      }

      return request.db.especie.findFirst({ where: { id } });
    },
  );

  app.delete("/especies/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.especie.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Espécie não encontrada." });

    try {
      await request.db.especie.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: essa espécie está em uso por um ou mais produtos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
