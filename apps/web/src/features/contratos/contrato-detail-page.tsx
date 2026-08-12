import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { canViewAuditoria, canWriteReferences } from "@/lib/permissions";
import { useContrato } from "./hooks";
import { AuditoriaTab } from "./historico-auditoria/auditoria-tab";
import { HistoricoTab } from "./historico-auditoria/historico-tab";
import { AmbientalTab } from "./setores/ambiental-tab";
import { FinanceiroTab } from "./setores/financeiro-tab";
import { LogisticaTab } from "./setores/logistica-tab";
import { ProducaoTab } from "./setores/producao-tab";
import { TIPO_CONTRATO_LABELS } from "./types";

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

/** Tela de detalhe — dados do contrato com as relações já populadas (importador, representante, produto, status com nome, não só id). */
export function ContratoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = canWriteReferences(user?.perfilAcesso);
  const canSeeAuditoria = canViewAuditoria(user?.perfilAcesso);
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
            <Field label="Tipo de contrato" value={TIPO_CONTRATO_LABELS[c.tipoContrato]} />
            <Field label="Data do contrato" value={formatData(c.dataContrato)} />
            <Field label="Importador" value={`${c.importador.nomeRazaoSocial} (${c.importador.pais})`} />
            <Field label="Representante" value={c.representante.nomeRepresentante} />
            <Field label="Produto" value={c.produto.nomeProduto} />
            <Field label="Local" value={c.local} />
            <Field label="Volume (m³)" value={c.volumeM3} />
            <Field label="Quantidade de containers" value={c.qtdContainers} />
            <Field label="Tipo de frete" value={c.tipoFrete} />
            {c.contratoPai && (
              <Field
                label="Contrato original"
                value={
                  <Link to={`/contratos/${c.contratoPai.id}`} className="underline underline-offset-2">
                    {c.contratoPai.numeroContrato}
                  </Link>
                }
              />
            )}
          </dl>
        </CardContent>
      </Card>

      {c.aditivos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aditivos vinculados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5">
              {c.aditivos.map((a) => (
                <li key={a.id}>
                  <Link to={`/contratos/${a.id}`} className="text-sm underline underline-offset-2">
                    {a.numeroContrato}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
            <Field label="Requer certificado fitossanitário" value={formatBooleano(c.requerCertificadoFitossanitario)} />
            <Field label="Requer certificado Kiln Dried" value={formatBooleano(c.requerCertificadoKilnDried)} />
          </dl>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Módulos setoriais e histórico</h2>
        <Tabs defaultValue="producao">
          <TabsList>
            <TabsTrigger value="producao">Produção</TabsTrigger>
            <TabsTrigger value="ambiental">Ambiental</TabsTrigger>
            <TabsTrigger value="logistica">Logística</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            {/* Aba "Auditoria" nem existe no DOM pra quem não é Administrador — não
                é só conteúdo escondido, ver canViewAuditoria em lib/permissions.ts. */}
            {canSeeAuditoria && <TabsTrigger value="auditoria">Auditoria</TabsTrigger>}
          </TabsList>
          <TabsContent value="producao">
            <ProducaoTab contratoId={c.id} />
          </TabsContent>
          <TabsContent value="ambiental">
            <AmbientalTab contratoId={c.id} />
          </TabsContent>
          <TabsContent value="logistica">
            <LogisticaTab contratoId={c.id} />
          </TabsContent>
          <TabsContent value="financeiro">
            <FinanceiroTab contratoId={c.id} />
          </TabsContent>
          <TabsContent value="historico">
            <HistoricoTab contratoId={c.id} />
          </TabsContent>
          {canSeeAuditoria && (
            <TabsContent value="auditoria">
              <AuditoriaTab contratoId={c.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
