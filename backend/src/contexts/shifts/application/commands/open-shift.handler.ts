import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { BranchRequiredError, ShiftAlreadyActiveError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";

export interface OpenShiftCommand {
  branchId: string | null | undefined;
  userId: string;
  openingCash: number;
  openingNotes?: string | null;
}

@Injectable()
export class OpenShiftHandler {
  constructor(@Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort) {}

  async execute(command: OpenShiftCommand): Promise<CashierShift> {
    if (!command.branchId) throw new BranchRequiredError();

    const existing = await this.shifts.findActiveByUserId(command.userId);
    if (existing) throw new ShiftAlreadyActiveError();

    const shift = CashierShift.register({ ...command, branchId: command.branchId });
    await this.shifts.save(shift);
    return shift;
  }
}
