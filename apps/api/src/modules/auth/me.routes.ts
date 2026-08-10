import type { FastifyInstance } from "fastify";

/** Registrada dentro do contexto protegido (plugins/protected-context.ts). */
export async function meRoutes(app: FastifyInstance) {
  app.get("/auth/me", async (request, reply) => {
    // findFirst (não findUnique) por design — ver comentário em middleware/tenant-scoping.ts.
    const usuario = await request.db.usuario.findFirst({
      where: { id: request.user!.id },
      select: {
        id: true,
        organizacaoId: true,
        login: true,
        email: true,
        nomeCompleto: true,
        perfilAcesso: true,
        deveTrocarSenha: true,
        criadoEm: true,
      },
    });

    if (!usuario) {
      return reply.code(404).send({ message: "Usuário não encontrado." });
    }

    return usuario;
  });
}
