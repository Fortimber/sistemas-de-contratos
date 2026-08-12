import type { FastifyInstance } from "fastify";
import { parsePagination, paginationMeta } from "../../lib/pagination.js";
import { isUniqueConstraintError } from "../../lib/prisma-errors.js";
import { requireRole } from "../../middleware/roles.js";
import {
  RELATION_INCLUDE,
  ReferenciaInvalidaError,
  validarReferencias,
  validarVinculoAditivo,
  VinculoAditivoInvalidoError,
} from "./contratos.service.js";

const TIPO_CONTRATO = ["Original", "Aditivo"] as const;
const TIPO_FRETE = ["FOB", "CFR", "CIF"] as const;

const contratoFields = {
  numeroContrato: { type: "string", minLength: 1 },
  importadorId: { type: "string", minLength: 1 },
  representanteId: { type: "string", minLength: 1 },
  produtoId: { type: "string", minLength: 1 },
  statusId: { type: "string", minLength: 1 },
  tipoContrato: { type: "string", enum: TIPO_CONTRATO },
  dataContrato: { type: "string", format: "date" },
  volumeM3: { type: "number" },
  qtdContainers: { type: "integer" },
  local: { type: "string", minLength: 1 },
  tipoFrete: { type: "string", enum: TIPO_FRETE },
  requerFumigacao: { type: "boolean" },
  certificacaoProcessoOrigem: { type: "boolean" },
  requerCites: { type: "boolean" },
  requerFsc: { type: "boolean" },
  requerCertificadoFitossanitario: { type: "boolean" },
  // "Certificate of Kiln Dried Timber"
  requerCertificadoKilnDried: { type: "boolean" },
  // Decimal no banco (ver schema.prisma) — mesma decisão de precisão
  // monetária da Fase 3/Financeiro, aplicada aqui de forma consistente.
  // comissaoPct é percentual — maximum:100 além do minimum:0 (achado real:
  // sem isso um valor como 5000 passava direto pro Postgres e estourava
  // Decimal(5,2) com erro bruto de overflow, ver server.ts/setErrorHandler
  // e lib/prisma-errors.ts pra defesa em profundidade contra esse tipo de
  // erro pra QUALQUER campo, não só este).
  comissaoPct: { type: "number", minimum: 0, maximum: 100 },
  comissaoMetragem: { type: "number", minimum: 0 },
  valorTotalUsd: { type: "number", minimum: 0 },
  moedaValorTotal: { type: "string", minLength: 1 },
  modalidadePgtContaBrasil: { type: "string", minLength: 1 },
  modalidadePgtContaExterior: { type: "string", minLength: 1 },
  // Aceita `null` (não só string/ausente) — necessário pro PATCH poder
  // desvincular explicitamente um Aditivo (contratoPaiId volta a null) ao
  // mudar tipoContrato de volta pra "Original". Sem isso não haveria como
  // "limpar" o campo via PATCH (Ajv não aceita string vazia == minLength 1),
  // e a validação de vínculo (contratos.service.ts) rejeitaria pra sempre
  // essa transição, já que o valor antigo continuaria "preso" no registro.
  contratoPaiId: { type: ["string", "null"], minLength: 1 },
} as const;

const createBodySchema = {
  type: "object",
  required: [
    "numeroContrato",
    "importadorId",
    "representanteId",
    "produtoId",
    "statusId",
    "tipoContrato",
    "dataContrato",
    "volumeM3",
    "qtdContainers",
    "local",
    "tipoFrete",
    "valorTotalUsd",
    "moedaValorTotal",
    "modalidadePgtContaBrasil",
    "modalidadePgtContaExterior",
  ],
  additionalProperties: false,
  properties: contratoFields,
} as const;

const patchBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    ...contratoFields,
    // Não é campo de "contratos" — é anotação pro registro de
    // historico_status_contrato quando o PATCH muda o statusId (ver handler).
    observacao: { type: "string", minLength: 1 },
  },
} as const;

const listQuerySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    page: { type: "string" },
    pageSize: { type: "string" },
    statusId: { type: "string" },
    importadorId: { type: "string" },
  },
} as const;

const WRITE_ROLES = requireRole("Administrador", "Comercial");

interface ContratoFields {
  numeroContrato: string;
  importadorId: string;
  representanteId: string;
  produtoId: string;
  statusId: string;
  tipoContrato: (typeof TIPO_CONTRATO)[number];
  dataContrato: string;
  volumeM3: number;
  qtdContainers: number;
  local: string;
  tipoFrete: (typeof TIPO_FRETE)[number];
  requerFumigacao: boolean;
  certificacaoProcessoOrigem: boolean;
  requerCites: boolean;
  requerFsc: boolean;
  requerCertificadoFitossanitario: boolean;
  requerCertificadoKilnDried: boolean;
  comissaoPct: number;
  comissaoMetragem: number;
  valorTotalUsd: number;
  moedaValorTotal: string;
  modalidadePgtContaBrasil: string;
  modalidadePgtContaExterior: string;
  /** `null` explícito = "sem contrato pai" (limpa, se já tinha); ausente (PATCH) = "não mexe". */
  contratoPaiId?: string | null;
}

/** POST — schema JSON já garante os campos obrigatórios de ContratoFields presentes. */
type ContratoCreateBody = ContratoFields;
/**
 * PATCH — todo campo de contrato é opcional (atualização parcial), mais
 * `observacao`, que não é campo de "contratos" (ver patchBodySchema).
 */
type ContratoPatchBody = Partial<ContratoFields> & { observacao?: string };

/**
 * Serialização de Decimal: comissaoPct/comissaoMetragem/valorTotalUsd são
 * `Prisma.Decimal` (não `number`) em runtime. Não convertemos isso pra
 * Number em nenhum handler abaixo — de propósito. `Prisma.Decimal`
 * implementa `toJSON()` retornando string, e como nenhuma rota aqui declara
 * `schema.response`, o Fastify serializa a resposta com `JSON.stringify()`
 * puro (respeita `toJSON()`), então esses campos chegam no JSON da API como
 * string (ex.: `"valorTotalUsd":"12345.68"`, já arredondado pra escala da
 * coluna). É a mesma decisão usada em detalhes-financeiro.routes.ts — string
 * evita reintroduzir erro de arredondamento de float bem na resposta da API.
 * Cliente HTTP deve tratar esses campos como string, não number.
 */
export async function contratosRoutes(app: FastifyInstance) {
  app.get("/contratos", { schema: { querystring: listQuerySchema } }, async (request) => {
    const query = request.query as { page?: string; pageSize?: string; statusId?: string; importadorId?: string };
    const { page, pageSize, skip, take } = parsePagination(query);

    const where: Record<string, string> = {};
    if (query.statusId) where.statusId = query.statusId;
    if (query.importadorId) where.importadorId = query.importadorId;

    const [data, total] = await Promise.all([
      request.db.contrato.findMany({ where, skip, take, orderBy: { criadoEm: "desc" } }),
      request.db.contrato.count({ where }),
    ]);

    return { data, meta: paginationMeta(page, pageSize, total) };
  });

  app.get("/contratos/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const contrato = await request.db.contrato.findFirst({ where: { id }, include: RELATION_INCLUDE });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });
    return contrato;
  });

  app.post(
    "/contratos",
    { preHandler: WRITE_ROLES, schema: { body: createBodySchema } },
    async (request, reply) => {
      const body = request.body as ContratoCreateBody;

      try {
        await validarReferencias(request.db, body);
        await validarVinculoAditivo(request.db, body.tipoContrato, body.contratoPaiId ?? null);
      } catch (err) {
        if (err instanceof ReferenciaInvalidaError || err instanceof VinculoAditivoInvalidoError) {
          return reply.code(400).send({ message: err.message });
        }
        throw err;
      }

      try {
        // organizacaoId aqui é redundante com o injetado pelo tenant-scoping
        // (ver scopedPrisma) — só satisfaz o tipo estático do Prisma. dataContrato
        // precisa virar Date: o Prisma não aceita "YYYY-MM-DD" puro como string.
        const contrato = await request.db.contrato.create({
          data: {
            ...body,
            dataContrato: new Date(body.dataContrato),
            organizacaoId: request.user!.organizacaoId,
            criadoPorId: request.user!.id,
          },
          include: RELATION_INCLUDE,
        });
        return reply.code(201).send(contrato);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ message: "Já existe um contrato com esse número nesta organização." });
        }
        throw err;
      }
    },
  );

  app.patch(
    "/contratos/:id",
    { preHandler: WRITE_ROLES, schema: { body: patchBodySchema } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // observacao é só do historico_status_contrato, nunca vai pro
      // updateMany de "contratos" — separado do resto do body aqui.
      const { observacao, ...body } = request.body as ContratoPatchBody;

      const existing = await request.db.contrato.findFirst({ where: { id } });
      if (!existing) return reply.code(404).send({ message: "Contrato não encontrado." });

      // Valores EFETIVOS depois do PATCH (mescla o que veio no body com o
      // que já existia) — a regra de vínculo Original/Aditivo precisa
      // validar o estado final, não só o que foi enviado nesta chamada
      // (ex.: mudar só tipoContrato pra "Aditivo", sem reenviar
      // contratoPaiId, tem que continuar exigindo contratoPaiId). Mesma
      // ideia de "não sobrescreve o que não foi enviado" que updateMany já
      // segue pra todo o resto — aqui só explícita porque a validação
      // precisa do valor final, não pode inferir do body parcial sozinho.
      const tipoContratoEfetivo = body.tipoContrato ?? existing.tipoContrato;
      const contratoPaiIdEfetivo = body.contratoPaiId !== undefined ? body.contratoPaiId : existing.contratoPaiId;

      try {
        await validarReferencias(request.db, body);
        await validarVinculoAditivo(request.db, tipoContratoEfetivo, contratoPaiIdEfetivo, id);
      } catch (err) {
        if (err instanceof ReferenciaInvalidaError || err instanceof VinculoAditivoInvalidoError) {
          return reply.code(400).send({ message: err.message });
        }
        throw err;
      }

      try {
        await request.db.contrato.updateMany({
          where: { id },
          data: {
            ...body,
            ...(body.dataContrato !== undefined ? { dataContrato: new Date(body.dataContrato) } : {}),
            atualizadoPorId: request.user!.id,
          },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ message: "Já existe um contrato com esse número nesta organização." });
        }
        throw err;
      }

      // Trilha de mudança de status (separada da auditoria genérica por
      // campo, que já cobre "statusId" como qualquer outro campo — ver
      // middleware/audit-logger.ts). Aqui é o histórico de negócio, com
      // observação opcional do usuário.
      if (body.statusId !== undefined && body.statusId !== existing.statusId) {
        await request.db.historicoStatusContrato.create({
          data: {
            contratoId: id,
            statusAnteriorId: existing.statusId,
            statusNovoId: body.statusId,
            alteradoPorId: request.user!.id,
            observacao: observacao ?? null,
          },
        });
      }

      return request.db.contrato.findFirst({ where: { id }, include: RELATION_INCLUDE });
    },
  );
}
