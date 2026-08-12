import { useState } from "react";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REFERENCE_OPTIONS_PAGE_SIZE, useStatusContrato } from "@/features/referencias/hooks";
import { useHistoricoStatus } from "./hooks";

function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Aba "Histórico" — mudanças de status do contrato (`historico_status_contrato`),
 * mais recente primeiro (a API já ordena por `dataAlteracao desc`). Visível
 * a qualquer perfil autenticado, sem checagem de permissão (mesmo padrão de
 * leitura do resto do sistema).
 */
export function HistoricoTab({ contratoId }: { contratoId: string }) {
  const [page, setPage] = useState(1);
  const query = useHistoricoStatus(contratoId, page);
  // GET /contratos/:id/historico-status não populariza statusAnterior/statusNovo
  // (só ids) — mesmo lookup id -> nome já usado em contratos-list-page.tsx.
  const statusQuery = useStatusContrato({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const statusNomePorId = new Map((statusQuery.data?.data ?? []).map((s) => [s.id, s.nomeStatus]));

  const rows = query.data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {query.isError && <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>}

        {!query.isLoading && !query.isError && (
          <>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma mudança de status registrada ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Status anterior</TableHead>
                    <TableHead>Status novo</TableHead>
                    <TableHead>Alterado por</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDataHora(h.dataAlteracao)}</TableCell>
                      <TableCell>
                        {h.statusAnteriorId ? (statusNomePorId.get(h.statusAnteriorId) ?? h.statusAnteriorId) : "—"}
                      </TableCell>
                      <TableCell>{statusNomePorId.get(h.statusNovoId) ?? h.statusNovoId}</TableCell>
                      <TableCell>{h.alteradoPor?.nomeCompleto ?? "—"}</TableCell>
                      <TableCell>{h.observacao ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {query.data && rows.length > 0 && <PaginationControls meta={query.data.meta} onPageChange={setPage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
