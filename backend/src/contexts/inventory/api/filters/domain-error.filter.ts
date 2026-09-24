import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  InventoryItemNotFoundError,
  InsufficientStockError,
  StocktakeNotFoundError,
  TransferRequestNotFoundError,
} from "../../domain/errors";

@Catch(DomainError)
export class InventoryDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof InventoryItemNotFoundError ||
      exception instanceof StocktakeNotFoundError ||
      exception instanceof TransferRequestNotFoundError
        ? 404
        : exception instanceof InsufficientStockError
          ? 409
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
