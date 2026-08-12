/**
 * Tipos dos 4 módulos setoriais (`detalhes_producao/ambiental/logistica/
 * financeiro`), no formato como a API devolve em GET/PUT
 * /contratos/:id/<setor>. Todo campo próprio do setor é opcional (nulo até
 * ser preenchido — ver schema.prisma, `Fase 3` no README) — só `id`,
 * `contratoId`, `criadoEm`, `atualizadoEm` são sempre presentes, e só
 * existem depois do primeiro PUT (GET responde 404 antes disso, ver
 * hooks.ts).
 *
 * Campos monetários (Decimal no Postgres) chegam como STRING, mesma
 * decisão de `Contrato.valorTotalUsd` (ver types.ts do contrato) —
 * `Prisma.Decimal.toJSON()` na resposta, pra não reintroduzir erro de
 * arredondamento de float. Nunca converter pra number fora da hora de
 * montar o payload de envio (ver setor-form.ts).
 */
interface DetalhesBase {
  id: string;
  contratoId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type LpcoStatus = "Em análise" | "Protocolada" | "Deferida" | "Indeferida";
export type CitesStatus = "Não se aplica" | "Em análise" | "Deferida" | "Indeferida";
export type StatusAprovacaoCocCliente = "Pendente" | "Aprovado" | "Reprovado";
export type PagamentoBl = "Sim" | "Não";
export type PrazoPagamentoDirecao = "Antes" | "Depois";

export interface DetalhesProducao extends DetalhesBase {
  numeroRomaneio: string | null;
  volumeRomaneioM3: number | null;
  qtdContainersConfirmada: number | null;
  observacoesProducao: string | null;
  dataCocEnviadaDespachante: string | null;
}

export interface DetalhesAmbiental extends DetalhesBase {
  autef: string | null;
  lpcoNumero: string | null;
  lpcoStatus: LpcoStatus | null;
  lpcoDataProtocolo: string | null;
  lpcoDataValidade: string | null;
  citesNumeroRequerimento: string | null;
  citesNumero: string | null;
  citesDataEntrada: string | null;
  citesDataValidade: string | null;
  citesStatus: CitesStatus | null;
  gfNumero: string | null;
  gfDataVencimento: string | null;
  gfDataRecebimentoSisflora: string | null;
  dofDataRegistro: string | null;
  statusAprovacaoCocCliente: StatusAprovacaoCocCliente | null;
}

export interface DetalhesLogistica extends DetalhesBase {
  ciaMaritima: string | null;
  nomeNavio: string | null;
  booking: string | null;
  containerNumero: string | null;
  dataPrancha: string | null;
  dataDraftDocumentos: string | null;
  dataDraftCarga: string | null;
  dataColetaContainer: string | null;
  dataPosEmbarqueDocsCliente: string | null;
  dataEntradaPortoDestino: string | null;
  dataPrevistaSaidaNavio: string | null;
  dataNavioNoDestino: string | null;
  blNumero: string | null;
  blData: string | null;
  portoDestinoPais: string | null;
  motorista: string | null;
  placaVeiculo: string | null;
  pagamentoBl: PagamentoBl | null;
}

export interface DetalhesFinanceiro extends DetalhesBase {
  nfNumero: string | null;
  nfData: string | null;
  nfVolumeM3: number | null;
  nfValorReais: string | null;
  invoiceNumero: string | null;
  invoiceValor: string | null;
  dataFechamentoCambio: string | null;
  banco: string | null;
  moedaCambial: string | null;
  taxaCambial: string | null;
  valorRecebidoReais: string | null;
  statusEmbarqueXCambio: string | null;
  statusGeralCambio: string | null;
  formaPagamento: string | null;
  comissaoSobreVenda: boolean | null;
  valorComissaoReais: string | null;
  valorComissaoDolar: string | null;
  taxasLocaisReais: string | null;
  taxaScannerReais: string | null;
  taxaDetentionsReais: string | null;
  taxaCertificadoOrigemReais: string | null;
  taxaCertificadoFitosanitarioReais: string | null;
  taxaCertificadoFumigacaoReais: string | null;
  taxaWaybillReais: string | null;
  taxaCitesReais: string | null;
  freteReais: string | null;
  taxaLpcoReais: string | null;
  despachanteReais: string | null;
  dhlReais: string | null;
  /**
   * Prazo de pagamento ("X dias antes/depois de um evento de referência") —
   * NÃO substitui/complementa modalidadePgtContaBrasil/
   * modalidadePgtContaExterior (Contrato, ver types.ts): modalidade é "à
   * vista"/"parcelado", isto é "quando". `prazoPagamentoEvento` vem
   * populado pela API (não só o id) — ver detalhes-financeiro.routes.ts.
   */
  prazoPagamentoDias: number | null;
  prazoPagamentoDirecao: PrazoPagamentoDirecao | null;
  prazoPagamentoEventoId: string | null;
  prazoPagamentoEvento: { id: string; nomeEvento: string } | null;
}
