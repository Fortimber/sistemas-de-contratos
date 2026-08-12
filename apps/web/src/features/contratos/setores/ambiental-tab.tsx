import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { canWriteSector } from "@/lib/permissions";
import type { SectorFieldConfig } from "./field-config";
import { useDetalhesAmbiental, useSalvarDetalhesAmbiental } from "./hooks";
import { SectorTab } from "./sector-tab";

/** Valores originais do sistema anterior — ver comentário em schema.prisma e detalhes-ambiental.routes.ts. */
const LPCO_STATUS = ["Em análise", "Protocolada", "Deferida", "Indeferida"] as const;
const CITES_STATUS = ["Não se aplica", "Em análise", "Deferida", "Indeferida"] as const;
const STATUS_APROVACAO_COC = ["Pendente", "Aprovado", "Reprovado"] as const;

/** Espelha DetalhesAmbiental no schema.prisma. */
const FIELDS: SectorFieldConfig[] = [
  { kind: "text", name: "autef", label: "AUTEF" },
  { kind: "text", name: "lpcoNumero", label: "Número do LPCO" },
  { kind: "select", name: "lpcoStatus", label: "Status do LPCO", options: LPCO_STATUS },
  { kind: "date", name: "lpcoDataProtocolo", label: "Data de protocolo do LPCO" },
  { kind: "date", name: "lpcoDataValidade", label: "Data de validade do LPCO" },
  { kind: "text", name: "citesNumeroRequerimento", label: "Número do requerimento CITES" },
  { kind: "text", name: "citesNumero", label: "Número do CITES" },
  { kind: "date", name: "citesDataEntrada", label: "Data de entrada do CITES" },
  { kind: "date", name: "citesDataValidade", label: "Data de validade do CITES" },
  { kind: "select", name: "citesStatus", label: "Status do CITES", options: CITES_STATUS },
  { kind: "text", name: "gfNumero", label: "Número da GF" },
  { kind: "date", name: "gfDataVencimento", label: "Data de vencimento da GF" },
  { kind: "date", name: "gfDataRecebimentoSisflora", label: "Data de recebimento da GF no Sisflora" },
  { kind: "date", name: "dofDataRegistro", label: "Data de registro do DOF" },
  { kind: "select", name: "statusAprovacaoCocCliente", label: "Status de aprovação do CoC pelo cliente", options: STATUS_APROVACAO_COC },
];

export function AmbientalTab({ contratoId }: { contratoId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteSector("ambiental", user?.perfilAcesso);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useDetalhesAmbiental(contratoId);
  const mutation = useSalvarDetalhesAmbiental(contratoId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ambiental</CardTitle>
      </CardHeader>
      <CardContent>
        <SectorTab
          fields={FIELDS}
          data={query.data as Record<string, unknown> | null | undefined}
          isLoading={query.isLoading}
          isError={query.isError}
          errorMessage="Não foi possível carregar os dados ambientais."
          canWrite={canWrite}
          onSubmit={(payload) => {
            setSubmitError(null);
            mutation.mutate(payload, {
              onError: (err) => {
                setSubmitError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
              },
            });
          }}
          isSubmitting={mutation.isPending}
          submitError={submitError}
        />
      </CardContent>
    </Card>
  );
}
