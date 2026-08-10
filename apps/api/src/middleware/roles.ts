import type { FastifyRequest, FastifyReply } from "fastify";
import type { PerfilAcesso } from "@prisma/client";

/**
 * Autorização por perfil de acesso. Usar como preHandler adicional numa rota
 * específica (o preHandler de autenticação/tenant-scoping já roda antes, no
 * contexto protegido):
 *
 *   app.delete("/contratos/:id", { preHandler: requireRole("Administrador") }, handler)
 */
export function requireRole(...perfis: PerfilAcesso[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user || !perfis.includes(request.user.perfilAcesso)) {
      return reply.code(403).send({ message: "Sem permissão para este recurso." });
    }
  };
}
