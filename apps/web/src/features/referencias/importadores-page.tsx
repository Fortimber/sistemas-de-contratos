import { z } from "zod";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import type { Importador } from "./types";

// Espelha createBodySchema/patchBodySchema de POST/PATCH /importadores na API
// — inclusive a API não valida formato de e-mail, só não-vazio; mantido igual
// de propósito, pra não recusar no frontend algo que a API aceitaria.
const schema = z.object({
  nomeRazaoSocial: z.string().min(1, "Informe o nome/razão social."),
  pais: z.string().min(1, "Informe o país."),
  email: z.string().min(1, "Informe o e-mail."),
});

const config: ReferenceCrudConfig<Importador> = {
  title: "Importadores",
  description: "Empresas importadoras dos contratos.",
  entityLabel: "importador",
  endpoint: "/importadores",
  queryKey: "importadores",
  columns: [
    { header: "Nome/Razão social", cell: (row) => row.nomeRazaoSocial },
    { header: "País", cell: (row) => row.pais },
    { header: "E-mail", cell: (row) => row.email },
  ],
  formFields: [
    { kind: "text", name: "nomeRazaoSocial", label: "Nome/Razão social" },
    { kind: "text", name: "pais", label: "País" },
    { kind: "text", name: "email", label: "E-mail" },
  ],
  schema,
  defaultValues: { nomeRazaoSocial: "", pais: "", email: "" },
  toFormValues: (row) => ({ nomeRazaoSocial: row.nomeRazaoSocial, pais: row.pais, email: row.email }),
};

export function ImportadoresPage() {
  return <ReferenceCrudPage config={config} />;
}
