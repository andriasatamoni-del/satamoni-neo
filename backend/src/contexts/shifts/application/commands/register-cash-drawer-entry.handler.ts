import { Inject, Injectable } from "@nestjs/common";
import { CashDrawerEntry } from "../../domain/cash-drawer-entry.aggregate";
import { ShiftNotActiveError, ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { CASH_DRAWER_ENTRY_REPOSITORY, type CashDrawerEntryRepositoryPort } from "../../domain/ports/cash-drawer-entry-repository.port";
import { CashDrawerEntryRegisteredEvent } from "../../domain/events/cash-drawer-entry-registered.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface RegisterCashDrawerEntryCommand {
  shiftId: string;
  entryType: string;
  amount: number;
  label: string;
  notes?: string | null;
  createdBy: string;
}

@Injectable()
export class RegisterCashDrawerEntryHandler {
  constructor(
    @Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort,
    @Inject(CASH_DRAWER_ENTRY_REPOSITORY) private readonly entries: CashDrawerEntryRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterCashDrawerEntryCommand): Promise<CashDrawerEntry> {
    const shift = await this.shifts.findById(command.shiftId);
    if (!shift) throw new ShiftNotFoundError();
    if (shift.status !== "ACTIVE") throw new ShiftNotActiveError();

    const entry = CashDrawerEntry.register({
      shiftId: shift.id,
      branchId: shift.branchId,
      userId: shift.userId,
      entryType: command.entryType,
      amount: command.amount,
      label: command.label,
      notes: command.notes,
      createdBy: command.createdBy,
    });
    await this.entries.save(entry);

    await this.eventBus.publish(
      new CashDrawerEntryRegisteredEvent(entry.id, entry.shiftId, entry.branchId, entry.entryType, entry.amount, entry.label, entry.createdBy)
    );
    return entry;
  }
}
