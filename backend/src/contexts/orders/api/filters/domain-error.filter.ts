import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { OrderNotFoundError, InsufficientStockForOrderError } from "../../domain/errors";

@Catch(DomainError)
export class OrdersDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof OrderNotFoundError ? 404 : exception instanceof InsufficientStockForOrderError ? 409 : 400;
    res.status(status).json({ error: exception.message });
  }
}
