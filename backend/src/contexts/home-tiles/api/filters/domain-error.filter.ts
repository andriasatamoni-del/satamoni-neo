import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError, HomeTileNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class HomeTilesDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(exception instanceof HomeTileNotFoundError ? 404 : 400).json({ error: exception.message });
  }
}
