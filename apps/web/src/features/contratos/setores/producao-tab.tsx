import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { canWriteSector } from "@/lib/permissions";
import type { SectorFieldConfig } from "./field-config";
import { useDetalhesProducao, useSalvarDetalhesProducao } from "./hooks";
import { SectorTab } from "./sector-tab";

/** Espelha DetalhesProducao no schema.prisma. */
const FIELDS: SectorFieldConfig[] = [
  { kind: "text", name: "numeroRomaneio", label: "Número do romaneio" },
  { kind: "number", name: "volumeRomaneioM3", label: "Volume do romaneio (m³)", exclusiveMin: 0 },
  { kind: "number", name: "qtdContainersConfirmada", label: "Quantidade de containers confirmada", integer: true, min: 0, step: "1" },
  { kind: "text", name: "observacoesProducao", label: "Observações" },
  { kind: "date", name: "dataCocEnviadaDespachante", label: "Data de envio do CoC ao despachante" },
];

export function ProducaoTab({ contratoId }: { contratoId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteSector("producao", user?.perfilAcesso);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useDetalhesProducao(contratoId);
  const mutation = useSalvarDetalhesProducao(contratoId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produção</CardTitle>
      </CardHeader>
      <CardContent>
        <SectorTab
          fields={FIELDS}
          data={query.data as Record<string, unknown> | null | undefined}
          isLoading={query.isLoading}
          isError={query.isError}
          errorMessage="Não foi possível carregar os dados de produção."
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
