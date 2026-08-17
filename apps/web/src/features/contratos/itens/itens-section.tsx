import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { z } from "zod";
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
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { MOEDAS } from "@/lib/moedas";
import { canWriteReferences } from "@/lib/permissions";
import { useCriarItemContrato, useEditarItemContrato, useItensContrato, useRemoverItemContrato } from "./hooks";
import type { ItemContrato, ItemContratoPayload } from "./types";

/** [nome do campo, rótulo] — números que compartilham a mesma validação "> 0" via superRefine; moeda fica de fora (é um <Select>, não number). */
const NUMERIC_FIELDS: [Exclude<keyof ItemContratoPayload, "moeda">, string][] = [
  ["espessuraMm", "Espessura (mm)"],
  ["larguraMm", "Largura (mm)"],
  ["comprimentoMinMm", "Comprimento mínimo (mm)"],
  ["comprimentoMaxMm", "Comprimento máximo (mm)"],
  ["volumeM3", "Volume (m³)"],
  ["precoPorM3", "Preço por m³"],
];

const DEFAULT_VALUES: FieldValues = {
  espessuraMm: "",
  larguraMm: "",
  comprimentoMinMm: "",
  comprimentoMaxMm: "",
  volumeM3: "",
  precoPorM3: "",
  moeda: "USD",
};

// Espelha createBodySchema/patchBodySchema de POST/PATCH .../itens na API —
// todo campo numérico vive no formulário como string (nunca number), mesma
// decisão de precisão de contrato-form.tsx/sector-form.tsx: a conversão só
// acontece uma vez, em `toPayload`, na string exata que estava no campo.
// `moeda` é obrigatório (z.enum, não z.string().optional()) — mesma lista
// de MOEDAS reusada do <Select> de moedaValorTotal em contrato-form.tsx.
const itemSchema = z
  .object({
    espessuraMm: z.string().min(1),
    larguraMm: z.string().min(1),
    comprimentoMinMm: z.string().min(1),
    comprimentoMaxMm: z.string().min(1),
    volumeM3: z.string().min(1),
    precoPorM3: z.string().min(1),
    moeda: z.enum(MOEDAS, { message: "Selecione a moeda." }),
  })
  .superRefine((values, ctx) => {
    for (const [name, label] of NUMERIC_FIELDS) {
      const n = Number(values[name]);
      if (values[name].trim() === "" || Number.isNaN(n) || n <= 0) {
        ctx.addIssue({ code: "custom", path: [name], message: `${label} precisa ser um número maior que 0.` });
      }
    }
    const min = Number(values.comprimentoMinMm);
    const max = Number(values.comprimentoMaxMm);
    if (!Number.isNaN(min) && !Number.isNaN(max) && max < min) {
      ctx.addIssue({
        code: "custom",
        path: ["comprimentoMaxMm"],
        message: "Comprimento máximo não pode ser menor que o mínimo (podem ser iguais).",
      });
    }
  });

function toFormValues(item: ItemContrato): FieldValues {
  return {
    espessuraMm: item.espessuraMm,
    larguraMm: item.larguraMm,
    comprimentoMinMm: item.comprimentoMinMm,
    comprimentoMaxMm: item.comprimentoMaxMm,
    volumeM3: item.volumeM3,
    precoPorM3: item.precoPorM3,
    moeda: item.moeda,
  };
}

function toPayload(values: FieldValues): ItemContratoPayload {
  return {
    espessuraMm: Number(values.espessuraMm),
    larguraMm: Number(values.larguraMm),
    comprimentoMinMm: Number(values.comprimentoMinMm),
    comprimentoMaxMm: Number(values.comprimentoMaxMm),
    volumeM3: Number(values.volumeM3),
    precoPorM3: Number(values.precoPorM3),
    moeda: values.moeda,
  };
}

function formatComprimento(item: ItemContrato): string {
  return item.comprimentoMinMm === item.comprimentoMaxMm
    ? `${item.comprimentoMinMm} mm`
    : `${item.comprimentoMinMm} – ${item.comprimentoMaxMm} mm`;
}

function formatValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Valor total (preço/m³ × volume) por item, agrupado por moeda — nunca soma
 * itens de moedas diferentes como se fossem a mesma unidade monetária.
 * Quando todos os itens do contrato compartilham a mesma moeda, o
 * resultado tem uma única entrada (efetivamente a soma simples); quando há
 * mais de uma moeda, tem uma entrada por moeda — quem consome isso
 * (`ItensSection` abaixo) não precisa de lógica condicional própria pra
 * decidir entre "somar" ou "separar por moeda", os dois casos são o MESMO
 * objeto, só com tamanhos diferentes.
 */
function valorTotalPorMoeda(itens: ItemContrato[]): Record<string, number> {
  return itens.reduce<Record<string, number>>((acc, item) => {
    const valor = Number(item.precoPorM3) * Number(item.volumeM3);
    acc[item.moeda] = (acc[item.moeda] ?? 0) + valor;
    return acc;
  }, {});
}

/**
 * Seção "Especificações" da tela de detalhe do contrato — múltiplas linhas
 * de item (espessura/largura/comprimento/volume/preço), não uma aba dos
 * módulos setoriais (Fase 3): sem GET/PUT único, é uma listagem própria
 * (GET/POST/PATCH/DELETE em `/contratos/:id/itens[/:itemId]`).
 *
 * `somaVolume` é só informação de apoio pra quem está preenchendo comparar
 * visualmente com o campo "Volume (m³)" do contrato — NUNCA escreve nesse
 * campo nem dispara nenhum PATCH em `/contratos/:id` (decisão explícita:
 * itens não substituem nem somam automaticamente pro volume/valor do
 * contrato, que continuam digitados manualmente).
 */
export function ItensSection({ contratoId }: { contratoId: string }) {
  const { user } = useAuth();
  const canWrite = canWriteReferences(user?.perfilAcesso);

  const itensQuery = useItensContrato(contratoId);
  const criarMutation = useCriarItemContrato(contratoId);
  const editarMutation = useEditarItemContrato(contratoId);
  const removerMutation = useRemoverItemContrato(contratoId);

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingItem, setEditingItem] = useState<ItemContrato | null>(null);
  const [deletingItem, setDeletingItem] = useState<ItemContrato | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const form = useForm<FieldValues>({
    resolver: zodResolver(itemSchema as never) as never,
    defaultValues: DEFAULT_VALUES,
  });

  function openCreate() {
    setFormError(null);
    form.reset(DEFAULT_VALUES);
    setDialogMode("create");
  }

  function openEdit(item: ItemContrato) {
    setFormError(null);
    setEditingItem(item);
    form.reset(toFormValues(item));
    setDialogMode("edit");
  }

  function closeDialog() {
    setDialogMode(null);
    setEditingItem(null);
    setFormError(null);
  }

  function onSubmit(values: FieldValues) {
    const payload = toPayload(values);
    const onError = (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    };

    if (dialogMode === "create") {
      criarMutation.mutate(payload, { onSuccess: closeDialog, onError });
    } else if (dialogMode === "edit" && editingItem) {
      editarMutation.mutate({ itemId: editingItem.id, payload }, { onSuccess: closeDialog, onError });
    }
  }

  const isSaving = criarMutation.isPending || editarMutation.isPending;
  const itens = itensQuery.data ?? [];
  // Volume não depende de moeda — soma direta, sem agrupamento.
  const somaVolume = itens.reduce((acc, item) => acc + Number(item.volumeM3), 0);
  // Valor (preço/m³ × volume) depende de moeda — ver valorTotalPorMoeda
  // acima: 1 entrada = soma simples (moeda única), 2+ entradas = resumo
  // separado por moeda, nunca uma soma cega entre moedas diferentes.
  const valorPorMoeda = valorTotalPorMoeda(itens);
  const moedasComValor = Object.keys(valorPorMoeda);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Especificações</CardTitle>
            <CardDescription>
              Itens do contrato — combinações de dimensão, cada uma com seu próprio volume e preço por m³.
            </CardDescription>
          </div>
          {canWrite && <Button onClick={openCreate}>Adicionar item</Button>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {itensQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {itensQuery.isError && <p className="text-sm text-destructive">Não foi possível carregar os itens.</p>}

        {!itensQuery.isLoading && !itensQuery.isError && itens.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
        )}

        {!itensQuery.isLoading && !itensQuery.isError && itens.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Espessura (mm)</TableHead>
                  <TableHead>Largura (mm)</TableHead>
                  <TableHead>Comprimento</TableHead>
                  <TableHead>Volume (m³)</TableHead>
                  <TableHead>Preço/m³</TableHead>
                  <TableHead>Moeda</TableHead>
                  {canWrite && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.espessuraMm}</TableCell>
                    <TableCell>{item.larguraMm}</TableCell>
                    <TableCell>{formatComprimento(item)}</TableCell>
                    <TableCell>{item.volumeM3}</TableCell>
                    <TableCell>{item.precoPorM3}</TableCell>
                    <TableCell>{item.moeda}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null);
                              setDeletingItem(item);
                            }}
                          >
                            Remover
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Soma dos itens:{" "}
              {somaVolume.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} m³ — não
              substitui o campo Volume do contrato.
              {moedasComValor.length > 0 && (
                <>
                  {" "}
                  Valor total:{" "}
                  {moedasComValor.map((moeda) => `${moeda} ${formatValor(valorPorMoeda[moeda])}`).join(" | ")}.
                </>
              )}
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Adicionar item" : "Editar item"}</DialogTitle>
            <DialogDescription>Espessura, largura, faixa de comprimento, volume e preço por m³.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                {NUMERIC_FIELDS.map(([name, label]) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" disabled={isSaving} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <FormField
                  control={form.control}
                  name="moeda"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moeda</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MOEDAS.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
        open={deletingItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingItem(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover item?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingItem(null)}
              disabled={removerMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removerMutation.isPending}
              onClick={() =>
                deletingItem &&
                removerMutation.mutate(deletingItem.id, {
                  onSuccess: () => {
                    setDeletingItem(null);
                    setDeleteError(null);
                  },
                  onError: (err) => {
                    setDeleteError(err instanceof ApiError ? err.message : "Não foi possível remover. Tente novamente.");
                  },
                })
              }
            >
              {removerMutation.isPending ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
