import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

const createBodySchema = {
  type: "object",
  required: ["nomeRazaoSocial", "pais", "email"],
  additionalProperties: false,
  properties: {
    nomeRazaoSocial: { type: "string", minLength: 1 },
    pais: { type: "string", minLength: 1 },
    email: { type: "string", minLength: 1 },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeRazaoSocial: { type: "string", minLength: 1 },
    pais: { type: "string", minLength: 1 },
    email: { type: "string", minLength: 1 },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function importadoresRoutes(app: FastifyInstance) {
  app.get("/importadores", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.importador.findMany({ skip, take, orderBy: { nomeRazaoSocial: "asc" } }),
      request.db.importador.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/importadores/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const importador = await request.db.importador.findFirst({ where: { id } });
    if (!importador) return reply.code(404).send({ message: "Importador não encontrado." });
    return importador;
  });

  app.post(
    "/importadores",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const data = request.body as { nomeRazaoSocial: string; pais: string; email: string };
      // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
      // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma.
      const importador = await request.db.importador.create({
        data: { ...data, organizacaoId: request.user!.organizacaoId },
      });
      return reply.code(201).send(importador);
    },
  );

  app.patch(
    "/importadores/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeRazaoSocial?: string; pais?: string; email?: string };

      const existing = await request.db.importador.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Importador não encontrado." });

      await request.db.importador.updateMany({ where: { id }, data });
      return request.db.importador.findFirst({ where: { id } });
    },
  );

  app.delete("/importadores/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.importador.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Importador não encontrado." });

    try {
      await request.db.importador.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: esse importador está em uso por um ou mais contratos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
