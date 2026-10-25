import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { FiscalYearClosing } from "../../domain/fiscal-year-closing.aggregate";
import {
  FISCAL_YEAR_CLOSING_REPOSITORY,
  type FiscalYearClosingRepositoryPort,
} from "../../domain/ports/fiscal-year-closing-repository.port";

@Injectable()
export class ListFiscalYearClosingsHandler {
  constructor(@Inject(FISCAL_YEAR_CLOSING_REPOSITORY) private readonly closings: FiscalYearClosingRepositoryPort) {}

  execute(page?: PageRequest): Promise<{ rows: FiscalYearClosing[]; total: number }> {
    return this.closings.listPage(page);
  }
}
