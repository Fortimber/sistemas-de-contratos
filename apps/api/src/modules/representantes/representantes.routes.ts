import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

const createBodySchema = {
  type: "object",
  required: ["nomeRepresentante", "email"],
  additionalProperties: false,
  properties: {
    nomeRepresentante: { type: "string", minLength: 1 },
    email: { type: "string", minLength: 1 },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeRepresentante: { type: "string", minLength: 1 },
    email: { type: "string", minLength: 1 },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function representantesRoutes(app: FastifyInstance) {
  app.get("/representantes", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.representante.findMany({ skip, take, orderBy: { nomeRepresentante: "asc" } }),
      request.db.representante.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/representantes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const representante = await request.db.representante.findFirst({ where: { id } });
    if (!representante) return reply.code(404).send({ message: "Representante não encontrado." });
    return representante;
  });

  app.post(
    "/representantes",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const data = request.body as { nomeRepresentante: string; email: string };
      // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
      // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma.
      const representante = await request.db.representante.create({
        data: { ...data, organizacaoId: request.user!.organizacaoId },
      });
      return reply.code(201).send(representante);
    },
  );

  app.patch(
    "/representantes/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeRepresentante?: string; email?: string };

      const existing = await request.db.representante.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Representante não encontrado." });

      await request.db.representante.updateMany({ where: { id }, data });
      return request.db.representante.findFirst({ where: { id } });
    },
  );

  app.delete("/representantes/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.representante.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Representante não encontrado." });

    try {
      await request.db.representante.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: esse representante está em uso por um ou mais contratos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
