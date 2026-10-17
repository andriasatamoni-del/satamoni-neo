import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort, type ShiftListFilter } from "../../domain/ports/cashier-shift-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListShiftsHandler {
  constructor(@Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort) {}

  async execute(filter: ShiftListFilter, page: PageRequest): Promise<{ shifts: CashierShift[]; total: number }> {
    return this.shifts.list(filter, page);
  }

  async currentForUser(userId: string): Promise<CashierShift | null> {
    return this.shifts.findActiveByUserId(userId);
  }
}
