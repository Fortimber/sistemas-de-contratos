import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/roles.js";

/** Valores originais do sistema anterior — ver comentário em schema.prisma. */
const PAGAMENTO_BL = ["Sim", "Não"] as const;

const putBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ciaMaritima: { type: "string", minLength: 1 },
    nomeNavio: { type: "string", minLength: 1 },
    booking: { type: "string", minLength: 1 },
    containerNumero: { type: "string", minLength: 1 },
    dataPrancha: { type: "string", format: "date" },
    dataDraftDocumentos: { type: "string", format: "date" },
    dataDraftCarga: { type: "string", format: "date" },
    dataColetaContainer: { type: "string", format: "date" },
    dataPosEmbarqueDocsCliente: { type: "string", format: "date" },
    dataEntradaPortoDestino: { type: "string", format: "date" },
    dataPrevistaSaidaNavio: { type: "string", format: "date" },
    dataNavioNoDestino: { type: "string", format: "date" },
    blNumero: { type: "string", minLength: 1 },
    blData: { type: "string", format: "date" },
    portoDestinoPais: { type: "string", minLength: 1 },
    motorista: { type: "string", minLength: 1 },
    placaVeiculo: { type: "string", minLength: 1 },
    pagamentoBl: { type: "string", enum: PAGAMENTO_BL },
  },
} as const;

interface LogisticaBody {
  ciaMaritima?: string;
  nomeNavio?: string;
  booking?: string;
  containerNumero?: string;
  dataPrancha?: string;
  dataDraftDocumentos?: string;
  dataDraftCarga?: string;
  dataColetaContainer?: string;
  dataPosEmbarqueDocsCliente?: string;
  dataEntradaPortoDestino?: string;
  dataPrevistaSaidaNavio?: string;
  dataNavioNoDestino?: string;
  blNumero?: string;
  blData?: string;
  portoDestinoPais?: string;
  motorista?: string;
  placaVeiculo?: string;
  pagamentoBl?: (typeof PAGAMENTO_BL)[number];
}

const WRITE_ROLES = requireRole("Administrador", "Operacional");

/**
 * detalhes_logistica não tem organizacaoId direto (só contratoId) — mesmo
 * padrão de detalhes_producao/detalhes_ambiental: confirmamos
 * explicitamente que o contrato existe e pertence à organização do usuário
 * ANTES do upsert (404 claro), com a RLS (policy EXISTS contra contratos)
 * como segunda camada.
 *
 * TODO / decisão em aberto: ao contrário de detalhes_ambiental (que valida
 * lpcoDataValidade >= lpcoDataProtocolo e citesDataValidade >=
 * citesDataEntrada), aqui NÃO validamos ordem entre os 9 campos de data
 * (ex.: dataPrancha antes de dataColetaContainer antes de
 * dataEntradaPortoDestino...). Não é omissão — é que ainda não existe regra
 * de negócio documentada sobre qual data precisa vir antes de qual nesse
 * fluxo logístico. Se/quando essa regra for definida, validar aqui como já
 * é feito em detalhes-ambiental.routes.ts.
 *
 * Registrada dentro do contexto protegido (plugins/protected-context.ts).
 */
export async function detalhesLogisticaRoutes(app: FastifyInstance) {
  app.get("/contratos/:contratoId/logistica", async (request, reply) => {
    const { contratoId } = request.params as { contratoId: string };

    const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
    if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

    const detalhes = await request.db.detalhesLogistica.findUnique({ where: { contratoId } });
    if (!detalhes) {
      return reply
        .code(404)
        .send({ message: "Detalhes de logística ainda não foram preenchidos para esse contrato." });
    }

    return detalhes;
  });

  app.put(
    "/contratos/:contratoId/logistica",
    { preHandler: WRITE_ROLES, schema: { body: putBodySchema } },
    async (request, reply) => {
      const { contratoId } = request.params as { contratoId: string };
      const body = request.body as LogisticaBody;

      const contrato = await request.db.contrato.findFirst({ where: { id: contratoId } });
      if (!contrato) return reply.code(404).send({ message: "Contrato não encontrado." });

      // Campos de data precisam virar Date: o Prisma não aceita "YYYY-MM-DD"
      // puro como string (mesmo caso de contratos.dataContrato).
      const data = {
        ...body,
        ...(body.dataPrancha !== undefined ? { dataPrancha: new Date(body.dataPrancha) } : {}),
        ...(body.dataDraftDocumentos !== undefined
          ? { dataDraftDocumentos: new Date(body.dataDraftDocumentos) }
          : {}),
        ...(body.dataDraftCarga !== undefined ? { dataDraftCarga: new Date(body.dataDraftCarga) } : {}),
        ...(body.dataColetaContainer !== undefined
          ? { dataColetaContainer: new Date(body.dataColetaContainer) }
          : {}),
        ...(body.dataPosEmbarqueDocsCliente !== undefined
          ? { dataPosEmbarqueDocsCliente: new Date(body.dataPosEmbarqueDocsCliente) }
          : {}),
        ...(body.dataEntradaPortoDestino !== undefined
          ? { dataEntradaPortoDestino: new Date(body.dataEntradaPortoDestino) }
          : {}),
        ...(body.dataPrevistaSaidaNavio !== undefined
          ? { dataPrevistaSaidaNavio: new Date(body.dataPrevistaSaidaNavio) }
          : {}),
        ...(body.dataNavioNoDestino !== undefined ? { dataNavioNoDestino: new Date(body.dataNavioNoDestino) } : {}),
        ...(body.blData !== undefined ? { blData: new Date(body.blData) } : {}),
      };

      const detalhes = await request.db.detalhesLogistica.upsert({
        where: { contratoId },
        create: { contratoId, ...data },
        update: data,
      });

      return detalhes;
    },
  );
}
