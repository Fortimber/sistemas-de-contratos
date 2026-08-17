/**
 * Moedas aceitas — mesma lista usada pela API pra validar `ItemContrato.moeda`
 * (apps/api/src/lib/moedas.ts). Fonte única pro frontend: `contrato-form.tsx`
 * (`moedaValorTotal`, só validação de UI) e `itens-section.tsx`
 * (`moeda`, validado no backend) importam daqui — nenhum dos dois duplica o
 * literal.
 */
export const MOEDAS = ["USD", "EUR", "BRL", "GBP", "CNY"] as const;

export type Moeda = (typeof MOEDAS)[number];
