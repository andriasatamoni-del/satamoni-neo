import type { CashierShift } from "../cashier-shift.aggregate";

export interface CashierShiftRepositoryPort {
  save(shift: CashierShift): Promise<void>;
  findById(id: string): Promise<CashierShift | null>;
  findActiveByUserId(userId: string): Promise<CashierShift | null>;
  list(filter: { branchId: string; status?: string }): Promise<CashierShift[]>;
}

export const CASHIER_SHIFT_REPOSITORY = Symbol("CASHIER_SHIFT_REPOSITORY");
