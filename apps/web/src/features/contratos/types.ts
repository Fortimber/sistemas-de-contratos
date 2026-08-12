import type { Importador, Produto, Representante, StatusContrato } from "@/features/referencias/types";

export type TipoContrato = "Original" | "Aditivo";
export type TipoFrete = "FOB" | "CFR" | "CIF";

/**
 * Rótulo de exibição pro tipo de contrato — só a tela usa "Único", o valor
 * salvo no banco continua "Original" (nome de domínio já validado no
 * sistema anterior). Compartilhado entre contrato-form.tsx e
 * contrato-detail-page.tsx pra não divergir se o rótulo mudar.
 */
export const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  Original: "Único",
  Aditivo: "Aditivo",
};

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
  requerCertificadoFitossanitario: boolean;
  /** "Certificate of Kiln Dried Timber" */
  requerCertificadoKilnDried: boolean;
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

/** Versão reduzida de um contrato — usada só pro vínculo Original/Aditivo (ver Contrato abaixo). */
export interface ContratoResumo {
  id: string;
  numeroContrato: string;
}

/**
 * GET /contratos/:id, e as respostas de POST/PATCH — todas usam
 * RELATION_INCLUDE. `contratoPai`/`aditivos` vêm sempre presentes (não só
 * quando aplicável): um Original resolve `contratoPai: null` e
 * `aditivos: [...]` (pode ser vazio); um Aditivo resolve `contratoPai:
 * {...}` e `aditivos: []` sempre (regra de negócio — aditivo nunca é pai
 * de outro, ver contratos.service.ts na API).
 */
export interface Contrato extends ContratoBase {
  importador: Importador;
  representante: Representante;
  produto: Produto;
  status: StatusContrato;
  contratoPai: ContratoResumo | null;
  aditivos: ContratoResumo[];
}
