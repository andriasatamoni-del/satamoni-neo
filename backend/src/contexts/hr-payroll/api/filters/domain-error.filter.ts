import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { EmployeeNotFoundError, PayrollRunNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class HrPayrollDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const isNotFound = exception instanceof EmployeeNotFoundError || exception instanceof PayrollRunNotFoundError;
    res.status(isNotFound ? 404 : 400).json({ error: exception.message });
  }
}
