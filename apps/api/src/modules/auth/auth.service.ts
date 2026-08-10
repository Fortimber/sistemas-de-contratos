import bcrypt from "bcrypt";
import type { PerfilAcesso, Usuario } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";

export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}

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

export async function login(loginInput: string, senha: string): Promise<TokenResponse> {
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

  return buildTokenResponse(usuario);
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new InvalidRefreshTokenError();
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!usuario) {
    throw new InvalidRefreshTokenError();
  }

  return buildTokenResponse(usuario);
}

function buildTokenResponse(usuario: Usuario): TokenResponse {
  const accessToken = signAccessToken({
    sub: usuario.id,
    organizacaoId: usuario.organizacaoId,
    login: usuario.login,
    perfilAcesso: usuario.perfilAcesso,
  });

  const refreshToken = signRefreshToken({ sub: usuario.id });

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
