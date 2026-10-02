import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import {
  CustomerAccountAlreadyExistsError,
  CustomerAddressNotFoundError,
  CustomerNotFoundError,
  DomainError,
  EmailAlreadyUsedError,
  InvalidCustomerCredentialsError,
} from "../../domain/errors";
import { recordDenied } from "../../../../shared/audit/audit-denial";

@Catch(DomainError)
export class CustomersDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Phase 3.1: errors that declare their own status (conflict 409 / forbidden 403)
    if (exception.httpStatus) {
      if (exception.httpStatus === 403) void recordDenied(host, 403, exception.name);
      res.status(exception.httpStatus).json({ error: exception.message });
      return;
    }
    const status =
      exception instanceof InvalidCustomerCredentialsError
        ? 401
        : exception instanceof CustomerNotFoundError || exception instanceof CustomerAddressNotFoundError
          ? 404
          : exception instanceof CustomerAccountAlreadyExistsError || exception instanceof EmailAlreadyUsedError
            ? 409
            : 400;
    res.status(status).json({ error: exception.message });
  }
}
