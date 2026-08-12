/** Espelham exatamente os campos devolvidos pela API (ver apps/api/src/modules/ — um módulo por entidade, cada um com seu routes.ts). */

export interface Especie {
  id: string;
  nomeEspecie: string;
}

export interface Produto {
  id: string;
  nomeProduto: string;
  especieId: string;
}

export interface Importador {
  id: string;
  nomeRazaoSocial: string;
  pais: string;
  email: string;
}

export interface Representante {
  id: string;
  nomeRepresentante: string;
  email: string;
}

export type SetorResponsavel = "Comercial" | "Produção" | "Ambiental" | "Financeiro" | "Logística";

export interface StatusContrato {
  id: string;
  nomeStatus: string;
  setorResponsavel: SetorResponsavel;
  ordem: number;
}

/** Evento de referência do prazo de pagamento (setor Financeiro) — ver DetalhesFinanceiro.prazoPagamentoEventoId. */
export interface EventoPagamento {
  id: string;
  nomeEvento: string;
}
