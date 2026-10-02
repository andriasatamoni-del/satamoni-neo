import { ArgumentsHost, Catch, ForbiddenException, HttpException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Response } from "express";
import { recordDenied } from "../audit/audit-denial";
import { pgErrorCode } from "../database/transaction-context";

// Phase 3.1: last-resort filter (controller-level DomainError filters still take precedence).
//  * Unexpected PostgreSQL constraint/data errors become meaningful 4xx answers instead of "500 Internal server error":
//      23505 unique violation        -> 409 (duplicate / already processed / concurrent request lost the race)
//      22P02 / 22003 / 22007 / 22008 -> 400 (malformed UUID, number out of range, invalid date ...)
//      23503 foreign key violation   -> 400 (referenced record does not exist / is still referenced)
//      23502 / 23514                 -> 400 (missing value / check constraint)
//      40P01 / 40001                 -> 409 (deadlock / serialization failure after retries - safe to retry)
//      P0001 raise_exception         -> 409 (business-rule trigger, e.g. closed accounting period; message is the rule)
//  * Every 403 is recorded as a DENIED audit row (who tried what).
@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof ForbiddenException) void recordDenied(host, 403, "forbidden");

    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }

    const code = pgErrorCode(exception);
    const mapped = code ? this.mapPgError(code, exception as { message?: string; constraint?: string }) : null;
    if (mapped) {
      host.switchToHttp().getResponse<Response>().status(mapped.status).json({ error: mapped.message, code });
      return;
    }

    this.logger.error(exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception));
    super.catch(exception, host);
  }

  private mapPgError(code: string, err: { message?: string; constraint?: string }): { status: number; message: string } | null {
    switch (code) {
      case "23505":
        return { status: 409, message: "العملية دي اتسجّلت قبل كده أو فيه تعارض مع عملية متزامنة - راجع الحالة الحالية قبل ما تعيد المحاولة" };
      case "22P02":
      case "22003":
      case "22007":
      case "22008":
      case "22001":
        return { status: 400, message: "قيمة غير صالحة في الطلب (معرّف أو رقم أو تاريخ بصيغة غلط)" };
      case "23503":
        return { status: 400, message: "مرجع غير موجود أو مستخدم في سجلات تانية" };
      case "23502":
      case "23514":
        return { status: 400, message: "بيانات ناقصة أو مخالفة لقواعد النظام" };
      case "40P01":
      case "40001":
        return { status: 409, message: "العملية اتعارضت مع عملية متزامنة - أعد المحاولة" };
      case "P0001":
        return { status: 409, message: err.message ?? "العملية مخالفة لقاعدة عمل" };
      default:
        return null;
    }
  }
}
