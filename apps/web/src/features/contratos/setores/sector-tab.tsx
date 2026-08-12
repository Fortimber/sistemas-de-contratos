import type { FieldValues } from "react-hook-form";
import type { SectorFieldConfig } from "./field-config";
import { SectorForm, sectorDetalhesToFormValues } from "./sector-form";
import { SectorReadOnly } from "./sector-read-only";

interface SectorTabProps {
  fields: SectorFieldConfig[];
  /** `null` = setor ainda não preenchido (404 na API); `undefined` = carregando. */
  data: Record<string, unknown> | null | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  /** Ver lib/permissions.ts (`canWriteSector`) — espelha o `requireRole` do backend pra este setor. */
  canWrite: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

/**
 * Casca comum às 4 abas setoriais da tela de detalhe do contrato: decide
 * entre carregando / erro / formulário editável / visão somente-leitura /
 * "ainda não preenchido" — a única coisa que muda de um setor pro outro é
 * `fields` e os hooks de dados (ver producao-tab.tsx e os outros 3).
 */
export function SectorTab({
  fields,
  data,
  isLoading,
  isError,
  errorMessage,
  canWrite,
  onSubmit,
  isSubmitting,
  submitError,
}: SectorTabProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (isError) {
    return <p className="text-sm text-destructive">{errorMessage}</p>;
  }

  if (canWrite) {
    return (
      <SectorForm
        fields={fields}
        defaultValues={sectorDetalhesToFormValues(fields, data ?? null) as FieldValues}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Ainda não preenchido para este contrato.</p>;
  }

  return <SectorReadOnly fields={fields} data={data} />;
}
