import { Inject, Injectable } from "@nestjs/common";
import { FiscalYearClosing } from "../../domain/fiscal-year-closing.aggregate";
import {
  FISCAL_YEAR_CLOSING_REPOSITORY,
  type FiscalYearClosingRepositoryPort,
} from "../../domain/ports/fiscal-year-closing-repository.port";

@Injectable()
export class ListFiscalYearClosingsHandler {
  constructor(@Inject(FISCAL_YEAR_CLOSING_REPOSITORY) private readonly closings: FiscalYearClosingRepositoryPort) {}

  execute(): Promise<FiscalYearClosing[]> {
    return this.closings.list();
  }
}
