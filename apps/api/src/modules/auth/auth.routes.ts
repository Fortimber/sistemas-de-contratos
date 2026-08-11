import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  login,
  refresh,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from "./auth.service.js";
import { setRefreshCookie, REFRESH_COOKIE_NAME } from "../../lib/refresh-cookie.js";

const loginBodySchema = {
  type: "object",
  required: ["login", "senha"],
  additionalProperties: false,
  properties: {
    login: { type: "string", minLength: 1 },
    senha: { type: "string", minLength: 1 },
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
      // refreshToken nunca vai pro corpo da resposta — só como cookie
      // httpOnly (ver lib/refresh-cookie.ts). O corpo em si já não pode
      // conter o campo (removido via destructuring), então um bug futuro
      // aqui não reintroduziria o vazamento silenciosamente.
      const { refreshToken, ...body } = await login(loginInput, senha, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return body;
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ message: "Login ou senha inválidos." });
      }
      throw err;
    }
  });

  // Sem body schema: o refresh token agora vem só da cookie httpOnly
  // (path=/auth, ver lib/refresh-cookie.ts) — nunca mais do corpo da
  // requisição, que um script no navegador poderia ler.
  app.post("/refresh", async (request, reply) => {
    const refreshTokenCookie = request.cookies[REFRESH_COOKIE_NAME];
    if (!refreshTokenCookie) {
      return reply.code(401).send({ message: "Refresh token ausente." });
    }

    try {
      const { refreshToken, ...body } = await refresh(refreshTokenCookie, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return body;
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
