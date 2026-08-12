/**
 * Item de contrato (linha de especificação — espessura/largura/comprimento/
 * volume/preço). Espelha o formato de `GET /contratos/:id/itens` na API
 * (`apps/api/src/modules/itens-contrato/itens-contrato.routes.ts`). Todo
 * campo numérico é `Decimal` no Postgres, então chega como STRING (mesma
 * decisão de precisão de `Contrato.valorTotalUsd`/`DetalhesFinanceiro` —
 * `Prisma.Decimal.toJSON()`, evita reintroduzir erro de arredondamento de
 * float). Nunca converter pra `number` fora da hora de montar o payload de
 * envio (ver `itens-section.tsx`).
 */
export interface ItemContrato {
  id: string;
  contratoId: string;
  espessuraMm: string;
  larguraMm: string;
  comprimentoMinMm: string;
  comprimentoMaxMm: string;
  volumeM3: string;
  precoPorM3Usd: string;
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
  precoPorM3Usd: number;
}
