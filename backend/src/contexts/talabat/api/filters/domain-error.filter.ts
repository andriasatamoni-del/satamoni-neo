import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import {
  DomainError,
  InvalidWebhookSignatureError,
  TalabatOrderNotFoundError,
  IntegrationErrorNotFoundError,
} from "../../domain/errors";

@Catch(DomainError)
export class TalabatDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof InvalidWebhookSignatureError
        ? 401
        : exception instanceof TalabatOrderNotFoundError || exception instanceof IntegrationErrorNotFoundError
          ? 404
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
