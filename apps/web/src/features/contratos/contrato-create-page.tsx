import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";
import { CONTRATO_FORM_DEFAULT_VALUES, ContratoForm } from "./contrato-form";
import type { Contrato } from "./types";

export function ContratoCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<Contrato>("/contratos", payload),
    onSuccess: (contrato) => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      navigate(`/contratos/${contrato.id}`);
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Não foi possível criar o contrato. Tente novamente.");
    },
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold">Novo contrato</h1>
        <p className="text-sm text-muted-foreground">Preencha os dados do contrato.</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <ContratoForm
            defaultValues={CONTRATO_FORM_DEFAULT_VALUES}
            onSubmit={(payload) => {
              setSubmitError(null);
              createMutation.mutate(payload);
            }}
            isSubmitting={createMutation.isPending}
            submitError={submitError}
            submitLabel="Criar contrato"
          />
        </CardContent>
      </Card>
    </div>
  );
}
