import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { InsufficientLoyaltyPointsError, LoyaltyRewardNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class LoyaltyDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof LoyaltyRewardNotFoundError ? 404 : exception instanceof InsufficientLoyaltyPointsError ? 409 : 400;
    res.status(status).json({ error: exception.message });
  }
}
