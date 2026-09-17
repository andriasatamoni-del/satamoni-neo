import { Inject, Injectable } from "@nestjs/common";
import { EmployeeAttendanceShift } from "../../domain/employee-attendance-shift.aggregate";
import {
  EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY,
  type EmployeeAttendanceShiftRepositoryPort,
} from "../../domain/ports/employee-attendance-shift-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeAttendanceShiftNotFoundError, EmployeeProfileNotLinkedError } from "../../domain/errors";

export interface CheckOutEmployeeCommand {
  userId: string;
  shiftId: string;
  notes?: string | null;
}

@Injectable()
export class CheckOutEmployeeHandler {
  constructor(
    @Inject(EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY) private readonly shifts: EmployeeAttendanceShiftRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: CheckOutEmployeeCommand): Promise<EmployeeAttendanceShift> {
    const employee = await this.employees.findByUserId(command.userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();

    const shift = await this.shifts.findById(command.shiftId);
    if (!shift || shift.employeeId !== employee.id) throw new EmployeeAttendanceShiftNotFoundError();

    shift.checkOut({ notes: command.notes });
    await this.shifts.save(shift);
    return shift;
  }
}
