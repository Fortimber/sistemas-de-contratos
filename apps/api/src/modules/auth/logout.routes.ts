import type { FastifyInstance } from "fastify";
import { logout, InvalidRefreshTokenError } from "./auth.service.js";

const logoutBodySchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function logoutRoutes(app: FastifyInstance) {
  app.post("/auth/logout", { schema: { body: logoutBodySchema } }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      await logout(refreshToken, request.user!.id);
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ message: "Refresh token inválido ou expirado." });
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
