import { Inject, Injectable } from "@nestjs/common";
import { CashierShift } from "../../domain/cashier-shift.aggregate";
import { ShiftNotFoundError } from "../../domain/errors";
import { CASHIER_SHIFT_REPOSITORY, type CashierShiftRepositoryPort } from "../../domain/ports/cashier-shift-repository.port";
import { ShiftClosedEvent } from "../../domain/events/shift-closed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface ReviewShiftVarianceCommand {
  shiftId: string;
  decision: "approve" | "acknowledge";
  notes?: string | null;
  reviewerId: string;
}

@Injectable()
export class ReviewShiftVarianceHandler {
  constructor(
    @Inject(CASHIER_SHIFT_REPOSITORY) private readonly shifts: CashierShiftRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: ReviewShiftVarianceCommand): Promise<CashierShift> {
    const shift = await this.shifts.findById(command.shiftId);
    if (!shift) throw new ShiftNotFoundError();

    shift.reviewVariance(command);
    await this.shifts.save(shift);

    // مراجعة acknowledge بتصفّي الفرق (نفس منطق closeShift اللي فرقه جوّه الحد بيتصفّى تلقائيًا) -
    // approve هنا مبسّط عمدًا: بيقفل الشيفت بس من غير ما يربط سلفة موظف حقيقية في الرواتب (مؤجّل،
    // راجع تعليق migration 013). القيد المحاسبي بيترحّل في الحالتين طالما فيه فرق فعلي
    await this.eventBus.publish(new ShiftClosedEvent(shift.id, shift.branchId, shift.cashVariance ?? 0, command.reviewerId));
    return shift;
  }
}
