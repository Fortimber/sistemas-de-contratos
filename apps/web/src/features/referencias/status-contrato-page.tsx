import { z } from "zod";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import type { StatusContrato } from "./types";

const SETORES = ["Comercial", "Produção", "Ambiental", "Financeiro", "Logística"] as const;

// Espelha createBodySchema/patchBodySchema de POST/PATCH /status-contrato na API.
const schema = z.object({
  nomeStatus: z.string().min(1, "Informe o nome do status."),
  setorResponsavel: z.enum(SETORES, { message: "Selecione o setor responsável." }),
  ordem: z.coerce.number().int("A ordem precisa ser um número inteiro."),
});

const config: ReferenceCrudConfig<StatusContrato> = {
  title: "Status de contrato",
  description: "Etapas do fluxo de um contrato, na ordem em que acontecem.",
  entityLabel: "status",
  endpoint: "/status-contrato",
  queryKey: "status-contrato",
  columns: [
    { header: "Nome", cell: (row) => row.nomeStatus },
    { header: "Setor responsável", cell: (row) => row.setorResponsavel },
    { header: "Ordem", cell: (row) => row.ordem },
  ],
  formFields: [
    { kind: "text", name: "nomeStatus", label: "Nome" },
    {
      kind: "select",
      name: "setorResponsavel",
      label: "Setor responsável",
      options: SETORES.map((s) => ({ value: s, label: s })),
    },
    { kind: "number", name: "ordem", label: "Ordem" },
  ],
  schema,
  defaultValues: { nomeStatus: "", setorResponsavel: "", ordem: 1 },
  toFormValues: (row) => ({ nomeStatus: row.nomeStatus, setorResponsavel: row.setorResponsavel, ordem: row.ordem }),
};

export function StatusContratoPage() {
  return <ReferenceCrudPage config={config} />;
}
