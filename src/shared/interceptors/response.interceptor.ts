import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SUCCESS_MESSAGE_KEY } from '../decorators/success-message.decorator';
import { ApiResponse } from '../interfaces/api-response.interface';
import { isPaginatedResult } from '../helpers/pagination-meta.helper';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const message = this.reflector.get<string>(
      SUCCESS_MESSAGE_KEY,
      context.getHandler(),
    ) as string | undefined;

    return next.handle().pipe(
      map((data: T): ApiResponse<T> => {
        if (isPaginatedResult(data)) {
          return {
            success: true,
            message: message || 'Request successful',
            data: data.data as T,
            meta: data.meta,
          };
        }

        return {
          success: true,
          message: message || 'Request successful',
          data,
        };
      }),
    );
  }
}
