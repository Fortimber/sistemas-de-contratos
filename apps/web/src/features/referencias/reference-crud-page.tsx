import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { api, ApiError } from "@/lib/api-client";
import type { PerfilAcesso } from "@/lib/auth-context";
import { useAuth } from "@/lib/auth-context";
import type { Paginated } from "@/lib/pagination";
import { canWriteReferences } from "@/lib/permissions";

export interface ReferenceColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export type ReferenceFormField =
  | { kind: "text"; name: string; label: string; placeholder?: string }
  | { kind: "number"; name: string; label: string; step?: string }
  | { kind: "select"; name: string; label: string; options: { value: string; label: string }[]; placeholder?: string };

/**
 * Configuração de UMA tabela de referência — é isso que cada
 * `*-page.tsx` (especies-page.tsx, produtos-page.tsx, ...) monta e passa
 * pra `ReferenceCrudPage`. `schema`/`defaultValues`/`toFormValues` ficam
 * com tipagem solta (`FieldValues` genérico) de propósito: o objetivo
 * aqui é reuso entre 5 formatos de entidade diferentes, não segurança de
 * tipo por campo — cada page.tsx concreta já valida a forma certa via seu
 * próprio `schema` Zod.
 */
export interface ReferenceCrudConfig<T extends { id: string }> {
  title: string;
  description: string;
  /** Singular, minúsculo — usado em mensagens ("Nova espécie", "Excluir esta espécie?"). */
  entityLabel: string;
  /** Gênero gramatical de `entityLabel`, pra concordância em "Novo"/"Nova" (só "espécie" é feminino entre as 5 entidades hoje). Default "m". */
  genero?: "m" | "f";
  endpoint: string;
  queryKey: string;
  columns: ReferenceColumn<T>[];
  formFields: ReferenceFormField[];
  schema: ZodType<FieldValues>;
  defaultValues: FieldValues;
  toFormValues: (row: T) => FieldValues;
  /**
   * Override de permissão de escrita — default `canWriteReferences`
   * (Administrador+Comercial), usado pelas 5 tabelas de referência
   * originais. `eventos-pagamento-page.tsx` passa `canWriteEventosPagamento`
   * (Administrador+Financeiro) aqui, já que essa tabela nasceu depois com
   * perfis de escrita diferentes das demais.
   */
  canWrite?: (perfilAcesso: PerfilAcesso | undefined) => boolean;
}

const PAGE_SIZE = 20;

/**
 * Componente de CRUD genérico e configurável — uma tela de listagem +
 * criar/editar (dialog) + excluir (dialog de confirmação), reusada pelas 5
 * tabelas de referência (especies, produtos, importadores, representantes,
 * status-contrato). Cada tabela só passa sua própria `ReferenceCrudConfig`
 * (colunas, campos de formulário, schema Zod) — nenhuma tela escrita à mão
 * por entidade.
 */
export function ReferenceCrudPage<T extends { id: string }>({ config }: { config: ReferenceCrudConfig<T> }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = (config.canWrite ?? canWriteReferences)(user?.perfilAcesso);
  const novoLabel = config.genero === "f" ? "Nova" : "Novo";

  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [deletingRow, setDeletingRow] = useState<T | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [config.queryKey, page],
    queryFn: () => api.get<Paginated<T>>(`${config.endpoint}?page=${page}&pageSize=${PAGE_SIZE}`),
  });

  // `as any` no resolver: `config.schema` é um `ZodType<FieldValues>` genérico
  // (qualquer uma das 5 configs de entidade) — o TS não consegue casar as
  // relações de input/output do zodResolver genericamente quando o schema
  // concreto usa `z.coerce` (caso de status-contrato-page.tsx). Sem risco
  // real: cada `*-page.tsx` concreta já valida sua própria forma com um
  // schema Zod fortemente tipado antes de chegar aqui (ver comentário em
  // ReferenceCrudConfig sobre tipagem solta ser intencional neste componente).
  const form = useForm<FieldValues>({
    resolver: zodResolver(config.schema as never) as any,
    defaultValues: config.defaultValues,
  });

  function openCreate() {
    setFormError(null);
    form.reset(config.defaultValues);
    setDialogMode("create");
  }

  function openEdit(row: T) {
    setFormError(null);
    setEditingRow(row);
    form.reset(config.toFormValues(row));
    setDialogMode("edit");
  }

  function closeDialog() {
    setDialogMode(null);
    setEditingRow(null);
    setFormError(null);
  }

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => api.post(config.endpoint, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      closeDialog();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: FieldValues) => api.patch(`${config.endpoint}/${editingRow!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      closeDialog();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (row: T) => api.delete(`${config.endpoint}/${row.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      setDeletingRow(null);
      setDeleteError(null);
    },
    onError: (err) => {
      setDeleteError(err instanceof ApiError ? err.message : "Não foi possível excluir. Tente novamente.");
    },
  });

  function onSubmit(values: FieldValues) {
    if (dialogMode === "create") createMutation.mutate(values);
    else if (dialogMode === "edit") updateMutation.mutate(values);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const rows = listQuery.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canWrite && <Button onClick={openCreate}>{novoLabel} {config.entityLabel}</Button>}
      </div>

      <Card>
        <CardContent className="pt-4">
          {listQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {listQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>}

          {!listQuery.isLoading && !listQuery.isError && (
            <>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum registro cadastrado ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {config.columns.map((col) => (
                        <TableHead key={col.header}>{col.header}</TableHead>
                      ))}
                      {canWrite && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        {config.columns.map((col) => (
                          <TableCell key={col.header}>{col.cell(row)}</TableCell>
                        ))}
                        {canWrite && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeletingRow(row);
                                }}
                              >
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {listQuery.data && rows.length > 0 && (
                <PaginationControls meta={listQuery.data.meta} onPageChange={setPage} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? `${novoLabel} ${config.entityLabel}` : `Editar ${config.entityLabel}`}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? `Preencha os dados ${config.genero === "f" ? "da nova" : "do novo"} ${config.entityLabel}.`
                : `Atualize os dados ${config.genero === "f" ? "da" : "do"} ${config.entityLabel}.`}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              {config.formFields.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: rhfField }) => (
                    <FormItem>
                      <FormLabel>{field.label}</FormLabel>
                      {field.kind === "select" ? (
                        // FormControl precisa envolver SelectTrigger (que renderiza um
                        // <button> de verdade, com forwardRef), não o <Select> raiz — Select.Root
                        // do Radix não é um elemento DOM e não aceita ref, o que reproduziria o
                        // mesmo aviso "Function components cannot be given refs" já corrigido em
                        // Input na Fase 1 (ver components/ui/input.tsx).
                        <Select value={rhfField.value ?? ""} onValueChange={rhfField.onChange} disabled={isSaving}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={field.placeholder ?? "Selecione…"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input
                            type={field.kind === "number" ? "number" : "text"}
                            step={field.kind === "number" ? (field.step ?? "1") : undefined}
                            placeholder={field.kind === "text" ? field.placeholder : undefined}
                            disabled={isSaving}
                            {...rhfField}
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deletingRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRow(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {config.entityLabel}?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingRow(null)} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingRow && deleteMutation.mutate(deletingRow)}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
