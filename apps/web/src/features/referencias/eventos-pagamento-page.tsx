import { z } from "zod";
import { canWriteEventosPagamento } from "@/lib/permissions";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import type { EventoPagamento } from "./types";

// Espelha createBodySchema/patchBodySchema de POST/PATCH /eventos-pagamento na API.
const schema = z.object({
  nomeEvento: z.string().min(1, "Informe o nome do evento."),
});

const config: ReferenceCrudConfig<EventoPagamento> = {
  title: "Eventos de pagamento",
  description: "Eventos de referência usados no prazo de pagamento do setor Financeiro (ex.: chegada do navio).",
  entityLabel: "evento de pagamento",
  endpoint: "/eventos-pagamento",
  queryKey: "eventos-pagamento",
  canWrite: canWriteEventosPagamento,
  columns: [{ header: "Nome", cell: (row) => row.nomeEvento }],
  formFields: [{ kind: "text", name: "nomeEvento", label: "Nome" }],
  schema,
  defaultValues: { nomeEvento: "" },
  toFormValues: (row) => ({ nomeEvento: row.nomeEvento }),
};

export function EventosPagamentoPage() {
  return <ReferenceCrudPage config={config} />;
}
