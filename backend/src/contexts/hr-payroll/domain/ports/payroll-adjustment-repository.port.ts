import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { PayrollAdjustment } from "../payroll-adjustment.aggregate";

export interface PayrollAdjustmentRepositoryPort {
  save(adjustment: PayrollAdjustment): Promise<void>;
  findById(id: string): Promise<PayrollAdjustment | null>;
  list(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }): Promise<PayrollAdjustment[]>;
  listPage(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: PayrollAdjustment[]; total: number }>;
  /** ACTIVE adjustments not yet consumed by any payroll run, entry date inside the given month (Cairo calendar month). */
  listUnlinkedActiveForMonth(year: number, month: number, employeeIds?: string[]): Promise<PayrollAdjustment[]>;
  linkToRun(adjustmentIds: string[], payrollRunId: string): Promise<void>;
  unlinkFromRun(payrollRunId: string): Promise<void>;
}

export const PAYROLL_ADJUSTMENT_REPOSITORY = Symbol("PAYROLL_ADJUSTMENT_REPOSITORY");
