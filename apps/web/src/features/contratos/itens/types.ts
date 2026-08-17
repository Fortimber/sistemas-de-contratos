import type { Moeda } from "@/lib/moedas";

/**
 * Item de contrato (linha de especificação — espessura/largura/comprimento/
 * volume/preço/moeda). Espelha o formato de `GET /contratos/:id/itens` na
 * API (`apps/api/src/modules/itens-contrato/itens-contrato.routes.ts`).
 * Todo campo numérico é `Decimal` no Postgres, então chega como STRING
 * (mesma decisão de precisão de `Contrato.valorTotalUsd`/
 * `DetalhesFinanceiro` — `Prisma.Decimal.toJSON()`, evita reintroduzir erro
 * de arredondamento de float). Nunca converter pra `number` fora da hora de
 * montar o payload de envio (ver `itens-section.tsx`).
 *
 * `moeda` é por item, não por contrato — itens do mesmo contrato podem
 * estar em moedas diferentes entre si (ver `somaValores` em
 * `itens-section.tsx`, que por isso nunca soma `precoPorM3`/valor de itens
 * com `moeda` diferente como se fosse a mesma coisa).
 */
export interface ItemContrato {
  id: string;
  contratoId: string;
  espessuraMm: string;
  larguraMm: string;
  comprimentoMinMm: string;
  comprimentoMaxMm: string;
  volumeM3: string;
  precoPorM3: string;
  moeda: Moeda;
  criadoEm: string;
  atualizadoEm: string;
}

/** Corpo de POST/PATCH — todo campo numérico, obrigatório na criação (edição aceita subconjunto). */
export interface ItemContratoPayload {
  espessuraMm: number;
  larguraMm: number;
  comprimentoMinMm: number;
  comprimentoMaxMm: number;
  volumeM3: number;
  precoPorM3: number;
  moeda: Moeda;
}
