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
  | { kind: "boolean"; name: string; label: string }
  /**
   * Select alimentado por uma entidade externa (id -> nome), não por uma
   * lista fixa de domínio — diferente de `select` (onde cada opção é seu
   * próprio value/label, ex.: "Sim"/"Não"). Único uso hoje: `evento` do
   * prazo de pagamento do Financeiro (`financeiro-tab.tsx`), que busca as
   * opções via `useEventosPagamento`. `options` é passado pronto (já
   * `{value, label}[]`) porque só quem monta o field (o componente do
   * setor) sabe fazer esse fetch — `field-config.ts` continua sem
   * depender de nenhum hook.
   */
  | { kind: "select-entity"; name: string; label: string; options: { value: string; label: string }[] };
