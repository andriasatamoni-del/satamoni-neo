import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";

@Injectable()
export class ListLeaveRequestsHandler {
  constructor(@Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort) {}

  async execute(filter?: { employeeId?: string; status?: string }): Promise<LeaveRequest[]> {
    return this.leaveRequests.list(filter);
  }
}
