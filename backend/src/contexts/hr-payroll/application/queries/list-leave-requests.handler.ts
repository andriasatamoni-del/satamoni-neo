import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestListFilter, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListLeaveRequestsHandler {
  constructor(@Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort) {}

  async execute(filter: LeaveRequestListFilter = {}, page?: PageRequest): Promise<{ requests: LeaveRequest[]; total: number }> {
    return this.leaveRequests.list(filter, page);
  }
}
