import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { BranchDayAlreadyClosedError, BranchDayNotClosableError } from "../../domain/errors";

@Catch(DomainError)
export class BranchDayDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof BranchDayAlreadyClosedError) {
      res.status(409).json({ error: exception.message });
      return;
    }
    if (exception instanceof BranchDayNotClosableError) {
      res.status(400).json({ error: exception.message, redItems: exception.redItems });
      return;
    }
    res.status(400).json({ error: exception.message });
  }
}
