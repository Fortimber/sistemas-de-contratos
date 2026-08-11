import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { REFERENCE_OPTIONS_PAGE_SIZE, useImportadores, useStatusContrato } from "@/features/referencias/hooks";
import { useAuth } from "@/lib/auth-context";
import { canWriteReferences } from "@/lib/permissions";
import { useContratos } from "./hooks";

/** Sentinela dos <Select> de filtro (Radix Select não aceita value="") — significa "todos". */
const TODOS = "__todos__";

function formatValor(valor: string, moeda: string): string {
  return `${moeda} ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ContratosListPage() {
  const { user } = useAuth();
  const canWrite = canWriteReferences(user?.perfilAcesso);
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const statusId = searchParams.get("statusId") ?? undefined;
  const importadorId = searchParams.get("importadorId") ?? undefined;

  const contratosQuery = useContratos({ page, statusId, importadorId });
  // Mesmas listas de referência alimentam os filtros E o lookup id -> nome
  // nas colunas da tabela — GET /contratos (lista) não inclui relações
  // populadas (ver ContratoListItem em types.ts), só ids de FK.
  const statusQuery = useStatusContrato({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const importadoresQuery = useImportadores({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });

  const statusList = statusQuery.data?.data ?? [];
  const importadores = importadoresQuery.data?.data ?? [];
  const statusNomePorId = new Map(statusList.map((s) => [s.id, s.nomeStatus]));
  const importadorNomePorId = new Map(importadores.map((i) => [i.id, i.nomeRazaoSocial]));

  function updateFilter(key: "statusId" | "importadorId", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === TODOS) next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams({});
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  }

  const rows = contratosQuery.data?.data ?? [];
  const temFiltro = !!statusId || !!importadorId;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground">Contratos de exportação cadastrados.</p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link to="/contratos/novo">Novo contrato</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusId ?? TODOS} onValueChange={(v) => updateFilter("statusId", v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {statusList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nomeStatus}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Importador</label>
            <Select value={importadorId ?? TODOS} onValueChange={(v) => updateFilter("importadorId", v)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {importadores.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nomeRazaoSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {temFiltro && (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {contratosQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {contratosQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar os contratos.</p>}

          {!contratosQuery.isLoading && !contratosQuery.isError && (
            <>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {temFiltro ? "Nenhum contrato encontrado com esse filtro." : "Nenhum contrato cadastrado ainda."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Importador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor total</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.numeroContrato}</TableCell>
                        <TableCell>{importadorNomePorId.get(c.importadorId) ?? c.importadorId}</TableCell>
                        <TableCell>{statusNomePorId.get(c.statusId) ?? c.statusId}</TableCell>
                        <TableCell>{c.tipoContrato}</TableCell>
                        <TableCell>{new Date(c.dataContrato).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableCell>
                        <TableCell>{formatValor(c.valorTotalUsd, c.moedaValorTotal)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/contratos/${c.id}`}>Ver</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {contratosQuery.data && rows.length > 0 && (
                <PaginationControls meta={contratosQuery.data.meta} onPageChange={setPage} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
