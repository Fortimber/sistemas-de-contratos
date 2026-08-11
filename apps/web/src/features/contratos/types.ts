import type { Importador, Produto, Representante, StatusContrato } from "@/features/referencias/types";

export type TipoContrato = "Original" | "Aditivo";
export type TipoFrete = "FOB" | "CFR" | "CIF";

/**
 * Campos próprios de "contratos", no formato como a API devolve — campos
 * monetários (Decimal no Postgres: comissaoPct, comissaoMetragem,
 * valorTotalUsd) vêm como STRING, não number (Prisma.Decimal.toJSON()),
 * mesma decisão usada em toda a API pra não reintroduzir erro de
 * arredondamento de float na resposta (ver contratos.routes.ts). Ao
 * ENVIAR (POST/PATCH) esses campos precisam ser number — ver
 * contrato-form.tsx.
 */
interface ContratoBase {
  id: string;
  numeroContrato: string;
  importadorId: string;
  representanteId: string;
  produtoId: string;
  statusId: string;
  tipoContrato: TipoContrato;
  dataContrato: string;
  volumeM3: number;
  qtdContainers: number;
  local: string;
  tipoFrete: TipoFrete;
  requerFumigacao: boolean;
  certificacaoProcessoOrigem: boolean;
  requerCites: boolean;
  requerFsc: boolean;
  comissaoPct: string | null;
  comissaoMetragem: string | null;
  valorTotalUsd: string;
  moedaValorTotal: string;
  modalidadePgtContaBrasil: string;
  modalidadePgtContaExterior: string;
  contratoPaiId: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** GET /contratos (lista) não inclui relações — só os campos próprios + ids de FK. */
export type ContratoListItem = ContratoBase;

/** GET /contratos/:id, e as respostas de POST/PATCH — todas usam RELATION_INCLUDE. */
export interface Contrato extends ContratoBase {
  importador: Importador;
  representante: Representante;
  produto: Produto;
  status: StatusContrato;
}
