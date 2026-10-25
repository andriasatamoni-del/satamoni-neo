import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { FiscalYearClosing } from "../fiscal-year-closing.aggregate";

export interface FiscalYearClosingRepositoryPort {
  save(closing: FiscalYearClosing): Promise<void>;
  findByYear(year: number): Promise<FiscalYearClosing | null>;
  list(): Promise<FiscalYearClosing[]>;
  listPage(page?: PageRequest): Promise<{ rows: FiscalYearClosing[]; total: number }>;
}

export const FISCAL_YEAR_CLOSING_REPOSITORY = Symbol("FISCAL_YEAR_CLOSING_REPOSITORY");
