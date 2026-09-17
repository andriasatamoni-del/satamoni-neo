import type { EmployeeAttendanceShift } from "../employee-attendance-shift.aggregate";

export interface EmployeeAttendanceShiftRepositoryPort {
  save(shift: EmployeeAttendanceShift): Promise<void>;
  findById(id: string): Promise<EmployeeAttendanceShift | null>;
  findActiveByEmployeeId(employeeId: string): Promise<EmployeeAttendanceShift | null>;
  list(filter?: { employeeId?: string }): Promise<EmployeeAttendanceShift[]>;
}

export const EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY = Symbol("EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY");
