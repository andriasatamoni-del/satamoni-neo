import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeProfileNotLinkedError, LeaveRequestNotFoundError } from "../../domain/errors";

export interface CancelLeaveRequestCommand {
  userId: string;
  leaveRequestId: string;
}

@Injectable()
export class CancelLeaveRequestHandler {
  constructor(
    @Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: CancelLeaveRequestCommand): Promise<LeaveRequest> {
    const employee = await this.employees.findByUserId(command.userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();

    const request = await this.leaveRequests.findById(command.leaveRequestId);
    // نفس فلسفة الريبو القديم بالظبط: طلب إجازة موظف تاني معناه "مش موجود" بالنسبة للموظف الحالي، مش 403
    if (!request || request.employeeId !== employee.id) throw new LeaveRequestNotFoundError();

    request.cancel();
    await this.leaveRequests.save(request);
    return request;
  }
}
