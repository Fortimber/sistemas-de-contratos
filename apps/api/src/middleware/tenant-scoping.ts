import type { FastifyRequest, FastifyReply } from "fastify";
import { runtimePrisma } from "../lib/prisma.js";
import { auditLoggerExtension, type ActiveClientBox } from "./audit-logger.js";

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
 *
 * `auditLoggerExtension` (Fase 4) é composto por cima disso em
 * `attachTenantScope`, não aqui — precisa da caixa (`ActiveClientBox`) que só
 * existe depois que a transação abre; ver comentário lá embaixo e em
 * audit-logger.ts.
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
 * desacoplados (preHandler → route handler → onSend), não dá pra usar
 * `prisma.$transaction(async (tx) => { ... })` da forma direta (o corpo da
 * rota não roda aqui) — em vez disso a transação fica "segurada aberta" por
 * uma Promise que só resolve no hook `onSend` (releaseTenantScope,
 * registrado junto com este middleware em plugins/protected-context.ts).
 *
 * `onSend`, não `onResponse`: `onSend` roda ANTES da resposta ser
 * efetivamente enviada ao cliente e pode atrasar o envio — é o que garante
 * que o COMMIT já aconteceu de verdade antes do cliente receber a resposta.
 * `onResponse` rodaria só DEPOIS da resposta já ter saído (achado real
 * durante o smoke test da Fase 4: um teste que lia o banco direto, por uma
 * conexão separada, logo após receber a resposta HTTP de um PATCH, às vezes
 * não via a escrita ainda — a transação por trás do request.db podia
 * commitar DEPOIS do cliente já ter recebido "200 OK"). Isso tem um custo
 * pequeno (a resposta espera o commit), mas é o comportamento correto: uma
 * API não deveria responder sucesso antes do dado estar de fato durável.
 */
export async function attachTenantScope(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    // Defensivo: na prática `authenticate` já teria interrompido a cadeia antes.
    return reply.code(401).send({ message: "Não autenticado." });
  }

  const organizacaoId = request.user.organizacaoId;
  const usuarioId = request.user.id;

  // Preenchida só depois que `tx` existir (dentro do $transaction abaixo) —
  // ver ActiveClientBox em audit-logger.ts pro motivo dessa indireção.
  const activeClientBox: ActiveClientBox = {};
  const client = scopedPrisma(organizacaoId).$extends(auditLoggerExtension(usuarioId, activeClientBox));

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
        activeClientBox.current = tx;
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
 * Libera a transação aberta por `attachTenantScope` e ESPERA ela commitar de
 * verdade antes de deixar a resposta sair. Registrado como hook `onSend`
 * (não `onResponse` — ver comentário grande em `attachTenantScope` sobre a
 * condição de corrida que isso evita).
 */
export async function releaseTenantScope(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  const tx = request.tenantTx;
  if (!tx) {
    // Request nunca chegou a abrir transação (ex.: 401 antes de attachTenantScope terminar).
    return payload;
  }

  tx.release();

  try {
    await tx.settled;
  } catch (err) {
    request.log.error({ err }, "[tenant-scoping] falha ao commitar transação da requisição");
  }

  return payload;
}
