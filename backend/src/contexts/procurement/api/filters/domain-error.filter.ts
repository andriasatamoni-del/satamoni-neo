import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  SupplierNotFoundError,
  PurchaseOrderNotFoundError,
  GoodsReceiptNotFoundError,
  SupplierInvoiceNotFoundError,
  PurchaseRequestNotFoundError,
  PurchaseReturnNotFoundError,
  DuplicateGoodsReceiptReferenceError,
} from "../../domain/errors";
import { TreasuryNotFoundError } from "../../../treasury/domain/errors";
import { recordDenied } from "../../../../shared/audit/audit-denial";

@Catch(DomainError)
export class ProcurementDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Phase 3.1: errors that declare their own status (conflict 409 / forbidden 403)
    if (exception.httpStatus) {
      if (exception.httpStatus === 403) void recordDenied(host, 403, exception.name);
      res.status(exception.httpStatus).json({ error: exception.message });
      return;
    }
    const status =
      exception instanceof SupplierNotFoundError ||
      exception instanceof PurchaseOrderNotFoundError ||
      exception instanceof GoodsReceiptNotFoundError ||
      exception instanceof SupplierInvoiceNotFoundError ||
      exception instanceof PurchaseRequestNotFoundError ||
      exception instanceof PurchaseReturnNotFoundError ||
      exception instanceof TreasuryNotFoundError
        ? 404
        : exception instanceof DuplicateGoodsReceiptReferenceError
          ? 409
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
