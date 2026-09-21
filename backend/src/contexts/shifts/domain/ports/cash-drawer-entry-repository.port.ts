import type { CashDrawerEntry } from "../cash-drawer-entry.aggregate";

export interface CashDrawerEntryRepositoryPort {
  save(entry: CashDrawerEntry): Promise<void>;
  listByShift(shiftId: string): Promise<CashDrawerEntry[]>;
}

export const CASH_DRAWER_ENTRY_REPOSITORY = Symbol("CASH_DRAWER_ENTRY_REPOSITORY");
