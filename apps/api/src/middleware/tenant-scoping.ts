import type { FastifyRequest, FastifyReply } from "fastify";
import { runtimePrisma } from "../lib/prisma.js";

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
  return runtimePrisma.$extends({
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
 *
 * Segunda camada de isolamento (RLS, ver migration add_row_level_security):
 * as policies do Postgres leem `current_setting('app.current_organizacao_id')`,
 * uma GUC que só existe dentro da transação que a define. Por isso toda a
 * requisição — não só a query que a route handler dispara — precisa rodar
 * dentro de UMA ÚNICA transação Prisma que primeiro roda
 * `SELECT set_config('app.current_organizacao_id', $1, true)` antes de
 * qualquer outra query. Como o Fastify processa a request em hooks
 * desacoplados (preHandler → route handler → onResponse), não dá pra usar
 * `prisma.$transaction(async (tx) => { ... })` da forma direta (o corpo da
 * rota não roda aqui) — em vez disso a transação fica "segurada aberta" por
 * uma Promise que só resolve no hook `onResponse` (releaseTenantScope,
 * registrado junto com este middleware em plugins/protected-context.ts).
 */
export async function attachTenantScope(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    // Defensivo: na prática `authenticate` já teria interrompido a cadeia antes.
    return reply.code(401).send({ message: "Não autenticado." });
  }

  const organizacaoId = request.user.organizacaoId;
  const client = scopedPrisma(organizacaoId);

  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  let provideClient!: (tx: ReturnType<typeof scopedPrisma>) => void;
  let failClient!: (err: unknown) => void;
  const clientReady = new Promise<ReturnType<typeof scopedPrisma>>((resolve, reject) => {
    provideClient = resolve;
    failClient = reject;
  });

  const settled = client
    .$transaction(
      async (tx) => {
        // Terceiro argumento `true` = set_config escopado à transação atual
        // (equivalente a SET LOCAL) — evita vazamento do valor entre
        // requisições diferentes que reusem a mesma conexão do pool.
        await tx.$executeRaw`SELECT set_config('app.current_organizacao_id', ${organizacaoId}, true)`;
        provideClient(tx as unknown as ReturnType<typeof scopedPrisma>);
        // Mantém a transação aberta até a requisição terminar de verdade.
        await released;
      },
      // Default do Prisma é 5s — curto demais aqui porque a transação fica
      // aberta pela duração inteira da requisição (não só de uma query).
      { timeout: 30_000 },
    )
    .catch((err) => {
      failClient(err);
      throw err;
    });

  // Se a transação falhar antes de disponibilizar o client (ex.: erro ao
  // rodar o set_config), a request falha aqui — nunca com request.db "solto"
  // fora de uma transação com o GUC de tenant configurado.
  request.db = await clientReady;
  request.tenantTx = { release, settled };
}

/**
 * Libera a transação aberta por `attachTenantScope`, permitindo que ela
 * commite. Registrado como hook `onResponse` — roda depois da resposta já
 * ter sido enviada, então não atrasa a request, mas garante que a conexão
 * seja devolvida ao pool antes do ciclo da requisição terminar de verdade.
 */
export async function releaseTenantScope(request: FastifyRequest) {
  const tx = request.tenantTx;
  if (!tx) {
    // Request nunca chegou a abrir transação (ex.: 401 antes de attachTenantScope terminar).
    return;
  }

  tx.release();

  try {
    await tx.settled;
  } catch (err) {
    request.log.error({ err }, "[tenant-scoping] falha ao commitar transação da requisição");
  }
}
