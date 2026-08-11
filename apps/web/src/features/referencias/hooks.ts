import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/pagination";
import type { Especie, Produto, Importador, Representante, StatusContrato } from "./types";

interface ListParams {
  page?: number;
  pageSize?: number;
}

/** pageSize alto o bastante pra tratar essas tabelas de referência como "cabe tudo numa página" ao alimentar um <Select> — são listas de apoio, não esperadas para crescer além disso. Mesmo teto que a API aceita (MAX_PAGE_SIZE). */
export const REFERENCE_OPTIONS_PAGE_SIZE = 100;

function buildQuery({ page = 1, pageSize = 20 }: ListParams): string {
  return `?page=${page}&pageSize=${pageSize}`;
}

export function useEspecies(params: ListParams = {}) {
  return useQuery({
    queryKey: ["especies", params],
    queryFn: () => api.get<Paginated<Especie>>(`/especies${buildQuery(params)}`),
  });
}

export function useProdutos(params: ListParams = {}) {
  return useQuery({
    queryKey: ["produtos", params],
    queryFn: () => api.get<Paginated<Produto>>(`/produtos${buildQuery(params)}`),
  });
}

export function useImportadores(params: ListParams = {}) {
  return useQuery({
    queryKey: ["importadores", params],
    queryFn: () => api.get<Paginated<Importador>>(`/importadores${buildQuery(params)}`),
  });
}

export function useRepresentantes(params: ListParams = {}) {
  return useQuery({
    queryKey: ["representantes", params],
    queryFn: () => api.get<Paginated<Representante>>(`/representantes${buildQuery(params)}`),
  });
}

export function useStatusContrato(params: ListParams = {}) {
  return useQuery({
    queryKey: ["status-contrato", params],
    queryFn: () => api.get<Paginated<StatusContrato>>(`/status-contrato${buildQuery(params)}`),
  });
}
