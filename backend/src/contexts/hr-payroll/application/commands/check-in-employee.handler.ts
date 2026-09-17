import { Inject, Injectable } from "@nestjs/common";
import { EmployeeAttendanceShift } from "../../domain/employee-attendance-shift.aggregate";
import {
  EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY,
  type EmployeeAttendanceShiftRepositoryPort,
} from "../../domain/ports/employee-attendance-shift-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeAttendanceShiftAlreadyActiveError, EmployeeProfileNotLinkedError } from "../../domain/errors";

export interface CheckInEmployeeCommand {
  userId: string;
  branchId: string;
}

@Injectable()
export class CheckInEmployeeHandler {
  constructor(
    @Inject(EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: EmployeeAttendanceShiftRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: CheckInEmployeeCommand): Promise<EmployeeAttendanceShift> {
    const employee = await this.employees.findByUserId(command.userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();
    if (await this.shifts.findActiveByEmployeeId(employee.id)) throw new EmployeeAttendanceShiftAlreadyActiveError();

    const shift = EmployeeAttendanceShift.register({ employeeId: employee.id, branchId: command.branchId });
    await this.shifts.save(shift);
    return shift;
  }
}
