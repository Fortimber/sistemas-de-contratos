import type { FastifyInstance } from "fastify";
import { alterarSenha, InvalidCredentialsError } from "./auth.service.js";
import { clearRefreshCookie } from "../../lib/refresh-cookie.js";

const NOVA_SENHA_MIN_LENGTH = 8;

const changePasswordBodySchema = {
  type: "object",
  required: ["senhaAtual", "novaSenha"],
  additionalProperties: false,
  properties: {
    senhaAtual: { type: "string", minLength: 1 },
    novaSenha: { type: "string", minLength: 1 },
  },
} as const;

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function senhaRoutes(app: FastifyInstance) {
  app.patch("/auth/senha", { schema: { body: changePasswordBodySchema } }, async (request, reply) => {
    const { senhaAtual, novaSenha } = request.body as { senhaAtual: string; novaSenha: string };

    if (novaSenha.length < NOVA_SENHA_MIN_LENGTH) {
      return reply
        .code(400)
        .send({ message: `A nova senha precisa ter no mínimo ${NOVA_SENHA_MIN_LENGTH} caracteres.` });
    }
    if (novaSenha === senhaAtual) {
      return reply.code(400).send({ message: "A nova senha precisa ser diferente da senha atual." });
    }

    try {
      await alterarSenha(request.user!.id, senhaAtual, novaSenha);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        // Mensagem genérica de propósito — mesma filosofia do login
        // (auth.service.ts): não confirma nem nega detalhe sobre a conta,
        // só que a senha atual informada não confere.
        return reply.code(401).send({ message: "Senha atual inválida." });
      }
      throw err;
    }

    // alterarSenha já revogou todas as sessões (inclusive a atual) — a
    // cookie de refresh token desta sessão não serve mais pra nada.
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });
}
