import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { BankAccountNotFoundError, BankNotFoundError, TreasuryNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class TreasuryDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const notFound =
      exception instanceof TreasuryNotFoundError ||
      exception instanceof BankNotFoundError ||
      exception instanceof BankAccountNotFoundError;
    res.status(notFound ? 404 : 400).json({ error: exception.message });
  }
}
