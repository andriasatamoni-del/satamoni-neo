import { Inject, Injectable } from "@nestjs/common";
import { DriverAttendanceShift } from "../../domain/driver-attendance-shift.aggregate";
import {
  DRIVER_ATTENDANCE_SHIFT_REPOSITORY,
  type DriverAttendanceShiftRepositoryPort,
} from "../../domain/ports/driver-attendance-shift-repository.port";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { DriverAttendanceShiftAlreadyActiveError, DriverNotFoundError } from "../../domain/errors";

export interface CheckInDriverCommand {
  driverId: string;
  branchId: string;
  checkedInBy?: string | null;
}

// نفس أجر الساعة الافتراضي بالظبط (pos_settings.driver_hourly_rate_egp) في الريبو القديم - ثابت هنا
// عمدًا (مفيش جدول إعدادات لسه)، بيتجمّد في الشيفت وقت الدخول (نفس فلسفة hourly_rate بالظبط)
export const DRIVER_HOURLY_RATE_EGP = 33;

@Injectable()
export class CheckInDriverHandler {
  constructor(
    @Inject(DRIVER_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: DriverAttendanceShiftRepositoryPort,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort
  ) {}

  async execute(command: CheckInDriverCommand): Promise<DriverAttendanceShift> {
    if (!(await this.drivers.findById(command.driverId))) throw new DriverNotFoundError();
    if (await this.shifts.findActiveByDriverId(command.driverId)) throw new DriverAttendanceShiftAlreadyActiveError();

    const shift = DriverAttendanceShift.register({
      driverId: command.driverId,
      branchId: command.branchId,
      checkedInBy: command.checkedInBy,
      hourlyRate: DRIVER_HOURLY_RATE_EGP,
    });
    await this.shifts.save(shift);
    return shift;
  }
}
