import type { FastifyReply } from "fastify";

export const REFRESH_COOKIE_NAME = "refreshToken";
/**
 * Restrito a /auth (não "/") — o refresh token só precisa viajar até as
 * rotas de auth (refresh/logout); nenhuma outra rota da API precisa dele
 * e não há motivo pra expor a cookie a todo o resto do domínio.
 */
const REFRESH_COOKIE_PATH = "/auth";
/** Mesmo prazo do JWT em si (JWT_REFRESH_EXPIRES_IN default "7d") — ver lib/jwt.ts. */
const REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Secure exige HTTPS. Em dev, a API roda em http://localhost puro — Secure
 * bloquearia o navegador de devolver a cookie nesse caso, então só liga em
 * produção (NODE_ENV=production).
 */
function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Registra o refresh token como cookie httpOnly na resposta de login/refresh. */
export function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Apaga a cookie de refresh token (logout) — mesmos atributos, maxAge=0. */
export function clearRefreshCookie(reply: FastifyReply): void {
  reply.setCookie(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}
