import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  MenuCategoryNotFoundError,
  MenuItemNotFoundError,
  ModifierNotFoundError,
  RecipeNotFoundError,
  RecipeVersionNotFoundError,
  VariantNotFoundError,
} from "../../domain/errors";

@Catch(DomainError)
export class CatalogDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof MenuCategoryNotFoundError ||
      exception instanceof MenuItemNotFoundError ||
      exception instanceof VariantNotFoundError ||
      exception instanceof ModifierNotFoundError ||
      exception instanceof RecipeNotFoundError ||
      exception instanceof RecipeVersionNotFoundError
        ? 404
        : 400;
    res.status(status).json({ error: exception.message });
  }
}
