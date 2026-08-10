import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

/** Models de negócio que carregam organizacaoId diretamente (ver schema.prisma). */
const TENANT_SCOPED_MODELS = new Set([
  "Usuario",
  "Especie",
  "Produto",
  "Importador",
  "Representante",
  "StatusContrato",
  "Contrato",
]);

/**
 * findUnique/findUniqueOrThrow/update/delete/upsert exigem um `where` do tipo
 * WhereUniqueInput — o Prisma valida esse objeto contra os campos únicos do
 * model e rejeita qualquer chave fora dessa lista (incluindo organizacaoId
 * injetado por nós). Ou seja, não dá pra "colar" o filtro de tenant nessas
 * operações silenciosamente. Em vez de deixar passar sem filtro (inseguro),
 * bloqueamos essas operações no client com tenant-scoping: o código de rota
 * é obrigado a usar findFirst/findFirstOrThrow (leitura) ou
 * updateMany/deleteMany com { where: { id, ... } } (escrita), que aceitam
 * filtro livre e são cobertas pelo injetor de organizacaoId abaixo.
 */
const UNSAFE_UNIQUE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
  "upsert",
]);

/**
 * Prisma Client Extension que injeta organizacaoId automaticamente em toda
 * query de um model tenant-scoped — essa é a "segunda linha" central citada
 * na seção 3 do ARCHITECTURE.md: nenhuma rota escreve `where: { organizacaoId }`
 * manualmente, é sempre este client (request.db) que faz isso.
 */
export function scopedPrisma(organizacaoId: string) {
  return prisma.$extends({
    name: "tenant-scoping",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (UNSAFE_UNIQUE_OPERATIONS.has(operation)) {
            throw new Error(
              `[tenant-scoping] "${operation}" não é seguro em "${model}" com escopo de organização ` +
                `(where único não aceita filtro extra). Use findFirst/findFirstOrThrow para leitura, ou ` +
                `updateMany/deleteMany com "{ where: { id, ... } }" para escrita.`,
            );
          }

          const a = args as Record<string, unknown>;

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
              a.where = { ...(a.where as Record<string, unknown> | undefined), organizacaoId };
              break;
            case "create":
              a.data = { ...(a.data as Record<string, unknown> | undefined), organizacaoId };
              break;
            case "createMany":
              if (Array.isArray(a.data)) {
                a.data = a.data.map((item: Record<string, unknown>) => ({ ...item, organizacaoId }));
              }
              break;
            default:
              break;
          }

          return query(a);
        },
      },
    },
  });
}

/**
 * Decora request.db com um client Prisma já filtrado pela organização do
 * usuário autenticado. Roda depois de `authenticate`, uma única vez por
 * request, no contexto protegido — nunca dentro de um handler de rota.
 */
export async function attachTenantScope(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    // Defensivo: na prática `authenticate` já teria interrompido a cadeia antes.
    return reply.code(401).send({ message: "Não autenticado." });
  }

  request.db = scopedPrisma(request.user.organizacaoId);
}
