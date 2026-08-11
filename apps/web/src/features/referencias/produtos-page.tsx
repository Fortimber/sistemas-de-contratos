import { z } from "zod";
import { ReferenceCrudPage, type ReferenceCrudConfig } from "./reference-crud-page";
import { REFERENCE_OPTIONS_PAGE_SIZE, useEspecies } from "./hooks";
import type { Produto } from "./types";

// Espelha createBodySchema/patchBodySchema de POST/PATCH /produtos na API.
const schema = z.object({
  nomeProduto: z.string().min(1, "Informe o nome do produto."),
  especieId: z.string().min(1, "Selecione uma espécie."),
});

export function ProdutosPage() {
  // pageSize alto pra alimentar o <Select> do formulário e a coluna "Espécie"
  // da tabela com um lookup id -> nome em memória — ver REFERENCE_OPTIONS_PAGE_SIZE.
  const especiesQuery = useEspecies({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const especies = especiesQuery.data?.data ?? [];
  const especieNomePorId = new Map(especies.map((e) => [e.id, e.nomeEspecie]));

  const config: ReferenceCrudConfig<Produto> = {
    title: "Produtos",
    description: "Produtos vendidos, cada um associado a uma espécie.",
    entityLabel: "produto",
    endpoint: "/produtos",
    queryKey: "produtos",
    columns: [
      { header: "Nome", cell: (row) => row.nomeProduto },
      { header: "Espécie", cell: (row) => especieNomePorId.get(row.especieId) ?? row.especieId },
    ],
    formFields: [
      { kind: "text", name: "nomeProduto", label: "Nome" },
      {
        kind: "select",
        name: "especieId",
        label: "Espécie",
        options: especies.map((e) => ({ value: e.id, label: e.nomeEspecie })),
      },
    ],
    schema,
    defaultValues: { nomeProduto: "", especieId: "" },
    toFormValues: (row) => ({ nomeProduto: row.nomeProduto, especieId: row.especieId }),
  };

  return <ReferenceCrudPage config={config} />;
}
