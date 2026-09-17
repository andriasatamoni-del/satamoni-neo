import type { DriverAttendanceShift } from "../driver-attendance-shift.aggregate";

export interface DriverAttendanceShiftRepositoryPort {
  save(shift: DriverAttendanceShift): Promise<void>;
  findById(id: string): Promise<DriverAttendanceShift | null>;
  findActiveByDriverId(driverId: string): Promise<DriverAttendanceShift | null>;
  list(filter?: { branchId?: string; driverId?: string; status?: string }): Promise<DriverAttendanceShift[]>;
}

export const DRIVER_ATTENDANCE_SHIFT_REPOSITORY = Symbol("DRIVER_ATTENDANCE_SHIFT_REPOSITORY");
