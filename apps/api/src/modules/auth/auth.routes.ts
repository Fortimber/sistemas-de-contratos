import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  login,
  refresh,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from "./auth.service.js";

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

function requestMeta(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];
  return {
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
    ip: request.ip,
  };
}

/** Rotas públicas de autenticação — sem preHandler de auth. */
export async function authRoutes(app: FastifyInstance) {
  app.post("/login", { schema: { body: loginBodySchema } }, async (request, reply) => {
    const { login: loginInput, senha } = request.body as { login: string; senha: string };

    try {
      return await login(loginInput, senha, requestMeta(request));
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
      return await refresh(refreshToken, requestMeta(request));
    } catch (err) {
      if (err instanceof RefreshTokenReusedError) {
        request.log.warn(
          "Reuso de refresh token revogado detectado — todas as sessões do usuário foram revogadas.",
        );
        return reply.code(401).send({ message: "Sessão inválida. Faça login novamente." });
      }
      if (err instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ message: "Refresh token inválido ou expirado." });
      }
      throw err;
    }
  });
}
