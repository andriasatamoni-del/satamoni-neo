import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { PurchaseNotFoundError, DuplicatePurchaseReferenceError } from "../../domain/errors";

@Catch(DomainError)
export class PurchasesDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof PurchaseNotFoundError ? 404 : exception instanceof DuplicatePurchaseReferenceError ? 409 : 400;
    res.status(status).json({ error: exception.message });
  }
}
