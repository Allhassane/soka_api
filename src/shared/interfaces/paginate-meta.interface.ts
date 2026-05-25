export interface PaginationMetaParameters {
  total: number;
  page: number;
  perPage: number;
}

export interface PaginateMeta extends PaginationMetaParameters {
  currentPage: number;
  prevPage: number | null;
  nextPage: number | null;
  lastPage: number;
}
