/**
 * Moedas aceitas — mesma lista usada pelo <Select> de moeda no frontend
 * (apps/web/src/lib/moedas.ts) e por Contrato.moedaValorTotal (que, esse
 * sim, só valida isso na UI — ver comentário em contrato-form.tsx). Fonte
 * única pra não duplicar o literal em cada schema que precisa validar
 * moeda no backend.
 */
export const MOEDAS = ["USD", "EUR", "BRL", "GBP", "CNY"] as const;

export type Moeda = (typeof MOEDAS)[number];
