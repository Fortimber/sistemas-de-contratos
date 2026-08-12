import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues } from "react-hook-form";
import { z, type ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SectorFieldConfig } from "./field-config";

/**
 * Sentinela do <Select> pros campos opcionais dos setores — Radix Select
 * não aceita value="" (mesmo problema já resolvido em contrato-form.tsx
 * pro contratoPaiId). Ao contrário de lá, TODO <Select> aqui é opcional
 * (setor preenche aos poucos — ver README, Fase 3 da API), então todos
 * precisam da opção "Não selecionado".
 */
export const SETOR_SELECT_VAZIO = "__vazio__";

function numberFieldMessage(cfg: Extract<SectorFieldConfig, { kind: "number" }>): string {
  if (cfg.exclusiveMin !== undefined) return `${cfg.label} precisa ser maior que ${cfg.exclusiveMin}.`;
  if (cfg.min !== undefined && cfg.integer) return `${cfg.label} precisa ser um número inteiro maior ou igual a ${cfg.min}.`;
  if (cfg.min !== undefined) return `${cfg.label} não pode ser menor que ${cfg.min}.`;
  return `${cfg.label} precisa ser um número válido.`;
}

/**
 * Todo campo, qualquer que seja seu tipo real na API, vive no formulário
 * como string (ou boolean, pros checkboxes) — mesma decisão de
 * comissaoPct/comissaoMetragem em contrato-form.tsx, generalizada pra
 * todos os campos numéricos daqui: evita qualquer arredondamento
 * intermediário nos campos monetários do Financeiro (Decimal na API,
 * string na resposta) — a conversão pra number só acontece uma vez, em
 * `sectorFormValuesToPayload`, direto na hora de montar o corpo do PUT.
 */
function fieldSchema(cfg: SectorFieldConfig): ZodType {
  if (cfg.kind === "boolean") return z.boolean();
  if (cfg.kind === "number") {
    return z
      .string()
      .optional()
      .refine(
        (v) => {
          if (!v || v.trim() === "") return true;
          const n = Number(v);
          if (Number.isNaN(n)) return false;
          if (cfg.integer && !Number.isInteger(n)) return false;
          if (cfg.exclusiveMin !== undefined && n <= cfg.exclusiveMin) return false;
          if (cfg.min !== undefined && n < cfg.min) return false;
          return true;
        },
        { message: numberFieldMessage(cfg) },
      );
  }
  return z.string().optional();
}

function buildSectorSchema(fields: SectorFieldConfig[]): ZodType<FieldValues> {
  const shape: Record<string, ZodType> = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  return z.object(shape) as unknown as ZodType<FieldValues>;
}

/**
 * `data` é o registro cru devolvido por GET /contratos/:id/<setor> (ou
 * `null`, setor ainda não preenchido — 404, ver hooks.ts). Todo campo texto/
 * data/número vira string ("" se nulo/ausente); select usa o sentinela
 * quando nulo; boolean vira `false` quando nulo.
 */
export function sectorDetalhesToFormValues(
  fields: SectorFieldConfig[],
  data: Record<string, unknown> | null,
): FieldValues {
  const values: FieldValues = {};
  for (const f of fields) {
    const raw = data?.[f.name];
    if (f.kind === "boolean") {
      values[f.name] = raw === true;
    } else if (f.kind === "select") {
      values[f.name] = raw != null ? String(raw) : SETOR_SELECT_VAZIO;
    } else if (f.kind === "date" && typeof raw === "string") {
      // Datas vêm como datetime ISO completo da API — <input type="date"> só aceita "YYYY-MM-DD".
      values[f.name] = raw.slice(0, 10);
    } else {
      values[f.name] = raw != null ? String(raw) : "";
    }
  }
  return values;
}

/**
 * Inverso de `sectorDetalhesToFormValues`, pro corpo do PUT — campo vazio
 * (string em branco) não entra no payload (upsert parcial: só sobrescreve
 * o que foi enviado, ver detalhes-*.routes.ts). Number(...) só acontece
 * aqui, uma vez, na string exata vinda do form (nunca reformatada antes) —
 * é a mesma garantia de precisão que comissaoPct/comissaoMetragem já usam
 * em contrato-form.tsx.
 */
export function sectorFormValuesToPayload(fields: SectorFieldConfig[], values: FieldValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.kind === "boolean") {
      payload[f.name] = v === true;
      continue;
    }
    if (f.kind === "select") {
      if (typeof v === "string" && v !== SETOR_SELECT_VAZIO && v !== "") payload[f.name] = v;
      continue;
    }
    if (typeof v !== "string" || v.trim() === "") continue;
    payload[f.name] = f.kind === "number" ? Number(v) : v;
  }
  return payload;
}

interface SectorFormProps {
  fields: SectorFieldConfig[];
  defaultValues: FieldValues;
  onSubmit: (payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

/**
 * Formulário genérico dirigido por `fields` (mesmo espírito de
 * ReferenceCrudPage em reference-crud-page.tsx, generalizado pra também
 * cobrir campo `date`/`boolean`) — reusado pelos 4 setores
 * (producao-tab.tsx, ambiental-tab.tsx, logistica-tab.tsx,
 * financeiro-tab.tsx), cada um só declarando sua lista de campos.
 */
export function SectorForm({ fields, defaultValues, onSubmit, isSubmitting, submitError }: SectorFormProps) {
  const schema = buildSectorSchema(fields);
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as never) as never,
    defaultValues,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(sectorFormValuesToPayload(fields, values)))}
        className="grid gap-6"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) =>
                f.kind === "boolean" ? (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">{f.label}</FormLabel>
                  </FormItem>
                ) : f.kind === "select" ? (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <Select value={field.value as string} onValueChange={field.onChange} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SETOR_SELECT_VAZIO}>Não selecionado</SelectItem>
                        {f.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                ) : (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
                        step={f.kind === "number" ? (f.step ?? "0.01") : undefined}
                        disabled={isSubmitting}
                        {...field}
                        value={field.value as string}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }
            />
          ))}
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
