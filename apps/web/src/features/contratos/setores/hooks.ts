import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { DetalhesAmbiental, DetalhesFinanceiro, DetalhesLogistica, DetalhesProducao } from "./types";

export type Setor = "producao" | "ambiental" | "logistica" | "financeiro";

/**
 * GET /contratos/:id/<setor> responde 404 quando o setor ainda não
 * preencheu nada — não é um estado de erro pra essa tela, é o sinal de
 * "mostrar formulário vazio" (ver detalhes-*.routes.ts na API). Por isso
 * este hook intercepta especificamente ApiError(404) e resolve `data: null`
 * em vez de deixar a query cair em `isError` — qualquer outro erro (403,
 * 500, rede) continua propagando normalmente.
 */
function useDetalhesSetor<T>(setor: Setor, contratoId: string | undefined) {
  return useQuery({
    queryKey: ["contratos", "detalhes", setor, contratoId],
    queryFn: async (): Promise<T | null> => {
      try {
        return await api.get<T>(`/contratos/${contratoId}/${setor}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!contratoId,
  });
}

/** PUT /contratos/:id/<setor> é sempre upsert — mesma chamada cria ou atualiza. */
function useSalvarDetalhesSetor<T>(setor: Setor, contratoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put<T>(`/contratos/${contratoId}/${setor}`, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["contratos", "detalhes", setor, contratoId], data);
    },
  });
}

export const useDetalhesProducao = (contratoId: string | undefined) =>
  useDetalhesSetor<DetalhesProducao>("producao", contratoId);
export const useSalvarDetalhesProducao = (contratoId: string) =>
  useSalvarDetalhesSetor<DetalhesProducao>("producao", contratoId);

export const useDetalhesAmbiental = (contratoId: string | undefined) =>
  useDetalhesSetor<DetalhesAmbiental>("ambiental", contratoId);
export const useSalvarDetalhesAmbiental = (contratoId: string) =>
  useSalvarDetalhesSetor<DetalhesAmbiental>("ambiental", contratoId);

export const useDetalhesLogistica = (contratoId: string | undefined) =>
  useDetalhesSetor<DetalhesLogistica>("logistica", contratoId);
export const useSalvarDetalhesLogistica = (contratoId: string) =>
  useSalvarDetalhesSetor<DetalhesLogistica>("logistica", contratoId);

export const useDetalhesFinanceiro = (contratoId: string | undefined) =>
  useDetalhesSetor<DetalhesFinanceiro>("financeiro", contratoId);
export const useSalvarDetalhesFinanceiro = (contratoId: string) =>
  useSalvarDetalhesSetor<DetalhesFinanceiro>("financeiro", contratoId);
