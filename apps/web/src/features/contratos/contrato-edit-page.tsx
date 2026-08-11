import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";
import { ContratoForm, contratoToFormValues } from "./contrato-form";
import { useContrato } from "./hooks";
import type { Contrato } from "./types";

export function ContratoEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const contratoQuery = useContrato(id);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Contrato>(`/contratos/${id}`, payload),
    onSuccess: (contrato) => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      navigate(`/contratos/${contrato.id}`);
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold">Editar contrato</h1>
        {contratoQuery.data && <p className="text-sm text-muted-foreground">{contratoQuery.data.numeroContrato}</p>}
      </div>

      <Card>
        <CardContent className="pt-4">
          {contratoQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {contratoQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar o contrato.</p>}

          {/* Só monta o formulário depois que os dados existentes chegaram — ver
              comentário em contrato-form.tsx sobre por que ele usa só `defaultValues`,
              nunca `values`: precisa montar já com os dados certos, uma vez só. */}
          {contratoQuery.data && (
            <ContratoForm
              defaultValues={contratoToFormValues(contratoQuery.data)}
              onSubmit={(payload) => {
                setSubmitError(null);
                updateMutation.mutate(payload);
              }}
              isSubmitting={updateMutation.isPending}
              submitError={submitError}
              submitLabel="Salvar alterações"
              excludeContratoId={contratoQuery.data.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
