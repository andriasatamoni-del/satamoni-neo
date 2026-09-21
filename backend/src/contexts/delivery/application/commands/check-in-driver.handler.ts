import { Inject, Injectable } from "@nestjs/common";
import { DriverAttendanceShift } from "../../domain/driver-attendance-shift.aggregate";
import {
  DRIVER_ATTENDANCE_SHIFT_REPOSITORY,
  type DriverAttendanceShiftRepositoryPort,
} from "../../domain/ports/driver-attendance-shift-repository.port";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { DriverAttendanceShiftAlreadyActiveError, DriverNotFoundError } from "../../domain/errors";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";

export interface CheckInDriverCommand {
  driverId: string;
  branchId: string;
  checkedInBy?: string | null;
}

// الأجر بالساعة الافتراضي - نفس مفهوم pos_settings.driver_hourly_rate_egp في الريبو القديم بالظبط،
// القيمة الفعلية بتتقرا من Settings context (GetPosSettingsHandler) وقت الدخول، الثابت هنا fallback بس
export const DEFAULT_DRIVER_HOURLY_RATE_EGP = 33;

@Injectable()
export class CheckInDriverHandler {
  constructor(
    @Inject(DRIVER_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: DriverAttendanceShiftRepositoryPort,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort,
    private readonly getPosSettings: GetPosSettingsHandler
  ) {}

  async execute(command: CheckInDriverCommand): Promise<DriverAttendanceShift> {
    if (!(await this.drivers.findById(command.driverId))) throw new DriverNotFoundError();
    if (await this.shifts.findActiveByDriverId(command.driverId)) throw new DriverAttendanceShiftAlreadyActiveError();

    const settings = await this.getPosSettings.execute();
    const shift = DriverAttendanceShift.register({
      driverId: command.driverId,
      branchId: command.branchId,
      checkedInBy: command.checkedInBy,
      hourlyRate: settings.driverHourlyRateEgp,
    });
    await this.shifts.save(shift);
    return shift;
  }
}
