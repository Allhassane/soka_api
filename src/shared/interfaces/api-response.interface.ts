import { PaginateMeta } from './paginate-meta.interface';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: Omit<PaginateMeta, 'page'>;
}
