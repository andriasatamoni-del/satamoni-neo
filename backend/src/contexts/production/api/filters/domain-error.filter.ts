import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import { RecipeNotFoundError } from "../../../catalog/domain/errors";

@Catch(DomainError)
export class ProductionDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const isNotFound = exception instanceof ConversionOrderNotFoundError || exception instanceof RecipeNotFoundError;
    res.status(isNotFound ? 404 : 400).json({ error: exception.message });
  }
}
