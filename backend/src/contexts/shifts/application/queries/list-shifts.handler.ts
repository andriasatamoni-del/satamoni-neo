import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";

@Injectable()
export class ListShiftsHandler {
  constructor(@Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort) {}

  async execute(filter: { branchId: string; status?: string }): Promise<CashierShift[]> {
    return this.shifts.list(filter);
  }

  async currentForUser(userId: string): Promise<CashierShift | null> {
    return this.shifts.findActiveByUserId(userId);
  }
}
