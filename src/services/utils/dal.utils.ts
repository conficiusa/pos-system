// ─── Pagination helper ────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

export function paginate(page: number, perPage: number) {
  return { limit: perPage, offset: (page - 1) * perPage };
}
