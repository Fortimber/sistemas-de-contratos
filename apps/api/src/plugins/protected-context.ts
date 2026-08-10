import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { attachTenantScope } from "../middleware/tenant-scoping.js";
import { meRoutes } from "../modules/auth/me.routes.js";
import { logoutRoutes } from "../modules/auth/logout.routes.js";

/**
 * Contexto protegido: autenticação + tenant-scoping registrados uma única
 * vez aqui via addHook, não repetidos rota a rota. Toda rota que precisa de
 * usuário logado e de request.db (Prisma já filtrado por organizacaoId) é
 * registrada dentro deste plugin — Fase 2+ vai anexar os módulos de negócio
 * (contratos, especies, etc.) aqui também.
 */
export async function protectedContext(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", attachTenantScope);

  await app.register(meRoutes);
  await app.register(logoutRoutes);
}
