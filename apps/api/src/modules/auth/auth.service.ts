import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { PerfilAcesso, Usuario } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getTokenExpiry } from "../../lib/jwt.js";

export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}
/** jti já revogado sendo reapresentado — indício de roubo de refresh token. */
export class RefreshTokenReusedError extends Error {}

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  usuario: {
    id: string;
    organizacaoId: string;
    login: string;
    email: string;
    nomeCompleto: string;
    perfilAcesso: PerfilAcesso;
    deveTrocarSenha: boolean;
  };
}

export async function login(loginInput: string, senha: string, meta: RequestMeta): Promise<TokenResponse> {
  // Login é único por organização (@@unique([organizacaoId, login])), não globalmente.
  // Como hoje o sistema é single-tenant em produção, buscar pelo primeiro match é
  // seguro; isso precisa virar uma busca com seletor de organização quando o
  // multi-tenant for ativado de fato (ver seção 3 do ARCHITECTURE.md).
  const usuario = await prisma.usuario.findFirst({ where: { login: loginInput } });

  if (!usuario) {
    throw new InvalidCredentialsError();
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaValida) {
    throw new InvalidCredentialsError();
  }

  return issueTokens(usuario, meta);
}

export async function refresh(refreshToken: string, meta: RequestMeta): Promise<TokenResponse> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new InvalidRefreshTokenError();
  }

  const sessao = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });

  if (!sessao || sessao.usuarioId !== payload.sub) {
    throw new InvalidRefreshTokenError();
  }

  if (sessao.revogadoEm) {
    // Sessão já revogada sendo usada de novo: alguém mais tem esse token.
    // Resposta: mata todas as sessões ativas do usuário, não só essa.
    await prisma.refreshToken.updateMany({
      where: { usuarioId: sessao.usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    throw new RefreshTokenReusedError();
  }

  if (sessao.expiraEm.getTime() < Date.now()) {
    throw new InvalidRefreshTokenError();
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!usuario) {
    throw new InvalidRefreshTokenError();
  }

  // Rotação: a sessão usada morre aqui; uma nova é criada em issueTokens.
  await prisma.refreshToken.update({
    where: { id: sessao.id },
    data: { revogadoEm: new Date() },
  });

  return issueTokens(usuario, meta);
}

export async function logout(refreshToken: string, usuarioId: string): Promise<void> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new InvalidRefreshTokenError();
  }

  if (payload.sub !== usuarioId) {
    throw new InvalidRefreshTokenError();
  }

  const sessao = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
  if (!sessao || sessao.revogadoEm) {
    // Idempotente: já revogado ou inexistente, nada a fazer.
    return;
  }

  await prisma.refreshToken.update({
    where: { id: sessao.id },
    data: { revogadoEm: new Date() },
  });
}

/**
 * Troca de senha de um usuário já autenticado. Reusa `InvalidCredentialsError`
 * pro caso de `senhaAtual` não bater — mesma filosofia do `login`: a rota
 * (`senha.routes.ts`) devolve uma mensagem genérica, sem detalhar por que a
 * senha atual foi rejeitada.
 *
 * Sucesso revoga TODAS as sessões ativas do usuário (mesmo mecanismo de
 * `refresh` acima pra reuso de token detectado) — inclusive a sessão atual,
 * de propósito: uma troca de senha é o tipo de evento que deveria invalidar
 * qualquer sessão aberta em outro lugar (dispositivo roubado, sessão vazada
 * etc.), não só proteger a sessão que fez a troca.
 */
export async function alterarSenha(usuarioId: string, senhaAtual: string, novaSenha: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) {
    throw new InvalidCredentialsError();
  }

  const senhaValida = await bcrypt.compare(senhaAtual, usuario.senhaHash);
  if (!senhaValida) {
    throw new InvalidCredentialsError();
  }

  const novoHash = await bcrypt.hash(novaSenha, 10);

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash: novoHash, deveTrocarSenha: false },
    }),
    prisma.refreshToken.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    }),
  ]);
}

async function issueTokens(usuario: Usuario, meta: RequestMeta): Promise<TokenResponse> {
  const accessToken = signAccessToken({
    sub: usuario.id,
    organizacaoId: usuario.organizacaoId,
    login: usuario.login,
    perfilAcesso: usuario.perfilAcesso,
  });

  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: usuario.id, jti });

  await prisma.refreshToken.create({
    data: {
      jti,
      usuarioId: usuario.id,
      expiraEm: getTokenExpiry(refreshToken),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  return {
    accessToken,
    refreshToken,
    usuario: {
      id: usuario.id,
      organizacaoId: usuario.organizacaoId,
      login: usuario.login,
      email: usuario.email,
      nomeCompleto: usuario.nomeCompleto,
      perfilAcesso: usuario.perfilAcesso,
      deveTrocarSenha: usuario.deveTrocarSenha,
    },
  };
}
