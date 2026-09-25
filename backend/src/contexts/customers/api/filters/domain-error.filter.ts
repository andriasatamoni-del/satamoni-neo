import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import {
  CustomerAccountAlreadyExistsError,
  CustomerNotFoundError,
  DomainError,
  InvalidCustomerCredentialsError,
} from "../../domain/errors";

@Catch(DomainError)
export class CustomersDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof InvalidCustomerCredentialsError
        ? 401
        : exception instanceof CustomerNotFoundError
          ? 404
          : exception instanceof CustomerAccountAlreadyExistsError
            ? 409
            : 400;
    res.status(status).json({ error: exception.message });
  }
}
