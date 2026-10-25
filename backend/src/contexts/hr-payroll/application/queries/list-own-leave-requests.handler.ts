import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
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

  async execute(userId: string, page?: PageRequest): Promise<{ requests: LeaveRequest[]; total: number }> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();
    return this.leaveRequests.list({ employeeId: employee.id }, page);
  }
}
