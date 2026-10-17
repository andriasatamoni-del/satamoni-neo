import type { CashierShift } from "../cashier-shift.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the shifts list. `from`/`to` are inclusive Cairo business dates on opened_at.
export interface ShiftListFilter {
  branchId: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface CashierShiftRepositoryPort {
  save(shift: CashierShift): Promise<void>;
  findById(id: string): Promise<CashierShift | null>;
  findActiveByUserId(userId: string): Promise<CashierShift | null>;
  list(filter: ShiftListFilter, page: PageRequest): Promise<{ shifts: CashierShift[]; total: number }>;
}

export const CASHIER_SHIFT_REPOSITORY = Symbol("CASHIER_SHIFT_REPOSITORY");
