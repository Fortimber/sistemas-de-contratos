import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { canWriteSector } from "@/lib/permissions";
import type { SectorFieldConfig } from "./field-config";
import { useDetalhesLogistica, useSalvarDetalhesLogistica } from "./hooks";
import { SectorTab } from "./sector-tab";

/** Valores originais do sistema anterior — ver comentário em schema.prisma e detalhes-logistica.routes.ts. */
const PAGAMENTO_BL = ["Sim", "Não"] as const;

/** Espelha DetalhesLogistica no schema.prisma. */
const FIELDS: SectorFieldConfig[] = [
  { kind: "text", name: "ciaMaritima", label: "Companhia marítima" },
  { kind: "text", name: "nomeNavio", label: "Nome do navio" },
  { kind: "text", name: "booking", label: "Booking" },
  { kind: "text", name: "containerNumero", label: "Número do container" },
  { kind: "date", name: "dataPrancha", label: "Data da prancha" },
  { kind: "date", name: "dataDraftDocumentos", label: "Data do draft de documentos" },
  { kind: "date", name: "dataDraftCarga", label: "Data do draft de carga" },
  { kind: "date", name: "dataColetaContainer", label: "Data de coleta do container" },
  { kind: "date", name: "dataPosEmbarqueDocsCliente", label: "Data de envio dos documentos ao cliente (pós-embarque)" },
  { kind: "date", name: "dataEntradaPortoDestino", label: "Data de entrada no porto de destino" },
  { kind: "date", name: "dataPrevistaSaidaNavio", label: "Data prevista de saída do navio" },
  { kind: "date", name: "dataNavioNoDestino", label: "Data do navio no destino" },
  { kind: "text", name: "blNumero", label: "Número do BL" },
  { kind: "date", name: "blData", label: "Data do BL" },
  { kind: "text", name: "portoDestinoPais", label: "Porto de destino / país" },
  { kind: "text", name: "motorista", label: "Motorista" },
  { kind: "text", name: "placaVeiculo", label: "Placa do veículo" },
  { kind: "select", name: "pagamentoBl", label: "Pagamento do BL", options: PAGAMENTO_BL },
];

export function LogisticaTab({ contratoId }: { contratoId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteSector("logistica", user?.perfilAcesso);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useDetalhesLogistica(contratoId);
  const mutation = useSalvarDetalhesLogistica(contratoId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logística</CardTitle>
      </CardHeader>
      <CardContent>
        <SectorTab
          fields={FIELDS}
          data={query.data as Record<string, unknown> | null | undefined}
          isLoading={query.isLoading}
          isError={query.isError}
          errorMessage="Não foi possível carregar os dados de logística."
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
