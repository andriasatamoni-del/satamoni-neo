import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { SHIFT_FINANCIALS_READER, type ShiftFinancialsReaderPort } from "../../domain/ports/shift-financials-reader.port";
import { ShiftClosedEvent } from "../../domain/events/shift-closed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { TransactionService } from "../../../../shared/database/transaction-context";

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
    private readonly eventBus: EventBusService,
    private readonly getPosSettings: GetPosSettingsHandler,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1: one transaction per business command - the state change, its side effects and the critical event
  // subscribers (accounting posting) commit or roll back together.
  async execute(command: CloseShiftCommand): Promise<CashierShift> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: CloseShiftCommand): Promise<CashierShift> {
    await this.tx.lockRow("cashier_shifts", command.shiftId); // serialise concurrent identical commands; later ones see the new state and are rejected
    const shift = await this.shifts.findById(command.shiftId);
    if (!shift) throw new ShiftNotFoundError();

    const financials = await this.financialsReader.computeFinancials({
      branchId: shift.branchId,
      userId: shift.userId,
      fromTs: shift.openedAt,
      toTs: new Date(),
    });
    const settings = await this.getPosSettings.execute();

    shift.close({
      actualCash: command.actualCash,
      financials,
      closingNotes: command.closingNotes,
      closedBy: command.closedBy,
      varianceAckThresholdEgp: settings.shiftVarianceAckThresholdEgp,
    });
    await this.shifts.save(shift);

    if (shift.status === "CLOSED") {
      await this.eventBus.publish(new ShiftClosedEvent(shift.id, shift.branchId, shift.cashVariance ?? 0, command.closedBy));
    }
    return shift;
  }
}
