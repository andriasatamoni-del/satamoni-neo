import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  ComboNotFoundError,
  DuplicateComboNameError,
  MenuCategoryNotFoundError,
  MenuItemNotFoundError,
  ModifierNotFoundError,
  RecipeNotFoundError,
  RecipeVersionNotFoundError,
  VariantNotFoundError,
} from "../../domain/errors";
import { recordDenied } from "../../../../shared/audit/audit-denial";

@Catch(DomainError)
export class CatalogDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Phase 3.1: errors that declare their own status (conflict 409 / forbidden 403)
    if (exception.httpStatus) {
      if (exception.httpStatus === 403) void recordDenied(host, 403, exception.name);
      res.status(exception.httpStatus).json({ error: exception.message });
      return;
    }
    const status =
      exception instanceof MenuCategoryNotFoundError ||
      exception instanceof MenuItemNotFoundError ||
      exception instanceof VariantNotFoundError ||
      exception instanceof ModifierNotFoundError ||
      exception instanceof RecipeNotFoundError ||
      exception instanceof RecipeVersionNotFoundError ||
      exception instanceof ComboNotFoundError
        ? 404
        : exception instanceof DuplicateComboNameError
          ? 409
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
