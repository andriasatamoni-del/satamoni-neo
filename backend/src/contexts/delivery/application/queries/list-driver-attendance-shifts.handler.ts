import { Inject, Injectable } from "@nestjs/common";
import { DriverAttendanceShift } from "../../domain/driver-attendance-shift.aggregate";
import {
  DRIVER_ATTENDANCE_SHIFT_REPOSITORY,
  type DriverAttendanceShiftRepositoryPort,
} from "../../domain/ports/driver-attendance-shift-repository.port";

@Injectable()
export class ListDriverAttendanceShiftsHandler {
  constructor(
    @Inject(DRIVER_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: DriverAttendanceShiftRepositoryPort
  ) {}

  execute(filter?: { branchId?: string; driverId?: string; status?: string }): Promise<DriverAttendanceShift[]> {
    return this.shifts.list(filter);
  }
}
