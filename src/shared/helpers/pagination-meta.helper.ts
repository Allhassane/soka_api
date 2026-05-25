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
