import { Inject, Injectable } from "@nestjs/common";
import { EmployeeAttendanceShift } from "../../domain/employee-attendance-shift.aggregate";
import {
  EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY,
  type EmployeeAttendanceShiftRepositoryPort,
} from "../../domain/ports/employee-attendance-shift-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

@Injectable()
export class ListOwnAttendanceShiftsHandler {
  constructor(
    @Inject(EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: EmployeeAttendanceShiftRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(userId: string): Promise<EmployeeAttendanceShift[]> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();
    return this.shifts.list({ employeeId: employee.id });
  }
}
