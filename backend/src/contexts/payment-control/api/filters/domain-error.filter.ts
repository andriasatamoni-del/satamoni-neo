import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  PaymentMethodNotFoundError,
  PaymentNotFoundError,
  AdjustmentRequestNotFoundError,
  ReconciliationRecordNotFoundError,
  ImportBatchNotFoundError,
} from "../../domain/errors";

@Catch(DomainError)
export class PaymentControlDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const isNotFound =
      exception instanceof PaymentMethodNotFoundError ||
      exception instanceof PaymentNotFoundError ||
      exception instanceof AdjustmentRequestNotFoundError ||
      exception instanceof ReconciliationRecordNotFoundError ||
      exception instanceof ImportBatchNotFoundError;
    res.status(isNotFound ? 404 : 400).json({ error: exception.message });
  }
}
