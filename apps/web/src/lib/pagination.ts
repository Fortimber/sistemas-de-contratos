/** Espelha PaginationMeta da API (apps/api/src/lib/pagination.ts). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Espelha o formato { data, meta } que toda rota de listagem paginada da API devolve. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}
