import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/roles.js";

const itemFields = {
  // Decimal no banco (ver schema.prisma) — mesma decisão de precisão
  // monetária/dimensional já usada em contratos/detalhes-financeiro.
  espessuraMm: { type: "number", exclusiveMinimum: 0 },
  larguraMm: { type: "number", exclusiveMinimum: 0 },
  comprimentoMinMm: { type: "number", exclusiveMinimum: 0 },
  comprimentoMaxMm: { type: "number", exclusiveMinimum: 0 },
  volumeM3: { type: "number", exclusiveMinimum: 0 },
  precoPorM3Usd: { type: "number", exclusiveMinimum: 0 },
} as const;

const createBodySchema = {
  type: "object",
  required: ["espessuraMm", "larguraMm", "comprimentoMinMm", "comprimentoMaxMm", "volumeM3", "precoPorM3Usd"],
  additionalProperties: false,
  properties: itemFields,
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: itemFields,
} as const;

interface ItemFields {
  espessuraMm: number;
  larguraMm: number;
  comprimentoMinMm: number;
  comprimentoMaxMm: number;
  volumeM3: number;
  precoPorM3Usd: number;
}

const WRITE_ROLES = requireRole("Administrador", "Comercial");

/** comprimentoMaxMm < comprimentoMinMm — ver validarComprimento abaixo. */
class ComprimentoInvalidoError extends Error {}

function validarComprimento(minMm: number, maxMm: number): void {
  if (maxMm < minMm) {
    throw new ComprimentoInvalidoError(
      'O campo "comprimentoMaxMm" não pode ser menor que "comprimentoMinMm" (podem ser iguais, para comprimento fixo).',
    );
  }
}

/**
 * Itens de contrato (múltiplas linhas de especificação — espessura/largura/
 * comprimento/volume/preço por m³) dentro de UM contrato. Não é tabela de
 * referência (sem CRUD de listagem próprio, sem organizacaoId direto):
 * confirmamos explicitamente que o contrato existe e pertence à organização
 * do usuário ANTES de qualquer operação (404 claro), com a RLS (policy
 * EXISTS contra contratos) como segunda camada — mesmo padrão dos 4 módulos
 * setoriais (detalhes-*.routes.ts).
 *
 * Permissão de escrita: Administrador+Comercial, igual à escrita do próprio
 * contrato (contratos.routes.ts) — item de contrato é parte da negociação
 * comercial, não de um setor operacional específico.
 *
 * Auditoria: ItemContrato está em AUDITED_MODELS (middleware/audit-logger.ts)
 * — create/update geram linha em auditoria_contratos automaticamente, sem
 * código extra aqui. DELETE não é auditado (a extension não intercepta
 * delete/deleteMany pra nenhum model, nem os 4 setores têm DELETE) — decisão
 * consistente com o resto do sistema, não uma omissão deste módulo.
 *
 * Contrato.volumeM3/valorTotalUsd NÃO mudam de comportamento — continuam
 * digitados manualmente; estes itens são um detalhe complementar, sem soma
 * automática (ver README).
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function itensContratoRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/itens", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    return request.db.itemContrato.findMany({ where: { contratoId }, orderBy: { criadoEm: "asc" } });
  });

  app.post(
    "/contratos/:contratoId/itens",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };
      const body = request.body as ItemFields;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      try {
        validarComprimento(body.comprimentoMinMm, body.comprimentoMaxMm);
      } catch (err) {
        if (err instanceof ComprimentoInvalidoError) return reply.code(400).send({ message: err.message });
        throw err;
      }

      const item = await request.db.itemContrato.create({ data: { ...body, contratoId } });
      return reply.code(201).send(item);
    },
  );

  app.patch(
    "/contratos/:contratoId/itens/:itemId",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { contratoId, itemId } = request.params as { contratoId: string; itemId: string };
      const body = request.body as Partial<ItemFields>;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      const existing = await request.db.itemContrato.findFirst({ where: { id: itemId, contratoId } });
      if (!existing) return reply.code(404).send({ message: "Item não encontrado." });

      // Valores EFETIVOS depois do PATCH (mescla o que veio no body com o
      // que já existia) — mesma ideia de contratos.routes.ts (vínculo
      // Original/Aditivo): editar só comprimentoMaxMm, por exemplo, ainda
      // precisa validar contra o comprimentoMinMm já salvo, não só o que
      // veio nesta chamada.
      const minEfetivo = body.comprimentoMinMm ?? existing.comprimentoMinMm.toNumber();
      const maxEfetivo = body.comprimentoMaxMm ?? existing.comprimentoMaxMm.toNumber();

      try {
        validarComprimento(minEfetivo, maxEfetivo);
      } catch (err) {
        if (err instanceof ComprimentoInvalidoError) return reply.code(400).send({ message: err.message });
        throw err;
      }

      await request.db.itemContrato.updateMany({ where: { id: itemId }, data: body });
      return request.db.itemContrato.findFirst({ where: { id: itemId } });
    },
  );

  app.delete("/contratos/:contratoId/itens/:itemId", { preHandler: WRITE_ROLES }, async (request, reply) => {
    const { contratoId, itemId } = request.params as { contratoId: string; itemId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const existing = await request.db.itemContrato.findFirst({ where: { id: itemId, contratoId } });
    if (!existing) return reply.code(404).send({ message: "Item não encontrado." });

    await request.db.itemContrato.deleteMany({ where: { id: itemId } });
    return reply.code(204).send();
  });
}
