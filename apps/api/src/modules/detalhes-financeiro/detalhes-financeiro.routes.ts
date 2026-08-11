import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/roles.js";

const putBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nfNumero: { type: "string", minLength: 1 },
    nfData: { type: "string", format: "date" },
    nfVolumeM3: { type: "number" },
    nfValorReais: { type: "number", minimum: 0 },
    invoiceNumero: { type: "string", minLength: 1 },
    invoiceValor: { type: "number", minimum: 0 },
    dataFechamentoCambio: { type: "string", format: "date" },
    banco: { type: "string", minLength: 1 },
    moedaCambial: { type: "string", minLength: 1 },
    // Câmbio zero ou negativo não faz sentido — exclusiveMinimum, não minimum.
    taxaCambial: { type: "number", exclusiveMinimum: 0 },
    valorRecebidoReais: { type: "number", minimum: 0 },
    // TODO / decisão em aberto: sem lista fixa documentada pra esses três
    // campos (mesma situação de statusEmbarqueXCambio/statusGeralCambio/
    // formaPagamento — ver comentário na função da rota). Texto livre por
    // enquanto.
    statusEmbarqueXCambio: { type: "string", minLength: 1 },
    statusGeralCambio: { type: "string", minLength: 1 },
    formaPagamento: { type: "string", minLength: 1 },
    comissaoSobreVenda: { type: "boolean" },
    valorComissaoReais: { type: "number", minimum: 0 },
    valorComissaoDolar: { type: "number", minimum: 0 },
    taxasLocaisReais: { type: "number", minimum: 0 },
    taxaScannerReais: { type: "number", minimum: 0 },
    taxaDetentionsReais: { type: "number", minimum: 0 },
    taxaCertificadoOrigemReais: { type: "number", minimum: 0 },
    taxaCertificadoFitosanitarioReais: { type: "number", minimum: 0 },
    taxaCertificadoFumigacaoReais: { type: "number", minimum: 0 },
    taxaWaybillReais: { type: "number", minimum: 0 },
    taxaCitesReais: { type: "number", minimum: 0 },
    freteReais: { type: "number", minimum: 0 },
    taxaLpcoReais: { type: "number", minimum: 0 },
    despachanteReais: { type: "number", minimum: 0 },
    dhlReais: { type: "number", minimum: 0 },
  },
} as const;

interface FinanceiroBody {
  nfNumero?: string;
  nfData?: string;
  nfVolumeM3?: number;
  nfValorReais?: number;
  invoiceNumero?: string;
  invoiceValor?: number;
  dataFechamentoCambio?: string;
  banco?: string;
  moedaCambial?: string;
  taxaCambial?: number;
  valorRecebidoReais?: number;
  statusEmbarqueXCambio?: string;
  statusGeralCambio?: string;
  formaPagamento?: string;
  comissaoSobreVenda?: boolean;
  valorComissaoReais?: number;
  valorComissaoDolar?: number;
  taxasLocaisReais?: number;
  taxaScannerReais?: number;
  taxaDetentionsReais?: number;
  taxaCertificadoOrigemReais?: number;
  taxaCertificadoFitosanitarioReais?: number;
  taxaCertificadoFumigacaoReais?: number;
  taxaWaybillReais?: number;
  taxaCitesReais?: number;
  freteReais?: number;
  taxaLpcoReais?: number;
  despachanteReais?: number;
  dhlReais?: number;
}

const WRITE_ROLES = requireRole("Administrador", "Financeiro");

/**
 * detalhes_financeiro não tem organizacaoId direto (só contratoId) — mesmo
 * padrão de detalhes_producao/ambiental/logistica: confirmamos
 * explicitamente que o contrato existe e pertence à organização do usuário
 * ANTES do upsert (404 claro), com a RLS (policy EXISTS contra contratos)
 * como segunda camada.
 *
 * Precisão monetária: os campos de valor são Decimal no banco (ver
 * schema.prisma — Float tem erro de arredondamento conhecido, inaceitável
 * pra dinheiro). Em runtime isso chega como `Prisma.Decimal`, não `number`;
 * como nenhuma rota aqui declara `schema.response`, o Fastify serializa a
 * resposta com `JSON.stringify()` puro, que respeita o `toJSON()` do
 * Decimal — os campos monetários chegam no JSON da API como STRING (ex.:
 * `"freteReais":"1500.50"`, já arredondado pra escala da coluna), de
 * propósito, pelo mesmo motivo do Decimal no banco: evitar reintroduzir
 * erro de arredondamento de float bem na resposta da API. Não converter pra
 * Number em nenhum handler abaixo.
 *
 * TODO / decisões em aberto (não são omissão — ainda não há regra de
 * negócio documentada):
 * - statusEmbarqueXCambio, statusGeralCambio, formaPagamento: sem lista
 *   fixa de valores por enquanto (mesma situação das datas de
 *   detalhes-logistica.routes.ts). Texto livre.
 * - Não forçamos relação entre comissaoSobreVenda=true e os campos de
 *   comissão (valorComissaoReais/valorComissaoDolar) estarem preenchidos.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function detalhesFinanceiroRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/financeiro", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const detalhes = await request.db.detalhesFinanceiro.findUnique({ where: { contratoId } });
    if (!detalhes) {
      return reply
        .code(404)
        .send({ message: "Detalhes financeiros ainda não foram preenchidos para esse contrato." });
    }

    return detalhes;
  });

  app.put(
    "/contratos/:contratoId/financeiro",
    { preHandler: WRITE_ROLES, schema: { body: putBodySchema } },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };
      const body = request.body as FinanceiroBody;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      // Campos de data precisam virar Date: o Prisma não aceita "YYYY-MM-DD"
      // puro como string (mesmo caso de contratos.dataContrato).
      const data = {
        ...body,
        ...(body.nfData !== undefined ? { nfData: new Date(body.nfData) } : {}),
        ...(body.dataFechamentoCambio !== undefined
          ? { dataFechamentoCambio: new Date(body.dataFechamentoCambio) }
          : {}),
      };

      const detalhes = await request.db.detalhesFinanceiro.upsert({
        where: { contratoId },
        create: { contratoId, ...data },
        update: data,
      });

      return detalhes;
    },
  );
}
