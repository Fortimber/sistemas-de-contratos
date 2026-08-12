import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { canWriteSector } from "@/lib/permissions";
import type { SectorFieldConfig } from "./field-config";
import { useDetalhesFinanceiro, useSalvarDetalhesFinanceiro } from "./hooks";
import { SectorTab } from "./sector-tab";

/**
 * Espelha DetalhesFinanceiro no schema.prisma. statusEmbarqueXCambio/
 * statusGeralCambio/formaPagamento ficam como texto livre (`kind: "text"`)
 * de propósito — a API não valida uma lista fixa pra eles (decisão em
 * aberto documentada em detalhes-financeiro.routes.ts), ao contrário de
 * lpcoStatus/citesStatus/statusAprovacaoCocCliente (Ambiental) e
 * pagamentoBl (Logística), que são `<Select>`.
 *
 * Campos monetários (Decimal na API) usam `kind: "number"` como qualquer
 * outro numérico — a garantia de precisão (nunca converter pra number fora
 * da hora de montar o payload) já é do formulário genérico
 * (sector-form.tsx), não precisa de um "kind" à parte aqui.
 */
const FIELDS: SectorFieldConfig[] = [
  { kind: "text", name: "nfNumero", label: "Número da NF" },
  { kind: "date", name: "nfData", label: "Data da NF" },
  { kind: "number", name: "nfVolumeM3", label: "Volume da NF (m³)" },
  { kind: "number", name: "nfValorReais", label: "Valor da NF (R$)", min: 0 },
  { kind: "text", name: "invoiceNumero", label: "Número do invoice" },
  { kind: "number", name: "invoiceValor", label: "Valor do invoice", min: 0 },
  { kind: "date", name: "dataFechamentoCambio", label: "Data de fechamento do câmbio" },
  { kind: "text", name: "banco", label: "Banco" },
  { kind: "text", name: "moedaCambial", label: "Moeda cambial" },
  { kind: "number", name: "taxaCambial", label: "Taxa cambial", exclusiveMin: 0, step: "0.000001" },
  { kind: "number", name: "valorRecebidoReais", label: "Valor recebido (R$)", min: 0 },
  { kind: "text", name: "statusEmbarqueXCambio", label: "Status embarque x câmbio" },
  { kind: "text", name: "statusGeralCambio", label: "Status geral do câmbio" },
  { kind: "text", name: "formaPagamento", label: "Forma de pagamento" },
  { kind: "boolean", name: "comissaoSobreVenda", label: "Comissão sobre venda" },
  { kind: "number", name: "valorComissaoReais", label: "Valor da comissão (R$)", min: 0 },
  { kind: "number", name: "valorComissaoDolar", label: "Valor da comissão (US$)", min: 0 },
  { kind: "number", name: "taxasLocaisReais", label: "Taxas locais (R$)", min: 0 },
  { kind: "number", name: "taxaScannerReais", label: "Taxa de scanner (R$)", min: 0 },
  { kind: "number", name: "taxaDetentionsReais", label: "Taxa de detentions (R$)", min: 0 },
  { kind: "number", name: "taxaCertificadoOrigemReais", label: "Taxa de certificado de origem (R$)", min: 0 },
  { kind: "number", name: "taxaCertificadoFitosanitarioReais", label: "Taxa de certificado fitossanitário (R$)", min: 0 },
  { kind: "number", name: "taxaCertificadoFumigacaoReais", label: "Taxa de certificado de fumigação (R$)", min: 0 },
  { kind: "number", name: "taxaWaybillReais", label: "Taxa de waybill (R$)", min: 0 },
  { kind: "number", name: "taxaCitesReais", label: "Taxa de CITES (R$)", min: 0 },
  { kind: "number", name: "freteReais", label: "Frete (R$)", min: 0 },
  { kind: "number", name: "taxaLpcoReais", label: "Taxa de LPCO (R$)", min: 0 },
  { kind: "number", name: "despachanteReais", label: "Despachante (R$)", min: 0 },
  { kind: "number", name: "dhlReais", label: "DHL (R$)", min: 0 },
];

export function FinanceiroTab({ contratoId }: { contratoId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteSector("financeiro", user?.perfilAcesso);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useDetalhesFinanceiro(contratoId);
  const mutation = useSalvarDetalhesFinanceiro(contratoId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financeiro</CardTitle>
      </CardHeader>
      <CardContent>
        <SectorTab
          fields={FIELDS}
          data={query.data as Record<string, unknown> | null | undefined}
          isLoading={query.isLoading}
          isError={query.isError}
          errorMessage="Não foi possível carregar os dados financeiros."
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
