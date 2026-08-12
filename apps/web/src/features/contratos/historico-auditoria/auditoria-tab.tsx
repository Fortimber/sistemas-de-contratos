import { useState } from "react";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditoria } from "./hooks";
import type { AcaoAuditoria } from "./types";

const ACAO_LABEL: Record<AcaoAuditoria, string> = {
  Criacao: "Criação",
  Edicao: "Edição",
  Exclusao: "Exclusão",
};

function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Aba "Auditoria" — trilha campo a campo de `auditoria_contratos`, mais
 * recente primeiro (a API já ordena por `dataHora desc`). Só é montada
 * quando `canViewAuditoria` (lib/permissions.ts) já deu `true` — quem
 * chama isso é `contrato-detail-page.tsx`, que nem renderiza a aba (nem o
 * `TabsTrigger`, nem este componente) pra quem não é Administrador. Não
 * existe fallback de "sem permissão" aqui de propósito: se este componente
 * chegou a montar, a permissão já foi conferida um nível acima.
 */
export function AuditoriaTab({ contratoId }: { contratoId: string }) {
  const [page, setPage] = useState(1);
  const query = useAuditoria(contratoId, page);

  const rows = query.data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoria</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {query.isError && <p className="text-sm text-destructive">Não foi possível carregar a auditoria.</p>}

        {!query.isLoading && !query.isError && (
          <>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro de auditoria ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Campo alterado</TableHead>
                    <TableHead>Valor anterior</TableHead>
                    <TableHead>Valor novo</TableHead>
                    <TableHead>Alterado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatDataHora(a.dataHora)}</TableCell>
                      <TableCell>{ACAO_LABEL[a.acao]}</TableCell>
                      <TableCell>{a.campoAlterado ?? "—"}</TableCell>
                      <TableCell>{a.valorAnterior ?? "—"}</TableCell>
                      <TableCell>{a.valorNovo ?? "—"}</TableCell>
                      <TableCell>{a.usuario?.nomeCompleto ?? "—"}</TableCell>
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
