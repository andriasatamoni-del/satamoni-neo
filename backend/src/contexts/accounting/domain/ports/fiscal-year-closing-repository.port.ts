import type { FiscalYearClosing } from "../fiscal-year-closing.aggregate";

export interface FiscalYearClosingRepositoryPort {
  save(closing: FiscalYearClosing): Promise<void>;
  findByYear(year: number): Promise<FiscalYearClosing | null>;
  list(): Promise<FiscalYearClosing[]>;
}

export const FISCAL_YEAR_CLOSING_REPOSITORY = Symbol("FISCAL_YEAR_CLOSING_REPOSITORY");
