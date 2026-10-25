import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { EmployeeAttendanceShift } from "../employee-attendance-shift.aggregate";

export interface EmployeeAttendanceShiftRepositoryPort {
  save(shift: EmployeeAttendanceShift): Promise<void>;
  findById(id: string): Promise<EmployeeAttendanceShift | null>;
  findActiveByEmployeeId(employeeId: string): Promise<EmployeeAttendanceShift | null>;
  list(filter?: { employeeId?: string }): Promise<EmployeeAttendanceShift[]>;
  listPage(filter?: { employeeId?: string }, page?: PageRequest): Promise<{ rows: EmployeeAttendanceShift[]; total: number }>;
}

export const EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY = Symbol("EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY");
