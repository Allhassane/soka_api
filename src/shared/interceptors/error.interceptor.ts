import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
@Catch()
export class ErrorInterceptor implements ExceptionFilter {
  private readonly logger = new Logger(ErrorInterceptor.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let details: string[] | null = null;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message ?? resObj.error ?? message;

        if (Array.isArray(resObj.message)) {
          details = resObj.message;
          message = resObj.message.join(', ');
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        `[${status}] ${message}`,
        (exception as Error)?.stack || '',
      );
    } else {
      this.logger.warn(`[${status}] ${message}`);
    }

    response.status(status).json({
      success: false,
      message,
      data: null,
      errors: details,
    });
  }
}
