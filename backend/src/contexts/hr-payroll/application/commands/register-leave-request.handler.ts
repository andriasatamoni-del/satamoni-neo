import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

export interface RegisterLeaveRequestCommand {
  userId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
}

@Injectable()
export class RegisterLeaveRequestHandler {
  constructor(
    @Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: RegisterLeaveRequestCommand): Promise<LeaveRequest> {
    const employee = await this.employees.findByUserId(command.userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();

    const request = LeaveRequest.register({
      employeeId: employee.id,
      leaveType: command.leaveType,
      startDate: command.startDate,
      endDate: command.endDate,
      reason: command.reason,
    });
    await this.leaveRequests.save(request);
    return request;
  }
}
