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
    /**
     * Charge utile d'un refus **exploitable par l'écran**.
     *
     * ⚠️ Ce filtre aplatissait TOUTE exception en `{success, message, data: null, errors}` :
     * un champ posé à côté du message ne survivait pas à la réponse. C'est ce qui a fait
     * disparaître le `retry_after` de « Recevoir mon mot de passe » (le web a dû se rabattre
     * sur une estimation locale, plus longue que la vraie), et ce qui empêchait un refus de
     * transporter le moindre détail utile - un message est lisible, il n'est pas actionnable.
     *
     * Une exception qui veut être traitée passe donc un objet portant `data` :
     *   `throw new ConflictException({ message, code: 'PENDING_ATTEMPT', data: {...} })`
     *
     * Rétro-compatible : **aucune** exception du projet n'était levée avec un objet
     * (vérifié) - sans clé `data`, la réponse reste identique au caractère près.
     */
    let data: unknown = null;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message ?? resObj.error ?? message;
        data = resObj.data ?? null;

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
      data,
      errors: details,
    });
  }
}
