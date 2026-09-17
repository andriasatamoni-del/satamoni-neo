import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

@Injectable()
export class ListOwnLeaveRequestsHandler {
  constructor(
    @Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(userId: string): Promise<LeaveRequest[]> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();
    return this.leaveRequests.list({ employeeId: employee.id });
  }
}
