import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { OrderNotFoundError, InsufficientStockForOrderError, InvalidRatingTokenError } from "../../domain/errors";
import { recordDenied } from "../../../../shared/audit/audit-denial";

@Catch(DomainError)
export class OrdersDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception.httpStatus) {
      if (exception.httpStatus === 403) void recordDenied(host, 403, exception.name);
      res.status(exception.httpStatus).json({ error: exception.message });
      return;
    }
    const status =
      exception instanceof OrderNotFoundError || exception instanceof InvalidRatingTokenError
        ? 404
        : exception instanceof InsufficientStockForOrderError
          ? 409
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
