import { Prisma, AcaoAuditoria } from "@prisma/client";

/**
 * Models auditados — mesmo escopo pedido na Fase 4 (contratos + os 4
 * módulos setoriais 1:1), mais ItemContrato (itens de contrato — 1:N, não
 * 1:1, mas mesmo tratamento: contratoIdFor já resolve pelo `contratoId` da
 * linha, igual aos 4 setores). Tabelas de referência (especies, produtos,
 * ..., eventos-pagamento) ficam de fora de propósito.
 */
const AUDITED_MODELS = new Set([
  "Contrato",
  "DetalhesProducao",
  "DetalhesAmbiental",
  "DetalhesLogistica",
  "DetalhesFinanceiro",
  "ItemContrato",
]);

/** Nome da propriedade do client Prisma pra cada model auditado. */
const MODEL_DELEGATE: Record<string, string> = {
  Contrato: "contrato",
  DetalhesProducao: "detalhesProducao",
  DetalhesAmbiental: "detalhesAmbiental",
  DetalhesLogistica: "detalhesLogistica",
  DetalhesFinanceiro: "detalhesFinanceiro",
  ItemContrato: "itemContrato",
};

/** Campos técnicos que nunca contam como "campo alterado" pra fins de auditoria. */
const IGNORED_FIELDS = new Set(["id", "contratoId", "organizacaoId", "criadoEm", "atualizadoEm"]);

/** Contrato audita a si mesmo pelo próprio id; os módulos setoriais, pelo contratoId (FK). */
function contratoIdFor(model: string, row: Record<string, unknown>): string {
  return model === "Contrato" ? (row.id as string) : (row.contratoId as string);
}

/**
 * Serializa um valor de campo pra string, de forma estável, pra gravar em
 * valorAnterior/valorNovo (colunas TEXT). Mesma regra de serialização de
 * Decimal já usada nas respostas da API (Fase 3/Financeiro): não interpretar
 * como number, converter direto pra string — evita reintroduzir erro de
 * arredondamento de float na própria trilha de auditoria.
 */
function serializeAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return String(value);
}

type AnyRecord = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * "Caixa" com uma referência mutável pro client Prisma realmente vinculado
 * à transação por-requisição — ver o comentário grande abaixo sobre por que
 * isso existe. `tenant-scoping.ts` cria a caixa e só preenche `current`
 * depois que a transação (`tx`) já existe.
 */
export interface ActiveClientBox {
  current?: AnyClient;
}

/**
 * Prisma Client Extension que grava auditoria_contratos automaticamente em
 * toda escrita nos models de AUDITED_MODELS — mesmo padrão arquitetural do
 * tenant-scoping (middleware central via extension, não replicado rota a
 * rota).
 *
 * IMPORTANTE (e não óbvio) — por que existe `ActiveClientBox`: pra comparar
 * "antes/depois" e gravar a linha de auditoria, o hook precisa rodar OUTRAS
 * queries (numa tabela diferente, ou um `findFirst` antes do `update`) de
 * dentro do próprio hook. Duas abordagens óbvias NÃO funcionam aqui:
 *
 * 1. `Prisma.defineExtension((client) => client.$extends({...}))`, capturando
 *    `client` no closure — testado na prática e falha: esse `client` fica
 *    preso à conexão de FORA da transação. Como a transação por-requisição
 *    (ver `attachTenantScope`) é o que roda
 *    `SELECT set_config('app.current_organizacao_id', ...)`, qualquer query
 *    nessa conexão "de fora" quebra com "unrecognized configuration
 *    parameter" — nunca passou por esse set_config.
 * 2. `Prisma.getExtensionContext(this)` dentro do hook — também testado, mas
 *    essa API é pra extensões de MODEL (computed fields/métodos de
 *    instância), não devolve um client com todos os model delegates
 *    (`ctx.auditoriaContrato` vem `undefined`).
 *
 * A solução: `attachTenantScope` cria uma caixa (`{ current: undefined }`)
 * ANTES de abrir a transação, monta este extension recebendo essa caixa, e
 * só DEPOIS que `tx` existe (dentro do callback de `$transaction`) preenche
 * `box.current = tx`. Como o hook só roda quando uma query é de fato
 * disparada (sempre depois de `tx` existir, já que é o próprio `tx`/
 * `request.db` quem dispara), `box.current` está sempre correto quando o
 * hook precisa dele — e por ser o `tx` de verdade (não uma cópia/proxy),
 * toda leitura/escrita extra do hook fica na MESMA transação da requisição.
 *
 * Isso não causa recursão infinita: `tx.auditoriaContrato.create(...)` passa
 * de novo por este hook, mas o model "AuditoriaContrato" não está em
 * AUDITED_MODELS, então cai direto em `return query(args)`.
 */
export function auditLoggerExtension(usuarioId: string, activeClientBox: ActiveClientBox) {
  return {
    name: "audit-logger",
    query: {
      $allModels: {
        // `any`: definido fora do `.$extends({...})` inline (pra poder ser
        // composto em tenant-scoping.ts), então perde a tipagem contextual
        // que o Prisma injeta quando o hook é escrito direto dentro do
        // `.$extends()` — não há um tipo exportado equivalente e estável
        // pra anotar aqui manualmente (`Prisma.QueryOptionsCbArgs` não existe).
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !AUDITED_MODELS.has(model)) {
            return query(args);
          }

          const ctx: AnyClient = activeClientBox.current;
          if (!ctx) {
            // Defensivo: não deveria acontecer — a caixa é preenchida antes
            // de request.db ficar disponível pra qualquer rota.
            throw new Error("[audit-logger] client ativo não disponível ainda para auditoria.");
          }

          const delegate = ctx[MODEL_DELEGATE[model]];

          async function logCreate(row: AnyRecord) {
            await ctx.auditoriaContrato.create({
              data: {
                contratoId: contratoIdFor(model!, row),
                usuarioId,
                acao: AcaoAuditoria.Criacao,
              },
            });
          }

          async function logFieldChanges(before: AnyRecord, after: AnyRecord) {
            const contratoId = contratoIdFor(model!, after);
            for (const key of Object.keys(after)) {
              if (IGNORED_FIELDS.has(key)) continue;
              const oldVal = serializeAuditValue(before[key]);
              const newVal = serializeAuditValue(after[key]);
              if (oldVal === newVal) continue;
              await ctx.auditoriaContrato.create({
                data: {
                  contratoId,
                  usuarioId,
                  acao: AcaoAuditoria.Edicao,
                  campoAlterado: key,
                  valorAnterior: oldVal,
                  valorNovo: newVal,
                },
              });
            }
          }

          if (operation === "create") {
            const result = await query(args);
            await logCreate(result as AnyRecord);
            return result;
          }

          if (operation === "upsert") {
            const where = (args as { where: AnyRecord }).where;
            const before = (await delegate.findFirst({ where })) as AnyRecord | null;
            const result = await query(args);
            if (!before) {
              await logCreate(result as AnyRecord);
            } else {
              await logFieldChanges(before, result as AnyRecord);
            }
            return result;
          }

          if (operation === "updateMany" || operation === "update") {
            const where = (args as { where: AnyRecord }).where;
            const before = (await delegate.findFirst({ where })) as AnyRecord | null;
            const result = await query(args);
            if (before) {
              const after = (await delegate.findFirst({ where })) as AnyRecord | null;
              if (after) await logFieldChanges(before, after);
            }
            return result;
          }

          return query(args);
        },
      },
    },
  };
}
