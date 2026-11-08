import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { recordDenied } from "../audit/audit-denial";
import { DomainError, statusOf } from "../domain/domain-error";
import { TabularImportRejectedError } from "./tabular-errors";

@Catch(DomainError)
export class TabularErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = statusOf(exception, 400);
    if (status === 403) void recordDenied(host, 403, exception.name);
    const body = exception instanceof TabularImportRejectedError ? { error: exception.message, ...exception.report } : { error: exception.message };
    res.status(status).json(body);
  }
}
