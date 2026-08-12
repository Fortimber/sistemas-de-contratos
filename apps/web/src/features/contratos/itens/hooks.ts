import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ItemContrato, ItemContratoPayload } from "./types";

function queryKey(contratoId: string | undefined) {
  return ["contratos", "itens", contratoId];
}

export function useItensContrato(contratoId: string | undefined) {
  return useQuery({
    queryKey: queryKey(contratoId),
    queryFn: () => api.get<ItemContrato[]>(`/contratos/${contratoId}/itens`),
    enabled: !!contratoId,
  });
}

export function useCriarItemContrato(contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ItemContratoPayload) => api.post<ItemContrato>(`/contratos/${contratoId}/itens`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(contratoId) }),
  });
}

export function useEditarItemContrato(contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: Partial<ItemContratoPayload> }) =>
      api.patch<ItemContrato>(`/contratos/${contratoId}/itens/${itemId}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(contratoId) }),
  });
}

export function useRemoverItemContrato(contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.delete(`/contratos/${contratoId}/itens/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(contratoId) }),
  });
}
