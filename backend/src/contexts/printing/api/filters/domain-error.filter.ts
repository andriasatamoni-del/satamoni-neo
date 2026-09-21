import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  PrinterNotFoundError,
  KitchenStationNotFoundError,
  PrintJobNotFoundError,
  PrintJobNotPendingError,
  PrintJobNotPrintingError,
  PrintJobNotFailedError,
  DuplicateKitchenStationNameError,
} from "../../domain/errors";
import { MenuCategoryNotFoundError, MenuItemNotFoundError } from "../../../catalog/domain/errors";

const NOT_FOUND = [PrinterNotFoundError, KitchenStationNotFoundError, PrintJobNotFoundError, MenuCategoryNotFoundError, MenuItemNotFoundError];
const CONFLICT = [PrintJobNotPendingError, PrintJobNotPrintingError, PrintJobNotFailedError, DuplicateKitchenStationNameError];

@Catch(DomainError)
export class PrintingDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = NOT_FOUND.some((E) => exception instanceof E) ? 404 : CONFLICT.some((E) => exception instanceof E) ? 409 : 400;
    res.status(status).json({ error: exception.message });
  }
}
