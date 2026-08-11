import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isUniqueConstraintError, isForeignKeyConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";

/** Valores originais do sistema anterior — ver comentário em schema.prisma. */
const SETORES = ["Comercial", "Produção", "Ambiental", "Financeiro", "Logística"] as const;

const createBodySchema = {
  type: "object",
  required: ["nomeStatus", "setorResponsavel", "ordem"],
  additionalProperties: false,
  properties: {
    nomeStatus: { type: "string", minLength: 1 },
    setorResponsavel: { type: "string", enum: SETORES },
    ordem: { type: "integer" },
  },
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeStatus: { type: "string", minLength: 1 },
    setorResponsavel: { type: "string", enum: SETORES },
    ordem: { type: "integer" },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function statusContratoRoutes(app: FastifyInstance) {
  app.get("/status-contrato", async (request) => {
    const { page, pageSize, skip, take } = parsePagination(request.query as { page?: string; pageSize?: string });
    const [data, total] = await Promise.all([
      request.db.statusContrato.findMany({ skip, take, orderBy: { ordem: "asc" } }),
      request.db.statusContrato.count(),
    ]);
    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/status-contrato/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const status = await request.db.statusContrato.findFirst({ where: { id } });
    if (!status) return reply.code(404).send({ message: "Status não encontrado." });
    return status;
  });

  app.post(
    "/status-contrato",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const data = request.body as { nomeStatus: string; setorResponsavel: string; ordem: number };
      try {
        // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
        // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma.
        const status = await request.db.statusContrato.create({
          data: { ...data, organizacaoId: request.user!.organizacaoId },
        });
        return reply.code(201).send(status);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ message: "Já existe um status com esse nome nesta organização." });
        }
        throw err;
      }
    },
  );

  app.patch(
    "/status-contrato/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = request.body as { nomeStatus?: string; setorResponsavel?: string; ordem?: number };

      const existing = await request.db.statusContrato.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Status não encontrado." });

      try {
        await request.db.statusContrato.updateMany({ where: { id }, data });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ message: "Já existe um status com esse nome nesta organização." });
        }
        throw err;
      }

      return request.db.statusContrato.findFirst({ where: { id } });
    },
  );

  app.delete("/status-contrato/:id", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await request.db.statusContrato.findFirst({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Status não encontrado." });

    try {
      await request.db.statusContrato.deleteMany({ where: { id } });
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        return reply
          .code(409)
          .send({ message: "Não é possível excluir: esse status está em uso por um ou mais contratos." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
