import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { canWriteReferences } from "@/lib/permissions";
import { useContrato } from "./hooks";

function formatValor(valor: string, moeda: string): string {
  return `${moeda} ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatBooleano(v: boolean): string {
  return v ? "Sim" : "Não";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** Nome do contrato pai (se houver) — GET /contratos/:id não populariza `contratoPai`, só o id; busca à parte. */
function ContratoPaiField({ contratoPaiId }: { contratoPaiId: string }) {
  const paiQuery = useContrato(contratoPaiId);
  return (
    <Field
      label="Contrato pai"
      value={
        paiQuery.data ? (
          <Link to={`/contratos/${contratoPaiId}`} className="underline underline-offset-2">
            {paiQuery.data.numeroContrato}
          </Link>
        ) : (
          "carregando…"
        )
      }
    />
  );
}

/** Tela de detalhe — dados do contrato com as relações já populadas (importador, representante, produto, status com nome, não só id). */
export function ContratoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = canWriteReferences(user?.perfilAcesso);
  const contratoQuery = useContrato(id);

  if (contratoQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (contratoQuery.isError || !contratoQuery.data) {
    return <p className="text-sm text-destructive">Não foi possível carregar o contrato.</p>;
  }

  const c = contratoQuery.data;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/contratos" className="text-sm text-muted-foreground underline underline-offset-2">
            ← Contratos
          </Link>
          <h1 className="text-lg font-semibold">{c.numeroContrato}</h1>
        </div>
        {canWrite && (
          <Button asChild variant="outline">
            <Link to={`/contratos/${c.id}/editar`}>Editar</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados gerais</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Status" value={c.status.nomeStatus} />
            <Field label="Tipo de contrato" value={c.tipoContrato} />
            <Field label="Data do contrato" value={formatData(c.dataContrato)} />
            <Field label="Importador" value={`${c.importador.nomeRazaoSocial} (${c.importador.pais})`} />
            <Field label="Representante" value={c.representante.nomeRepresentante} />
            <Field label="Produto" value={c.produto.nomeProduto} />
            <Field label="Local" value={c.local} />
            <Field label="Volume (m³)" value={c.volumeM3} />
            <Field label="Quantidade de containers" value={c.qtdContainers} />
            <Field label="Tipo de frete" value={c.tipoFrete} />
            {c.contratoPaiId && <ContratoPaiField contratoPaiId={c.contratoPaiId} />}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Valor total" value={formatValor(c.valorTotalUsd, c.moedaValorTotal)} />
            <Field label="Comissão (%)" value={c.comissaoPct ?? "—"} />
            <Field label="Comissão por metragem" value={c.comissaoMetragem ?? "—"} />
            <Field label="Modalidade de pagamento (Brasil)" value={c.modalidadePgtContaBrasil} />
            <Field label="Modalidade de pagamento (exterior)" value={c.modalidadePgtContaExterior} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requisitos</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Requer fumigação" value={formatBooleano(c.requerFumigacao)} />
            <Field label="Certificação de processo de origem" value={formatBooleano(c.certificacaoProcessoOrigem)} />
            <Field label="Requer CITES" value={formatBooleano(c.requerCites)} />
            <Field label="Requer FSC" value={formatBooleano(c.requerFsc)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
