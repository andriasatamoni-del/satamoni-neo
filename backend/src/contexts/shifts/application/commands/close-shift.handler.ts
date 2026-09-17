import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { SHIFT_FINANCIALS_READER, type ShiftFinancialsReaderPort } from "../../domain/ports/shift-financials-reader.port";
import { ShiftClosedEvent } from "../../domain/events/shift-closed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface CloseShiftCommand {
  shiftId: string;
  actualCash: number;
  closingNotes?: string | null;
  closedBy: string;
}

@Injectable()
export class CloseShiftHandler {
  constructor(
    @Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort,
    @Inject(SHIFT_FINANCIALS_READER) private readonly financialsReader: ShiftFinancialsReaderPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: CloseShiftCommand): Promise<CashierShift> {
    const shift = await this.shifts.findById(command.shiftId);
    if (!shift) throw new ShiftNotFoundError();

    const financials = await this.financialsReader.computeFinancials({
      branchId: shift.branchId,
      userId: shift.userId,
      fromTs: shift.openedAt,
      toTs: new Date(),
    });

    shift.close({ actualCash: command.actualCash, financials, closingNotes: command.closingNotes, closedBy: command.closedBy });
    await this.shifts.save(shift);

    if (shift.status === "CLOSED") {
      await this.eventBus.publish(new ShiftClosedEvent(shift.id, shift.branchId, shift.cashVariance ?? 0, command.closedBy));
    }
    return shift;
  }
}
