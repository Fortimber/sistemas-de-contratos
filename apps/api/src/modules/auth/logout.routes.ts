import type { FastifyInstance } from "fastify";
import { logout, InvalidRefreshTokenError } from "./auth.service.js";
import { clearRefreshCookie, REFRESH_COOKIE_NAME } from "../../lib/refresh-cookie.js";

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function logoutRoutes(app: FastifyInstance) {
  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return reply.code(401).send({ message: "Refresh token ausente." });
    }

    try {
      await logout(refreshToken, request.user!.id);
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ message: "Refresh token inválido ou expirado." });
      }
      throw err;
    }

    clearRefreshCookie(reply);
    return reply.code(204).send();
  });
}
