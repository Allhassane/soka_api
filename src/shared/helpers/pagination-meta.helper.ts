import {
  PaginateMeta,
  PaginationMetaParameters,
} from '../interfaces/paginate-meta.interface';

export function buildPaginationMeta({
  total,
  page,
  perPage,
}: PaginationMetaParameters): Omit<PaginateMeta, 'page'> {
  const lastPage = Math.ceil(total / perPage);
  return {
    total,
    currentPage: page,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < lastPage ? page + 1 : null,
    lastPage,
    perPage,
  };
}

export interface PaginatedResult<T> {
  data: T[];
  meta: Omit<PaginateMeta, 'page'>;
}

export function isPaginatedResult<T>(
  value: unknown,
): value is PaginatedResult<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as PaginatedResult<T>;
  return Array.isArray(candidate.data) && typeof candidate.meta === 'object';
}
