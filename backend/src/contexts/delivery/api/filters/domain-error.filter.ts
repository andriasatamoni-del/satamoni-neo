import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  DriverNotFoundError,
  DeliveryAssignmentNotFoundError,
  DriverSettlementNotFoundError,
  DriverAttendanceShiftNotFoundError,
} from "../../domain/errors";
import { OrderNotFoundError } from "../../../orders/domain/errors";

@Catch(DomainError)
export class DeliveryDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof DriverNotFoundError ||
      exception instanceof DeliveryAssignmentNotFoundError ||
      exception instanceof DriverSettlementNotFoundError ||
      exception instanceof DriverAttendanceShiftNotFoundError ||
      exception instanceof OrderNotFoundError
        ? 404
        : 400;
    res.status(status).json({ error: exception.message });
  }
}
