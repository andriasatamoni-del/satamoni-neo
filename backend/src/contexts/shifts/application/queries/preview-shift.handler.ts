import { Inject, Injectable } from "@nestjs/common";
import { ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { SHIFT_FINANCIALS_READER, type ShiftFinancialsReaderPort } from "../../domain/ports/shift-financials-reader.port";

@Injectable()
export class PreviewShiftHandler {
  constructor(
    @Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort,
    @Inject(SHIFT_FINANCIALS_READER) private readonly financialsReader: ShiftFinancialsReaderPort
  ) {}

  async execute(shiftId: string) {
    const shift = await this.shifts.findById(shiftId);
    if (!shift) throw new ShiftNotFoundError();

    const financials = await this.financialsReader.computeFinancials({
      branchId: shift.branchId,
      userId: shift.userId,
      fromTs: shift.openedAt,
      toTs: new Date(),
    });
    const expectedCash = shift.openingCash + financials.cashSales;
    return { ...financials, openingCash: shift.openingCash, expectedCash };
  }
}
