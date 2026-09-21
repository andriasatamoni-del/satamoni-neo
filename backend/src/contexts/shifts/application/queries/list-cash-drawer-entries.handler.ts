import { Inject, Injectable } from "@nestjs/common";
import type { CashDrawerEntry } from "../../domain/cash-drawer-entry.aggregate";
import { ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { CASH_DRAWER_ENTRY_REPOSITORY, type CashDrawerEntryRepositoryPort } from "../../domain/ports/cash-drawer-entry-repository.port";

@Injectable()
export class ListCashDrawerEntriesHandler {
  constructor(
    @Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort,
    @Inject(CASH_DRAWER_ENTRY_REPOSITORY) private readonly entries: CashDrawerEntryRepositoryPort
  ) {}

  async execute(shiftId: string): Promise<CashDrawerEntry[]> {
    const shift = await this.shifts.findById(shiftId);
    if (!shift) throw new ShiftNotFoundError();
    return this.entries.listByShift(shiftId);
  }
}
