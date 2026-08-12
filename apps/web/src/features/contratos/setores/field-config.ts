/**
 * Descreve declarativamente os campos de UM setor (Produção/Ambiental/
 * Logística/Financeiro) — a mesma lista alimenta tanto o formulário
 * (sector-form.tsx) quanto a visão somente-leitura (sector-read-only.tsx),
 * pra não repetir label/nome de campo duas vezes por setor (Financeiro
 * sozinho tem quase 30 campos). Espelha exatamente os campos e restrições
 * dos schemas `putBodySchema` em `apps/api/src/modules/detalhes-<setor>/
 * <setor>.routes.ts`.
 */
export type SectorFieldConfig =
  | { kind: "text"; name: string; label: string }
  | { kind: "date"; name: string; label: string }
  | {
      kind: "number";
      name: string;
      label: string;
      /** Passo do <input type="number"> — default "0.01" (valores monetários/m³). */
      step?: string;
      integer?: boolean;
      min?: number;
      exclusiveMin?: number;
    }
  | { kind: "select"; name: string; label: string; options: readonly string[] }
  | { kind: "boolean"; name: string; label: string };
