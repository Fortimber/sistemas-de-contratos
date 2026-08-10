import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../lib/jwt.js";

/**
 * Verifica o access token do header Authorization e popula request.user.
 * Registrado uma única vez no contexto protegido (ver plugins/protected-context.ts) —
 * nenhuma rota chama isso manualmente.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ message: "Token de acesso ausente." });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    request.user = {
      id: payload.sub,
      organizacaoId: payload.organizacaoId,
      login: payload.login,
      perfilAcesso: payload.perfilAcesso,
    };
  } catch {
    return reply.code(401).send({ message: "Token de acesso inválido ou expirado." });
  }
}
