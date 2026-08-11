import { z } from "zod";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import type { Especie } from "./types";

// Espelha createBodySchema/patchBodySchema de POST/PATCH /especies na API.
const schema = z.object({
  nomeEspecie: z.string().min(1, "Informe o nome da espécie."),
});

const config: ReferenceCrudConfig<Especie> = {
  title: "Espécies",
  description: "Espécies de madeira usadas pelos produtos.",
  entityLabel: "espécie",
  genero: "f",
  endpoint: "/especies",
  queryKey: "especies",
  columns: [{ header: "Nome", cell: (row) => row.nomeEspecie }],
  formFields: [{ kind: "text", name: "nomeEspecie", label: "Nome" }],
  schema,
  defaultValues: { nomeEspecie: "" },
  toFormValues: (row) => ({ nomeEspecie: row.nomeEspecie }),
};

export function EspeciesPage() {
  return <ReferenceCrudPage config={config} />;
}
