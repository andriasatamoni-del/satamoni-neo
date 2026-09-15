import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { SupplierNotFoundError, PurchaseOrderNotFoundError, GoodsReceiptNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class ProcurementDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof SupplierNotFoundError ||
      exception instanceof PurchaseOrderNotFoundError ||
      exception instanceof GoodsReceiptNotFoundError
        ? 404
        : 400;
    res.status(status).json({ error: exception.message });
  }
}
