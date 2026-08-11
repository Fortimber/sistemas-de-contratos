import { z } from "zod";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import type { Representante } from "./types";

// Espelha createBodySchema/patchBodySchema de POST/PATCH /representantes na API.
const schema = z.object({
  nomeRepresentante: z.string().min(1, "Informe o nome do representante."),
  email: z.string().min(1, "Informe o e-mail."),
});

const config: ReferenceCrudConfig<Representante> = {
  title: "Representantes",
  description: "Representantes comerciais associados aos contratos.",
  entityLabel: "representante",
  endpoint: "/representantes",
  queryKey: "representantes",
  columns: [
    { header: "Nome", cell: (row) => row.nomeRepresentante },
    { header: "E-mail", cell: (row) => row.email },
  ],
  formFields: [
    { kind: "text", name: "nomeRepresentante", label: "Nome" },
    { kind: "text", name: "email", label: "E-mail" },
  ],
  schema,
  defaultValues: { nomeRepresentante: "", email: "" },
  toFormValues: (row) => ({ nomeRepresentante: row.nomeRepresentante, email: row.email }),
};

export function RepresentantesPage() {
  return <ReferenceCrudPage config={config} />;
}
