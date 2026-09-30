import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  CustomerBlockedForOnlineOrderError,
  OnlineOrderingClosedError,
  OnlineOrderItemUnavailableError,
  OnlineOrderNotFoundError,
} from "../../domain/errors";
import { InsufficientLoyaltyPointsError, LoyaltyRewardNotFoundError } from "../../../loyalty/domain/errors";

@Catch(DomainError)
export class StorefrontDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof OnlineOrderNotFoundError || exception instanceof LoyaltyRewardNotFoundError
        ? 404
        : exception instanceof CustomerBlockedForOnlineOrderError
          ? 403
          : exception instanceof OnlineOrderingClosedError
            ? 503
            : exception instanceof OnlineOrderItemUnavailableError || exception instanceof InsufficientLoyaltyPointsError
              ? 409
              : 400;
    res.status(status).json({ error: exception.message });
  }
}
