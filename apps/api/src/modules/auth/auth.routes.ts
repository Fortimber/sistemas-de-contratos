import type { FastifyInstance } from "fastify";
import { login, refresh, InvalidCredentialsError, InvalidRefreshTokenError } from "./auth.service.js";

const loginBodySchema = {
  type: "object",
  required: ["login", "senha"],
  additionalProperties: false,
  properties: {
    login: { type: "string", minLength: 1 },
    senha: { type: "string", minLength: 1 },
  },
} as const;

const refreshBodySchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

/** Rotas públicas de autenticação — sem preHandler de auth. */
export async function authRoutes(app: FastifyInstance) {
  app.post("/login", { schema: { body: loginBodySchema } }, async (request, reply) => {
    const { login: loginInput, senha } = request.body as { login: string; senha: string };

    try {
      return await login(loginInput, senha);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ message: "Login ou senha inválidos." });
      }
      throw err;
    }
  });

  app.post("/refresh", { schema: { body: refreshBodySchema } }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      return await refresh(refreshToken);
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ message: "Refresh token inválido ou expirado." });
      }
      throw err;
    }
  });
}
