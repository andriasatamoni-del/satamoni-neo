import { Inject, Injectable } from "@nestjs/common";
import { DriverAttendanceShift } from "../../domain/driver-attendance-shift.aggregate";
import {
  DRIVER_ATTENDANCE_SHIFT_REPOSITORY,
  type DriverAttendanceShiftRepositoryPort,
} from "../../domain/ports/driver-attendance-shift-repository.port";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";
import { DriverAttendanceShiftNotFoundError } from "../../domain/errors";
import { DriverAttendanceShiftClosedEvent } from "../../domain/events/driver-attendance-shift-closed.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { DRIVER_ORDER_BONUS_EGP } from "../../domain/driver-bonus-policy";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface CheckOutDriverCommand {
  shiftId: string;
  checkedOutBy?: string | null;
  notes?: string | null;
}

@Injectable()
export class CheckOutDriverHandler {
  constructor(
    @Inject(DRIVER_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: DriverAttendanceShiftRepositoryPort,
    @Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1: one transaction per business command - the state change, its side effects and the critical event
  // subscribers (accounting posting) commit or roll back together.
  async execute(command: CheckOutDriverCommand): Promise<DriverAttendanceShift> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: CheckOutDriverCommand): Promise<DriverAttendanceShift> {
    await this.tx.lockRow("driver_attendance_shifts", command.shiftId); // serialise concurrent identical commands; later ones see the new state and are rejected
    const shift = await this.shifts.findById(command.shiftId);
    if (!shift) throw new DriverAttendanceShiftNotFoundError();

    // بونص الشيفت = عدد الطلبات المُسلَّمة (لنفس السائق) وقت ما الشيفت كان شغال × البونص الثابت -
    // نفس فلسفة الريبو القديم بالظبط (Σ calcDriverOrderBonus على أي طلب اتسلّم جوّه [checked_in_at,
    // checked_out_at]، بغض النظر عن طريقة الدفع أو التسوية)
    const deliveredDuringShift = (await this.assignments.list({ driverId: shift.driverId })).filter(
      (a) => a.status === "DELIVERED" && a.deliveredAt && a.deliveredAt >= shift.checkedInAt
    );
    const bonusTotal = deliveredDuringShift.length * DRIVER_ORDER_BONUS_EGP;

    shift.checkOut({ checkedOutBy: command.checkedOutBy ?? null, bonusTotal, notes: command.notes });
    await this.shifts.save(shift);

    if ((shift.totalPay ?? 0) > 0) {
      await this.eventBus.publish(
        new DriverAttendanceShiftClosedEvent(shift.id, shift.branchId, shift.totalPay ?? 0, command.checkedOutBy ?? null)
      );
    }
    return shift;
  }
}
