const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Lê `page`/`pageSize` da querystring (sempre strings) com defaults e teto sãos. */
export function parsePagination(query: { page?: string; pageSize?: string }): PaginationParams {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(query.pageSize)) || DEFAULT_PAGE_SIZE));

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
