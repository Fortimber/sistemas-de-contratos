import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/pagination";
import type { Contrato, ContratoListItem } from "./types";

export interface ContratoListFilters {
  page: number;
  statusId?: string;
  importadorId?: string;
}

export function useContratos(filters: ContratoListFilters) {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("pageSize", "20");
  if (filters.statusId) params.set("statusId", filters.statusId);
  if (filters.importadorId) params.set("importadorId", filters.importadorId);

  return useQuery({
    queryKey: ["contratos", filters],
    queryFn: () => api.get<Paginated<ContratoListItem>>(`/contratos?${params.toString()}`),
  });
}

export function useContrato(id: string | undefined) {
  return useQuery({
    queryKey: ["contratos", "detail", id],
    queryFn: () => api.get<Contrato>(`/contratos/${id}`),
    enabled: !!id,
  });
}
