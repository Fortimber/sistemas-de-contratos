import type { ReactNode } from "react";
import type { SectorFieldConfig } from "./field-config";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function formatValue(f: SectorFieldConfig, raw: unknown): ReactNode {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (f.kind === "boolean") return raw === true ? "Sim" : "Não";
  if (f.kind === "date" && typeof raw === "string") {
    return new Date(raw).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  // select-entity guarda id em `raw` (o campo é a FK, ex.:
  // prazoPagamentoEventoId) — mostra o nome, não o id cru, via lookup nas
  // mesmas opções que alimentam o <Select> do formulário.
  if (f.kind === "select-entity") {
    return f.options.find((opt) => opt.value === raw)?.label ?? String(raw);
  }
  // number (inclui os campos monetários, Decimal-como-string da API) e
  // select/text: mostrar o valor bruto, sem reformatar — mesmo cuidado de
  // precisão do formulário (ver sector-form.tsx).
  return String(raw);
}

/**
 * Visão somente-leitura de um setor — usada quando o usuário logado não
 * tem permissão de escrita na aba (ver lib/permissions.ts,
 * `canWriteSector`). Mesma lista de `fields` do formulário
 * (sector-form.tsx), só trocando input editável por texto estático.
 */
export function SectorReadOnly({ fields, data }: { fields: SectorFieldConfig[]; data: Record<string, unknown> }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => (
        <Field key={f.name} label={f.label} value={formatValue(f, data[f.name])} />
      ))}
    </dl>
  );
}
